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

from core.services import get_dynamic_setting
from .fileserver import fileserver_client
from .models import DocumentVersion, DocumentPage


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


def _extract_links_for_page(pdf_page, page_num):
    """
    Helper to extract and normalize link annotations from a single PDF page.
    """
    media_box = pdf_page.mediabox
    page_w = float(media_box.width) if media_box.width else 0.0
    page_h = float(media_box.height) if media_box.height else 0.0

    links = []
    if page_w <= 0 or page_h <= 0 or "/Annots" not in pdf_page:
        return links

    annots = pdf_page["/Annots"]
    try:
        annots_iter = iter(annots)
    except TypeError:
        logger.warning(f"Page {page_num} annotations object is not iterable.")
        return links

    for annot in annots_iter:
        try:
            obj = annot.get_object()
            if not obj or obj.get("/Subtype") != "/Link" or "/A" not in obj:
                continue

            action = obj["/A"].get_object()
            rect = obj.get("/Rect")
            uri = action.get("/URI") if action and action.get("/S") == "/URI" else None

            if not rect or not uri:
                continue

            # Rect: [v1, v2, v3, v4] (origin at bottom-left).
            # PDF specs allow these coordinates to be written in arbitrary order.
            # We use min/max to normalize coordinates and prevent negative widths/heights.
            v1, v2, v3, v4 = [float(v) for v in rect]
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
