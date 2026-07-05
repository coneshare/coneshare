import logging
from celery import shared_task
from django.conf import settings

from documents.models import Document
from documents.services import process_imported_file
from .models import CloudConnection
from .providers import CloudProviderError, get_cloud_provider

logger = logging.getLogger('tasks')

@shared_task
def import_from_cloud_task(document_id, connection_id, file_id_or_path, version_id=None):
    """
    Downloads a file from a cloud provider and processes it.
    """
    try:
        document = Document.objects.get(id=document_id)
        connection = CloudConnection.objects.get(id=connection_id)

        provider = get_cloud_provider(connection.provider, connection=connection)

        document.status_message = f"Importing from {connection.get_provider_display()}..."
        document.save()

        file_data = provider.download_file(file_id_or_path)

        # V1 Limitation check
        max_size_bytes = settings.CLOUD_IMPORT_MAX_SIZE_MB * 1024 * 1024
        if file_data['size'] > max_size_bytes:
            raise CloudProviderError(f"File size exceeds the {settings.CLOUD_IMPORT_MAX_SIZE_MB}MB limit for imports.")

        process_imported_file(document, file_data, version_id=version_id)

    except (Document.DoesNotExist, CloudConnection.DoesNotExist):
        logger.error(f"Could not find Document or CloudConnection for import task. Doc ID: {document_id}, Conn ID: {connection_id}")
        return
    except CloudProviderError as e:
        document.status = 'error'
        document.status_message = f"Import failed: {e}"
        document.save()
        logger.error(f"Cloud provider error during import for document {document_id}: {e}")
    except Exception as e:
        document.status = 'error'
        document.status_message = "An unexpected error occurred during import."
        document.save()
        logger.exception(f"Unexpected error during cloud import for document {document_id}: {e}")
