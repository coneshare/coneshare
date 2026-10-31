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
from core.services import get_dynamic_setting

from .models import ShareLink, ShareLinkDataroomSetting

logger = logging.getLogger(__name__)

# Characters that are prohibited on Windows, control characters, or directory traversal separators
INVALID_ZIP_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')


def sanitize_zip_entry_name(name: str, fallback: str = "unnamed") -> str:
    """
    Sanitizes a folder or file name for safe inclusion in a ZIP archive.
    Preserves spaces and valid punctuation (e.g. parentheses, brackets, commas, unicode),
    replaces prohibited characters (/ \\ : * ? " < > | and control chars) with '-',
    strips trailing dots and spaces (problematic on Windows), and avoids
    directory traversal ('.' or '..') without raising SuspiciousFileOperation.
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

    return s


def _get_unique_zip_path(seen_paths: set, folder_path: str, filename: str) -> str:
    """
    Computes a sanitized, unique file path within the ZIP archive using posixpath
    to avoid backslash or directory traversal issues, and disambiguates
    duplicate filenames.
    """
    safe_name = sanitize_zip_entry_name(filename, fallback="unnamed_file")

    stem, ext = posixpath.splitext(safe_name)
    candidate = posixpath.join(folder_path, safe_name) if folder_path else safe_name
    counter = 1
    while candidate in seen_paths:
        disambiguated_name = f"{stem} ({counter}){ext}"
        candidate = posixpath.join(folder_path, disambiguated_name) if folder_path else disambiguated_name
        counter += 1

    seen_paths.add(candidate)
    return candidate


def _get_unique_dir_path(seen_paths: set, parent_path: str, dirname: str) -> str:
    """
    Computes a sanitized, unique directory path within the ZIP archive.
    Preserves spaces and punctuation, and disambiguates duplicate sibling directory names.
    """
    safe_name = sanitize_zip_entry_name(dirname, fallback="folder")
    candidate = posixpath.join(parent_path, safe_name) if parent_path else safe_name
    counter = 1
    while f"{candidate}/" in seen_paths:
        disambiguated_name = f"{safe_name} ({counter})"
        candidate = posixpath.join(parent_path, disambiguated_name) if parent_path else disambiguated_name
        counter += 1

    seen_paths.add(f"{candidate}/")
    return candidate


def _make_raw_file_generator(download_url: str):
    """
    Creates a streaming generator that streams raw chunks directly from the Go file service.
    Using a context manager guarantees that upstream sockets are closed if the client aborts.
    """
    def generator():
        with requests.get(download_url, stream=True, timeout=(5.0, 60.0)) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
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
            max_pages = get_dynamic_setting('MAX_PREVIEW_PAGES') or 50
            if flatten_active and getattr(doc, 'num_pages', 0) and doc.num_pages > max_pages:
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
):
    """
    Wraps a file generator to capture mid-stream exceptions. If an unrecoverable failure
    occurs, logs the error and writes a sanitized error note as a separate ZIP entry
    (<sanitized_name>_error.txt) rather than writing plaintext into the requested file
    entry, avoiding corrupt extensions or half-streamed binary files followed by plaintext.
    Exception type is recorded without raw exception text to prevent leaking internal
    signed URLs or tokens.
    """
    def generator():
        try:
            for chunk in source_gen_fn():
                yield chunk
        except Exception as e:
            logger.error(
                "Failed to stream file '%s' during dataroom archive generation: %s",
                display_name,
                e,
                exc_info=True
            )
            # Mask raw exception string to prevent leaking internal signed tokens/URLs (PR #438 Comment #6)
            error_reason = type(e).__name__
            error_msg = (
                f"[Coneshare Archive Note]\n"
                f"This file ('{display_name}') could not be processed or retrieved.\n"
                f"Reason: {error_reason}\n"
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

    # 1. Bulk-Fetch Hierarchy in 3 Queries
    all_folders = list(DataroomFolder.objects.filter(dataroom=dataroom))
    all_docs = list(
        DataroomDocument.objects.filter(
            dataroom=dataroom,
            document__deleted_at__isnull=True
        ).select_related('document').prefetch_related('document__versions')
    )
    all_settings = list(ShareLinkDataroomSetting.objects.filter(share_link=link))

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
    seen_paths = set()
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
            setting = doc_settings.get(child_doc.id)
            if not setting or not setting.is_visible or not setting.allow_download:
                continue

            doc = child_doc.document
            if not doc:
                continue

            # Per security policy: videos cannot be watermarked on download
            if doc.type == 'video' and setting.enable_watermark:
                continue

            # Use prefetched versions
            primary_version = next((v for v in doc.versions.all() if v.is_primary), None)
            if not primary_version:
                continue

            # Per security policy: documents exceeding watermark size limit cannot be watermarked on download
            if setting.enable_watermark:
                max_watermark_mb = get_dynamic_setting('MAX_WATERMARK_FILE_SIZE_MB') or get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB') or 100
                file_size = primary_version.file_size or getattr(doc, 'file_size', 0) or 0
                if file_size > (max_watermark_mb * 1024 * 1024):
                    logger.warning(
                        "Excluding document '%s' (id=%s) from archive: file size (%s bytes) exceeds maximum watermark limit (%s MB).",
                        doc.name, doc.id, file_size, max_watermark_mb
                    )
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
                final_name = display_name

            unique_file_path = _get_unique_zip_path(seen_paths, current_zip_path, final_name)

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
                    )(),
                    unique_file_path,
                )
                downloadable_count += 1
            elif primary_version.original_storage_key:
                download_url = fileserver_client.generate_download_url(
                    primary_version.original_storage_key, is_internal=True
                )
                gen_fn = _make_raw_file_generator(download_url)
                zs.add(
                    _make_resilient_generator(
                        gen_fn,
                        final_name,
                        zs=zs,
                        seen_paths=seen_paths,
                        current_zip_path=current_zip_path,
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
