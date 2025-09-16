import os
from io import BytesIO
from celery import shared_task
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from pdf2image import convert_from_bytes

from .models import DocumentVersion, DocumentPage


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
        with default_storage.open(version.original_storage_key) as pdf_file:
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
