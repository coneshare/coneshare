import logging
import os
import tempfile
import subprocess
import requests
from pathlib import Path
from io import BytesIO
from celery import shared_task
from pdf2image import convert_from_bytes, pdfinfo_from_bytes
from pypdf import PdfReader

from datetime import timedelta
from django.utils import timezone
from django.db.models import Q

from core.services import get_dynamic_setting
from .fileserver import fileserver_client
from .models import Document, DocumentPage, DocumentVersion, Folder


logger = logging.getLogger('tasks')


@shared_task
def convert_office_to_pdf_task(version_id):
    """
    Converts an office document (e.g., .docx, .pptx) to a PDF.
    This is the first stage in a two-stage processing pipeline.
    """
    try:
        version = DocumentVersion.objects.select_related('document').get(id=version_id)
        document = version.document

        if version.has_pages:
            version.render_status = DocumentVersion.RENDER_READY
            version.render_error = ''
            version.save(update_fields=['render_status', 'render_error', 'updated_at'])
            return

        version.render_status = DocumentVersion.RENDER_PROCESSING
        version.render_error = ''
        version.save(update_fields=['render_status', 'render_error', 'updated_at'])

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            
            original_file_name = Path(version.original_storage_key).name
            original_file_path = temp_dir_path / original_file_name

            # 1. Download original file from storage
            download_url = fileserver_client.generate_download_url(version.original_storage_key)
            response = requests.get(download_url, stream=True)
            response.raise_for_status()
            with open(original_file_path, 'wb') as f_out:
                for chunk in response.iter_content(chunk_size=8192):
                    f_out.write(chunk)

            # 2. Convert to PDF using LibreOffice
            subprocess.run(
                ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", temp_dir, original_file_path],
                check=True, timeout=300  # 5 minute timeout
            )
            
            pdf_path = temp_dir_path / f"{original_file_path.stem}.pdf"
            if not pdf_path.exists():
                raise FileNotFoundError("LibreOffice did not create a PDF file.")

            # 3. Upload new PDF to storage
            base_path, _ = os.path.splitext(version.original_storage_key)
            new_storage_key = f"{base_path}.pdf"

            upload_url = fileserver_client.generate_upload_url(new_storage_key)
            with open(pdf_path, 'rb') as pdf_file:
                upload_response = requests.put(upload_url, data=pdf_file)
                upload_response.raise_for_status()

            # 4. Update the document version to point to the new PDF
            version.storage_key = new_storage_key
            version.content_type = 'application/pdf'
            version.type = 'pdf'
            version.save(update_fields=['storage_key', 'content_type', 'type', 'updated_at'])
            
            # 5. Trigger the next stage of processing
            generate_pdf_pages_task.delay(version.id)

    except DocumentVersion.DoesNotExist:
        return
    except Exception as e:
        if 'version' in locals():
            version.render_status = DocumentVersion.RENDER_FAILED
            version.render_error = str(e)[:1000]
            version.save(update_fields=['render_status', 'render_error', 'updated_at'])
        logger.error(f"Error converting document version {version_id}: {e}")


def _resolve_pdf_object(obj):
    # NOTE: We use id() as a best-effort cycle guard. CPython may reuse addresses
    # for collected objects, but the while-loop's resolved-is-obj identity check
    # provides a secondary safety net.
    visited = set()
    while hasattr(obj, "get_object"):
        obj_id = id(obj)
        if obj_id in visited:
            break
        visited.add(obj_id)
        resolved = obj.get_object()
        if resolved is obj:
            break
        obj = resolved
    return obj


def _extract_links_for_page(pdf_page, page_num):
    """
    Helper to extract and normalize link annotations from a single PDF page.
    """
    media_box = pdf_page.mediabox
    page_w = float(media_box.width) if media_box.width else 0.0
    page_h = float(media_box.height) if media_box.height else 0.0

    links = []
    if page_w <= 0 or page_h <= 0:
        return links

    annots_obj = _resolve_pdf_object(pdf_page.get("/Annots"))
    if not annots_obj:
        return links

    try:
        annots_iter = iter(annots_obj)
    except TypeError:
        logger.warning(f"Page {page_num} annotations object is not iterable.")
        return links

    for annot in annots_iter:
        try:
            obj = _resolve_pdf_object(annot)
            if not obj or _resolve_pdf_object(obj.get("/Subtype")) != "/Link":
                continue

            action = _resolve_pdf_object(obj.get("/A"))
            rect = _resolve_pdf_object(obj.get("/Rect"))
            uri = None
            if action and _resolve_pdf_object(action.get("/S")) == "/URI":
                uri_obj = _resolve_pdf_object(action.get("/URI"))
                if isinstance(uri_obj, bytes):
                    uri = uri_obj.decode("utf-8", errors="ignore")
                elif isinstance(uri_obj, str):
                    uri = uri_obj

            if not rect or not uri:
                continue

            # Rect: [v1, v2, v3, v4] (origin at bottom-left).
            # PDF specs allow these coordinates to be written in arbitrary order.
            # We use min/max to normalize coordinates and prevent negative widths/heights.
            rect_values = [float(_resolve_pdf_object(v)) for v in rect]
            v1, v2, v3, v4 = rect_values
            x1 = min(v1, v3)
            y1 = min(v2, v4)
            x2 = max(v1, v3)
            y2 = max(v2, v4)

            links.append({
                "url": uri,
                "bbox": {
                    "left": (x1 / page_w) * 100,
                    "top": ((page_h - y2) / page_h) * 100,
                    "width": ((x2 - x1) / page_w) * 100,
                    "height": ((y2 - y1) / page_h) * 100
                }
            })
        except Exception as annot_err:
            logger.warning(f"Error parsing annot for link on page {page_num}: {annot_err}")

    return links


