from collections import defaultdict
import logging
import os
import posixpath
import re
from typing import Optional, Tuple
from urllib.parse import quote

from django.db.models import Prefetch
import requests
from zipstream import ZipStream

from datarooms.models import DataroomDocument, DataroomFolder
from documents.fileserver import fileserver_client
from core.services import get_dynamic_setting, get_max_watermark_file_size_mb
from esign.vault import is_executed_nda_folder

from .models import NDAAcceptance, ShareLink, ShareLinkDataroomSetting

logger = logging.getLogger(__name__)

# Characters that are prohibited on Windows, control characters, or directory traversal separators
INVALID_ZIP_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')

# Windows DOS reserved device names (case-insensitive, with or without extensions)
WINDOWS_RESERVED_NAMES = frozenset({
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
})


def sanitize_zip_entry_name(name: str, fallback: str = "unnamed") -> str:
    """
    Sanitizes a folder or file name for safe inclusion in a ZIP archive.
    Preserves spaces and valid punctuation (e.g. parentheses, brackets, commas, unicode),
    replaces prohibited characters (/ \\ : * ? " < > | and control chars) with '-',
    strips trailing dots and spaces (problematic on Windows), avoids Windows reserved device
    names (CON, PRN, AUX, NUL, COM1-9, LPT1-9), and avoids directory traversal ('.' or '..')
    without raising SuspiciousFileOperation.
    """
    if not name:
        return fallback

    # Strip surrounding whitespace
    s = str(name).strip()
    # Replace prohibited filesystem and archive characters with hyphen
    s = INVALID_ZIP_CHARS.sub('-', s)
    # Windows does not permit trailing dots or spaces
    s = s.rstrip('. ')

    # Guard against traversal characters or empty string
    if not s or s in {'.', '..'}:
        return fallback

    # Guard against Windows reserved device names (e.g. CON, aux.pdf, COM1.txt)
    stem = s.split('.')[0]
    if stem.upper() in WINDOWS_RESERVED_NAMES:
        s = f"_{s}"

    return s


def _get_unique_zip_path(seen_paths: set, folder_path: str, filename: str) -> str:
    """
    Computes a sanitized, unique file path within the ZIP archive using posixpath
    to avoid backslash or directory traversal issues, and disambiguates
    duplicate filenames as well as collisions with directory names.
    """
    safe_name = sanitize_zip_entry_name(filename, fallback="unnamed_file")

    stem, ext = posixpath.splitext(safe_name)
    candidate = posixpath.join(folder_path, safe_name) if folder_path else safe_name
    counter = 1
    while candidate in seen_paths or f"{candidate}/" in seen_paths:
        disambiguated_name = f"{stem} ({counter}){ext}"
        candidate = posixpath.join(folder_path, disambiguated_name) if folder_path else disambiguated_name
        counter += 1

    seen_paths.add(candidate)
    return candidate


def _get_unique_dir_path(seen_paths: set, parent_path: str, dirname: str) -> str:
    """
    Computes a sanitized, unique directory path within the ZIP archive.
    Preserves spaces and punctuation, and disambiguates duplicate sibling directory names
    as well as collisions with file names.
    """
    safe_name = sanitize_zip_entry_name(dirname, fallback="folder")
    candidate = posixpath.join(parent_path, safe_name) if parent_path else safe_name
    counter = 1
    while candidate in seen_paths or f"{candidate}/" in seen_paths:
        disambiguated_name = f"{safe_name} ({counter})"
        candidate = posixpath.join(parent_path, disambiguated_name) if parent_path else disambiguated_name
        counter += 1

    seen_paths.add(f"{candidate}/")
    return candidate


def _make_raw_file_generator(download_url: str, expected_size: Optional[int] = None):
    """
    Creates a streaming generator that streams raw chunks directly from the Go file service.
    Using a context manager guarantees that upstream sockets are closed if the client aborts.
    Verifies that the total bytes received match Content-Length (or expected_size) to detect
    silent truncation.
    """
    def generator():
        with requests.get(download_url, stream=True, timeout=(5.0, 60.0)) as resp:
            resp.raise_for_status()
            content_length_header = resp.headers.get('Content-Length')
            target_size = None
            if content_length_header and content_length_header.isdigit():
                target_size = int(content_length_header)
            elif expected_size is not None:
                target_size = expected_size

            bytes_received = 0
            for chunk in resp.iter_content(chunk_size=64 * 1024):
                if chunk:
                    bytes_received += len(chunk)
                    yield chunk

            if target_size is not None and bytes_received < target_size:
                raise IOError(f"File transfer truncated: received {bytes_received} of {target_size} bytes.")
    return generator


