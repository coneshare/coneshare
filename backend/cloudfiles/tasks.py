import logging
from celery import shared_task
from django.conf import settings
from django.db import transaction

from core.services import get_dynamic_setting
from documents.models import Document, DocumentVersion
from documents.services import process_imported_file, QuotaExceededError
from .models import CloudConnection
from .providers import CloudProviderError, get_cloud_provider

logger = logging.getLogger('tasks')

def _handle_import_failure(document, version_id, error_message):
    """
    Reverts the document status and primary version state if a version update
    (version_number > 1) fails, ensuring the last working version remains accessible.
    Falls back to setting the document status to 'error' if it's the first version,
    if no previous version is found, or if the reversion fails.
    """
    # Truncate error message to fit within the 255 character limit of status_message
    if error_message:
        error_message = str(error_message)
        if len(error_message) > 200:
            error_message = error_message[:197] + "..."
    else:
        error_message = ""

    try:
        if version_id:
            version = DocumentVersion.objects.get(id=version_id)
            # Only revert to the previous version if this was an update to an existing document.
            if version.version_number > 1:
                with transaction.atomic():
                    # 1. Lock the document row to prevent concurrent updates during rollback
                    locked_document = Document.objects.select_for_update().get(id=document.id)

                    # 2. Query previous version inside the transaction and lock
                    prev_version = locked_document.versions.exclude(id=version_id).order_by('-version_number').first()

                    if prev_version:
                        # Restore the previous primary version and copy back its attributes
                        prev_version.is_primary = True
                        prev_version.save(update_fields=['is_primary'])
                        
                        locked_document.file_size = prev_version.file_size
                        locked_document.content_type = prev_version.content_type
                        locked_document.type = prev_version.type

                        # Revert status to ready but record the error message for context
                        locked_document.status = 'ready'
                        locked_document.status_message = f"Last update failed: {error_message}"
                    else:
                        # If there is no previous version, fall back to error status
                        locked_document.status = 'error'
                        locked_document.status_message = f"Import failed: {error_message}"

                    locked_document.save()
                    
                    # 3. Delete the failed un-imported version
                    version.delete()
                return
    except Exception as e:
        logger.exception(f"Failed to revert document state after import failure: {e}")

    # Fallback to standard error state if we cannot revert (or this was version 1)
    document.status = 'error'
    document.status_message = f"Import failed: {error_message}"
    document.save()


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
        max_size_mb = get_dynamic_setting('CLOUD_IMPORT_MAX_SIZE_MB')
        max_size_bytes = max_size_mb * 1024 * 1024
        if file_data['size'] > max_size_bytes:
            raise CloudProviderError(f"File size exceeds the {max_size_mb}MB limit for imports.")

        process_imported_file(document, file_data, version_id=version_id)

    except (Document.DoesNotExist, CloudConnection.DoesNotExist):
        logger.error(f"Could not find Document or CloudConnection for import task. Doc ID: {document_id}, Conn ID: {connection_id}")
        return
    except (CloudProviderError, QuotaExceededError) as e:
        logger.error(f"Import error during import for document {document_id}: {e}")
        _handle_import_failure(document, version_id, str(e))
    except Exception as e:
        logger.exception(f"Unexpected error during cloud import for document {document_id}: {e}")
        _handle_import_failure(document, version_id, "An unexpected error occurred during import.")
