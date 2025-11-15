import logging
import os
import tempfile
import subprocess
import requests
from pathlib import Path
from io import BytesIO
from celery import shared_task
from pdf2image import convert_from_bytes

from .fileserver import fileserver_client
from .models import DocumentVersion, DocumentPage


@shared_task
def convert_office_to_pdf_task(version_id):
    """
    Converts an office document (e.g., .docx, .pptx) to a PDF.
    This is the first stage in a two-stage processing pipeline.
    """
    try:
        version = DocumentVersion.objects.select_related('document').get(id=version_id)
        document = version.document

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
            version.save()
            
            # 5. Trigger the next stage of processing
            generate_pdf_pages_task.delay(version.id)

    except DocumentVersion.DoesNotExist:
        return
    except Exception as e:
        if 'document' in locals():
            document.status = 'error'
            document.save()
        logging.error(f"Error converting document version {version_id}: {e}")


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
        # 1. Fetch PDF from storage
        download_url = fileserver_client.generate_download_url(version.storage_key)
        response = requests.get(download_url)
        response.raise_for_status()
        pdf_bytes = response.content

        # 2. Convert PDF pages to images (PNG)
        images = convert_from_bytes(pdf_bytes, fmt='png')

        # 3. Save page images and create DB records
        base_path, _ = os.path.splitext(version.original_storage_key)
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
                storage_key=page_storage_key
            )

        # 4. Finalize status and metadata
        num_pages = len(images)
        version.num_pages = num_pages
        version.has_pages = True
        version.is_primary = True  # This is the first version
        version.save()

        document.num_pages = num_pages
        document.storage_key = version.storage_key
        document.status = 'ready'
        document.save()

    except Exception as e:
        # Basic error handling: mark document as failed and log
        if 'document' in locals():
            document.status = 'error'
            document.save()
        # Consider more robust logging in a real application
        print(f"Error processing document version {version_id}: {e}")