def _make_watermarked_file_generator(doc, primary_version, watermark_text, request, viewer_email):
    """
    Creates a generator that renders a watermarked image or PDF on-the-fly and yields its buffer.
    Pillow Image objects and BytesIO buffers are explicitly closed in finally blocks.
    """
    # Deferred imports to prevent circular dependency with sharelinks.views
    from .views import (
        _generate_watermarked_image,
        _generate_watermarked_pdf,
        _generate_flattened_watermarked_pdf,
    )

    def generator():
        if doc.type == 'image':
            image_buffer, _ = _generate_watermarked_image(
                doc, primary_version, watermark_text, request, viewer_email
            )
            try:
                yield image_buffer.getvalue()
            finally:
                image_buffer.close()
        else:
            flatten_active = get_dynamic_setting('FLATTEN_WATERMARKED_DOWNLOADS')
            max_pages = get_dynamic_setting('MAX_PREVIEW_PAGES')
            known_pages = getattr(primary_version, 'num_pages', None) or getattr(doc, 'num_pages', None)
            if flatten_active and known_pages and max_pages is not None and known_pages > max_pages:
                flatten_active = False

            if flatten_active:
                pdf_buffer = _generate_flattened_watermarked_pdf(
                    doc, primary_version, watermark_text, request, viewer_email
                )
            else:
                pdf_buffer = _generate_watermarked_pdf(
                    doc, primary_version, watermark_text, request, viewer_email
                )
            try:
                yield pdf_buffer.getvalue()
            finally:
                pdf_buffer.close()
    return generator


def _make_resilient_generator(
    source_gen_fn,
    display_name: str,
    zs: Optional[ZipStream] = None,
    seen_paths: Optional[set] = None,
    current_zip_path: str = "",
    expected_size: Optional[int] = None,
):
    """
    Wraps a file generator to capture mid-stream exceptions. If an unrecoverable failure
    occurs, logs the error and writes a sanitized error note as a separate ZIP entry
    (<sanitized_name>_error.txt). If the error occurs before any bytes are streamed,
    a 0-byte file entry remains alongside the error note. If an error occurs mid-stream
    after partial bytes were written, the error note explicitly records that the file
    entry is truncated, warning users and preventing silent file corruption.
    Exception type is recorded without raw exception text to prevent leaking internal
    signed URLs or tokens.
    """
    def generator():
        bytes_yielded = 0
        try:
            for chunk in source_gen_fn():
                bytes_yielded += len(chunk)
                yield chunk
        except Exception as e:
            # Mask raw exception string and omit exc_info to prevent leaking internal signed tokens/URLs (PR #438 Comment #5 & #6)
            error_reason = type(e).__name__
            logger.error(
                "Failed to stream file '%s' during dataroom archive generation: %s",
                display_name,
                error_reason
            )
            if bytes_yielded > 0:
                truncation_info = f" Transfer was interrupted mid-stream after {bytes_yielded} bytes."
                if expected_size:
                    truncation_info += f" Expected {expected_size} bytes."
            else:
                truncation_info = " No bytes could be retrieved."

            error_msg = (
                f"[Coneshare Archive Note]\n"
                f"This file ('{display_name}') could not be processed or retrieved.\n"
                f"Reason: {error_reason}.{truncation_info}\n"
            )

            # Write archive errors to separate entries
            if zs is not None:
                stem = posixpath.splitext(display_name)[0] or display_name
                safe_stem = sanitize_zip_entry_name(stem, fallback="file")
                error_entry_name = f"{safe_stem}_error.txt"
                if seen_paths is not None:
                    error_entry_path = _get_unique_zip_path(seen_paths, current_zip_path, error_entry_name)
                else:
                    error_entry_path = posixpath.join(current_zip_path, error_entry_name) if current_zip_path else error_entry_name
                zs.add(error_msg.encode('utf-8'), error_entry_path)
                return
            else:
                yield error_msg.encode('utf-8')
    return generator


