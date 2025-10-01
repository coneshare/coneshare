import os
import tempfile
import subprocess
from pathlib import Path
from io import BytesIO
from celery import shared_task
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile, File
from pdf2image import convert_from_bytes

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
            with default_storage.open(version.original_storage_key, 'rb') as f_in:
                with open(original_file_path, 'wb') as f_out:
                    f_out.write(f_in.read())

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
            
            with open(pdf_path, 'rb') as pdf_file:
                version.storage_key = default_storage.save(new_storage_key, File(pdf_file))

            # 4. Update the document version to point to the new PDF
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
        print(f"Error converting document version {version_id}: {e}")


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
        with default_storage.open(version.storage_key) as pdf_file:
            pdf_bytes = pdf_file.read()

        # 2. Convert PDF pages to images (PNG)
        images = convert_from_bytes(pdf_bytes, fmt='png')

        # 3. Save page images and create DB records
        base_path, _ = os.path.splitext(version.original_storage_key)
        for i, image in enumerate(images):
            page_num = i + 1
            page_storage_key = f"{base_path}_page_{page_num}.png"

            buffer = BytesIO()
            image.save(buffer, format='PNG')
            default_storage.save(page_storage_key, ContentFile(buffer.getvalue()))

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