@shared_task
def generate_pdf_pages_task(version_id):
    """
    A Celery task to process a PDF file from a DocumentVersion, extract its pages
    as images, and save them to storage.
    """
    try:
        version = DocumentVersion.objects.select_related('document').get(id=version_id)
        document = version.document
    except DocumentVersion.DoesNotExist:
        return  # Or log an error

    try:
        if version.has_pages:
            version.render_status = DocumentVersion.RENDER_READY
            version.render_error = ''
            version.save(update_fields=['render_status', 'render_error', 'updated_at'])
            return

        version.render_status = DocumentVersion.RENDER_PROCESSING
        version.render_error = ''
        version.save(update_fields=['render_status', 'render_error', 'updated_at'])

        # 1. Fetch PDF from storage
        download_url = fileserver_client.generate_download_url(version.storage_key)
        response = requests.get(download_url)
        response.raise_for_status()
        pdf_bytes = response.content

        # Get page count before full conversion
        info = pdfinfo_from_bytes(pdf_bytes, timeout=60)
        page_count = info.get("Pages", 0)

        max_pages = get_dynamic_setting('MAX_PREVIEW_PAGES')
        if page_count > max_pages:
            version.refresh_from_db(fields=['is_primary'])
            version.num_pages = page_count
            version.render_status = DocumentVersion.RENDER_FAILED
            version.render_error = "Document has too many pages to generate a preview."
            version.save(update_fields=['num_pages', 'render_status', 'render_error', 'updated_at'])

            if version.is_primary:
                document.status = 'ready'
                document.num_pages = page_count
                document.status_message = "Document has too many pages to generate a preview."
                document.save(update_fields=['status', 'num_pages', 'status_message', 'updated_at'])

            logger.info(f"Skipping page generation for document {document.id}, page count ({page_count}) > {max_pages}.")
            return

        # 2. Convert PDF pages to images (PNG)
        images = convert_from_bytes(pdf_bytes, fmt='png')

        # Extract links using pypdf (best-effort)
        # We wrap the entire block in a single outer try-except. This catches document-level parsing
        # issues (e.g. invalid PDF header on PdfReader initialization, or metadata index errors)
        # and lets the task fallback gracefully to rendering page JPEGs without crashing.
        page_links_by_num = {}
        try:
            reader = PdfReader(BytesIO(pdf_bytes))
            num_pdf_pages = len(reader.pages)
            for idx in range(num_pdf_pages):
                page_num = idx + 1
                try:
                    pdf_page = reader.pages[idx]
                    links = _extract_links_for_page(pdf_page, page_num)
                    if links:
                        page_links_by_num[page_num] = {"links": links}
                except Exception as page_err:
                    logger.warning(f"Error extracting links from page {page_num}: {page_err}")
        except Exception as reader_err:
            logger.warning(f"Failed to parse PDF annotations/links via pypdf: {reader_err}")

        # 3. Save page images and create DB records
        base_path, _ = os.path.splitext(version.original_storage_key)
        version.pages.all().delete()
        for i, image in enumerate(images):
            page_num = i + 1
            page_storage_key = f"{base_path}_page_{page_num}.png"

            buffer = BytesIO()
            image.save(buffer, format='PNG')
            
            upload_url = fileserver_client.generate_upload_url(page_storage_key)
            upload_response = requests.put(upload_url, data=buffer.getvalue())
            upload_response.raise_for_status()

            DocumentPage.objects.create(
                document_version=version,
                page_number=page_num,
                storage_key=page_storage_key,
                page_links=page_links_by_num.get(page_num, {"links": []})
            )

        # 4. Finalize status and metadata
        num_pages = len(images)
        version.refresh_from_db(fields=['is_primary'])
        version.num_pages = num_pages
        version.has_pages = True
        version.render_status = DocumentVersion.RENDER_READY
        version.render_error = ''
        version.save(update_fields=[
            'num_pages', 'has_pages', 'render_status', 'render_error', 'updated_at'
        ])

        if version.is_primary:
            document.num_pages = num_pages
            document.storage_key = version.storage_key
            document.status = 'ready'
            document.status_message = ''
            document.save(update_fields=[
                'num_pages', 'storage_key', 'status', 'status_message', 'updated_at'
            ])

    except Exception as e:
        version.render_status = DocumentVersion.RENDER_FAILED
        version.render_error = str(e)[:1000]
        version.save(update_fields=['render_status', 'render_error', 'updated_at'])
        # Consider more robust logging in a real application
        logger.error(f"Error processing document version {version_id}: {e}")