def generate_dataroom_archive_stream(
    link: ShareLink,
    request,
    viewer_email: str,
    root_folder: Optional[DataroomFolder] = None,
) -> Tuple[ZipStream, int]:
    """
    Generates a low-memory HTTP streaming ZIP archive for a whole dataroom or a single dataroom folder.

    Bulk-fetches all hierarchy rows in 3 queries, builds the folder tree in Python memory,
    respects link visibility & download permissions, safely handles watermarking and raw streaming,
    and returns (ZipStream, downloadable_item_count).
    """
    from .views import get_effective_watermark_text

    dataroom = link.dataroom
    if not dataroom:
        return ZipStream(), 0
    if root_folder and is_executed_nda_folder(root_folder):
        return ZipStream(), 0

    # 1. Bulk-Fetch Hierarchy in 3 Queries
    all_folders = list(DataroomFolder.objects.filter(dataroom=dataroom))
    all_docs = list(
        DataroomDocument.objects.filter(
            dataroom=dataroom,
            document__deleted_at__isnull=True
        ).select_related('document').prefetch_related('document__versions')
    )
    all_settings = list(ShareLinkDataroomSetting.objects.filter(share_link=link))
    executed_nda_doc_ids = set(
        NDAAcceptance.objects.filter(vault_dataroom_document__dataroom=dataroom)
        .values_list('vault_dataroom_document_id', flat=True)
    )

    folders_by_id = {f.id: f for f in all_folders}

    def _folder_is_excluded_nda(f_obj: DataroomFolder) -> bool:
        names: list[str] = []
        curr: Optional[DataroomFolder] = f_obj
        visited = set()
        while curr and curr.id not in visited:
            visited.add(curr.id)
            names.append((curr.name or '').strip())
            curr = folders_by_id.get(curr.parent_id) if curr.parent_id else None
        top_down = list(reversed(names))
        return len(top_down) >= 2 and top_down[0] == 'Executed' and top_down[1] == 'NDAs'

    excluded_nda_folder_ids = {f.id for f in all_folders if _folder_is_excluded_nda(f)}

    # 2. Index settings and tree relationships in-memory
    folder_settings = {}
    doc_settings = {}
    for s in all_settings:
        if s.dataroom_folder_id:
            folder_settings[s.dataroom_folder_id] = s
        if s.dataroom_document_id:
            doc_settings[s.dataroom_document_id] = s

    folders_by_parent = defaultdict(list)
    for f in all_folders:
        folders_by_parent[f.parent_id].append(f)

    docs_by_folder = defaultdict(list)
    for d in all_docs:
        docs_by_folder[d.folder_id].append(d)

    zs = ZipStream()
    seen_paths: set[str] = set()
    visited_folder_ids = set()
    downloadable_count = 0
    effective_watermark_text = get_effective_watermark_text(link)

    # Determine base archive root directory
    if root_folder:
        archive_root_name = sanitize_zip_entry_name(root_folder.name, fallback="folder")
    else:
        archive_root_name = sanitize_zip_entry_name(dataroom.name, fallback=f"dataroom_{link.slug}")

    def process_folder_scope(folder_id: Optional[str], current_zip_path: str):
        nonlocal downloadable_count

        # Process child folders
        for child_folder in folders_by_parent.get(folder_id, []):
            if child_folder.id in excluded_nda_folder_ids:
                continue
            if child_folder.id in visited_folder_ids:
                logger.warning("Detected folder cycle at child_folder_id=%s, skipping recursion.", child_folder.id)
                continue
            visited_folder_ids.add(child_folder.id)

            setting = folder_settings.get(child_folder.id)
            if not setting or not setting.is_visible or not setting.allow_download:
                continue

            child_zip_path = _get_unique_dir_path(seen_paths, current_zip_path, child_folder.name)
            dir_entry_path = f"{child_zip_path}/"
            zs.add(b"", dir_entry_path)

            # Recurse into child folder with disambiguated child_zip_path
            process_folder_scope(child_folder.id, child_zip_path)

        # Process documents in this folder scope
        for child_doc in docs_by_folder.get(folder_id, []):
            if child_doc.id in executed_nda_doc_ids or child_doc.folder_id in excluded_nda_folder_ids:
                continue
            setting = doc_settings.get(child_doc.id)
            if not setting or not setting.is_visible or not setting.allow_download:
                continue

            doc = child_doc.document
            if not doc:
                continue

            # Use prefetched versions
            primary_version = next((v for v in doc.versions.all() if v.is_primary), None)
            if not primary_version:
                continue

            # Per security policy: documents that cannot be watermarked must not be downloaded when watermark is enabled
            if setting.enable_watermark:
                is_watermarkable = (
                    (doc.type in {'image', 'pdf'} and bool(primary_version.storage_key or primary_version.original_storage_key)) or
                    (doc.type == 'document' and bool(primary_version.storage_key))
                )
                if not is_watermarkable:
                    continue

                max_watermark_mb = get_max_watermark_file_size_mb()
                file_size = primary_version.file_size or getattr(doc, 'file_size', 0) or 0
                if file_size > (max_watermark_mb * 1024 * 1024):
                    logger.warning(
                        "Excluding document '%s' (id=%s) from archive: file size (%s bytes) exceeds maximum watermark limit (%s MB).",
                        doc.name, doc.id, file_size, max_watermark_mb
                    )
                    continue
            else:
                if not primary_version.original_storage_key:
                    continue

            display_name = child_doc.name or doc.name or "document"
            target_ext = posixpath.splitext(display_name)[1]

            # Adjust extension for watermarked image/document
            if setting.enable_watermark:
                if doc.type == 'image':
                    target_ext = '.jpg'
                else:
                    target_ext = '.pdf'
                base_stem = posixpath.splitext(display_name)[0]
                final_name = f"{base_stem}{target_ext}"
            else:
                version_fn = primary_version.get_filename()
                version_ext = posixpath.splitext(version_fn)[1]
                if version_ext and target_ext != version_ext:
                    base_stem = posixpath.splitext(display_name)[0]
                    final_name = f"{base_stem}{version_ext}"
                else:
                    final_name = display_name

            unique_file_path = _get_unique_zip_path(seen_paths, current_zip_path, final_name)

            file_expected_size = primary_version.file_size or getattr(doc, 'file_size', None)

            if setting.enable_watermark:
                gen_fn = _make_watermarked_file_generator(
                    doc, primary_version, effective_watermark_text, request, viewer_email
                )
                zs.add(
                    _make_resilient_generator(
                        gen_fn,
                        final_name,
                        zs=zs,
                        seen_paths=seen_paths,
                        current_zip_path=current_zip_path,
                        expected_size=file_expected_size,
                    )(),
                    unique_file_path,
                )
                downloadable_count += 1
            else:
                download_url = fileserver_client.generate_download_url(
                    primary_version.original_storage_key, is_internal=True
                )
                gen_fn = _make_raw_file_generator(download_url, expected_size=file_expected_size)
                zs.add(
                    _make_resilient_generator(
                        gen_fn,
                        final_name,
                        zs=zs,
                        seen_paths=seen_paths,
                        current_zip_path=current_zip_path,
                        expected_size=file_expected_size,
                    )(),
                    unique_file_path,
                )
                downloadable_count += 1

    # Execute tree walk
    if root_folder:
        # Check root folder setting
        root_setting = folder_settings.get(root_folder.id)
        if not root_setting or not root_setting.is_visible or not root_setting.allow_download:
            return zs, 0

        # Create root folder entry in ZIP
        root_dir_entry = f"{archive_root_name}/"
        seen_paths.add(root_dir_entry)
        zs.add(b"", root_dir_entry)

        process_folder_scope(root_folder.id, archive_root_name)
    else:
        # For whole dataroom, add outer container directory
        root_dir_entry = f"{archive_root_name}/"
        seen_paths.add(root_dir_entry)
        zs.add(b"", root_dir_entry)

        # Process top-level items (folder_id=None)
        process_folder_scope(None, archive_root_name)

    return zs, downloadable_count