@shared_task
def generate_video_stream_task(version_id):
    """
    A Celery task to process an uploaded video file, transcode/segment it into
    HLS format, and save the playlist and segments to the file system.
    """
    try:
        version = DocumentVersion.objects.select_related('document').get(id=version_id)
        document = version.document
    except DocumentVersion.DoesNotExist:
        return

    try:
        if version.render_status == DocumentVersion.RENDER_READY:
            return

        version.render_status = DocumentVersion.RENDER_PROCESSING
        version.render_error = ''
        version.save(update_fields=['render_status', 'render_error', 'updated_at'])

        # 1. Fetch original video from storage
        download_url = fileserver_client.generate_download_url(version.original_storage_key)

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            original_file_name = Path(version.original_storage_key).name
            original_file_path = temp_dir_path / original_file_name

            with requests.get(download_url, stream=True) as response:
                response.raise_for_status()
                with open(original_file_path, 'wb') as f_out:
                    for chunk in response.iter_content(chunk_size=8192):
                        f_out.write(chunk)

            # 2. Extract duration of the video using ffprobe
            d_probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(original_file_path)],
                capture_output=True, text=True, check=True
            )
            duration = int(float(d_probe.stdout.strip()))

            # 3. Detect codecs for H.264 / AAC compatibility
            v_probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", str(original_file_path)],
                capture_output=True, text=True, check=True
            )
            v_codec = v_probe.stdout.strip()

            a_probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", str(original_file_path)],
                capture_output=True, text=True, check=False
            )
            a_codec = a_probe.stdout.strip()

            # 4. Formulate the ffmpeg command.
            # If web-safe, use copy codec; otherwise transcode.
            playlist_name = "playlist.m3u8"
            ffmpeg_cmd = ["nice", "-n", "19", "ffmpeg", "-i", str(original_file_path)]

            if v_codec == 'h264' and a_codec in ('aac', 'mp3', ''):
                ffmpeg_cmd += ["-codec", "copy"]
            else:
                ffmpeg_cmd += ["-vcodec", "libx264", "-acodec", "aac"]

            # HLS segmenting options
            ffmpeg_cmd += [
                "-start_number", "0",
                "-hls_time", "10",
                "-hls_list_size", "0",
                "-f", "hls",
                str(temp_dir_path / playlist_name)
            ]

            subprocess.run(ffmpeg_cmd, check=True, timeout=900)  # 15 min timeout max for video encoding

            # 5. Save output HLS files (.m3u8 and .ts) to local file server
            base_path, _ = os.path.splitext(version.original_storage_key)
            hls_prefix = f"{base_path}_hls"

            # Scan the temporary directory for generated HLS files
            for file_path in temp_dir_path.iterdir():
                if not file_path.is_file():
                    continue
                if file_path.name == original_file_name:
                    continue  # skip input file
                
                # The output file storage key
                storage_key = f"{hls_prefix}/{file_path.name}"
                upload_url = fileserver_client.generate_upload_url(storage_key)
                
                with open(file_path, 'rb') as f_in:
                    upload_response = requests.put(upload_url, data=f_in)
                    upload_response.raise_for_status()

            # 6. Update database record
            version.refresh_from_db(fields=['is_primary'])
            version.storage_key = f"{hls_prefix}/{playlist_name}"
            version.length = duration
            version.render_status = DocumentVersion.RENDER_READY
            version.render_error = ''
            version.save(update_fields=['storage_key', 'length', 'render_status', 'render_error', 'updated_at'])

            if version.is_primary:
                document.storage_key = version.storage_key
                document.status = 'ready'
                document.status_message = ''
                document.save(update_fields=['storage_key', 'status', 'status_message', 'updated_at'])

    except Exception as e:
        logger.error(f"Error processing video version {version_id}: {e}")
        try:
            version.render_status = DocumentVersion.RENDER_FAILED
            version.render_error = str(e)[:1000]
            version.save(update_fields=['render_status', 'render_error', 'updated_at'])
        except Exception:
            pass


@shared_task
def purge_expired_trash_documents_task():
    """
    Daily Celery task to permanently purge soft-deleted items that have been
    in the trash for more than 30 days.
    """
    # Inline import required here to prevent circular import loop with documents.services
    from .services import delete_document_and_files, delete_folder_and_contents

    threshold = timezone.now() - timedelta(days=30)

    expired_folders = Folder.objects.deleted().filter(
        deleted_at__lt=threshold
    ).filter(
        Q(parent__isnull=True) | Q(parent__deleted_at__isnull=True)
    )
    for folder in list(expired_folders):
        try:
            delete_folder_and_contents(folder)
        except Exception as e:
            logger.error(f"Failed to auto-purge expired folder {folder.id}: {e}")

    expired_docs = Document.objects.deleted().filter(
        deleted_at__lt=threshold
    ).filter(
        Q(folder__isnull=True) | Q(folder__deleted_at__isnull=True)
    )
    for doc in list(expired_docs):
        try:
            delete_document_and_files(doc)
        except Exception as e:
            logger.error(f"Failed to auto-purge expired document {doc.id}: {e}")

