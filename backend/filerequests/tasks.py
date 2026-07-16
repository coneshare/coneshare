import logging
import requests
import tempfile
from celery import shared_task
from django.db import transaction

from documents.fileserver import fileserver_client
from cloudfiles.providers import get_cloud_provider
from .models import UploadExportJob, SecurityThreatEvent

logger = logging.getLogger('tasks')


def _evaluate_organization_export_policies(job) -> bool:
    """
    Evaluates whether the export is permitted under the organization's policies.
    For now, returns True (all connected providers allowed).
    """
    return True


@shared_task
def export_upload_to_cloud_task(job_id):
    """
    Asynchronously exports an uploaded file request to a connected cloud provider.
    """
    try:
        with transaction.atomic():
            job = UploadExportJob.objects.select_for_update().select_related(
                'uploaded_file__document',
                'uploaded_file__file_request__folder',
                'connection'
            ).get(id=job_id)

            if job.status not in (UploadExportJob.Status.QUEUED, UploadExportJob.Status.FAILED):
                logger.info(f"Export job {job_id} already processed or in progress. Status: {job.status}")
                return

            uploaded_file = job.uploaded_file
            doc = uploaded_file.document

            # 1. Security Check (Malware Scan Guard)
            # If the document is still processing/uploading, or in error status
            if doc.status != 'ready':
                job.status = UploadExportJob.Status.BLOCKED_SCAN
                job.error_message = f"Document status is '{doc.status}'. Security check not satisfied."
                job.save(update_fields=['status', 'error_message'])
                return

            # Check for active unresolved SecurityThreatEvents for this document/key
            unresolved_threats = SecurityThreatEvent.objects.filter(
                file_request=uploaded_file.file_request,
                file_name=doc.name,
                status=SecurityThreatEvent.Status.NEW
            ).exists()

            if unresolved_threats:
                job.status = UploadExportJob.Status.BLOCKED_SCAN
                job.error_message = "Export blocked due to an unresolved security threat event on this file."
                job.save(update_fields=['status', 'error_message'])
                return

            # 2. Policy Check
            if not _evaluate_organization_export_policies(job):
                job.status = UploadExportJob.Status.BLOCKED_POLICY
                job.error_message = "Export blocked by organizational policies."
                job.save(update_fields=['status', 'error_message'])
                return

            job.status = UploadExportJob.Status.EXPORTING
            job.save(update_fields=['status'])

        # Outside transaction: Perform HTTP download and upload.
        # Get primary version to fetch storage key
        primary_version = doc.versions.filter(is_primary=True).first()
        storage_key = primary_version.original_storage_key if primary_version else getattr(doc, 'storage_key', None)
        if not storage_key:
            raise ValueError("No storage key found for document version.")

        download_url = fileserver_client.generate_download_url(storage_key, is_internal=True)
        
        # Download the file to a spooled temporary file
        with tempfile.SpooledTemporaryFile(max_size=10 * 1024 * 1024) as temp_file: # 10MB threshold
            with requests.get(download_url, stream=True, timeout=30) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=8192):
                    temp_file.write(chunk)
            temp_file.seek(0)

            # Get cloud provider and upload
            provider = get_cloud_provider(job.connection.provider, connection=job.connection)
            remote_file_id = provider.upload_file(
                file_obj=temp_file,
                file_name=doc.name,
                folder_id=job.destination_folder_id
            )

        # Save success state
        job.status = UploadExportJob.Status.EXPORTED
        job.provider_file_id = remote_file_id
        job.error_message = ''
        job.save(update_fields=['status', 'provider_file_id', 'error_message', 'updated_at'])

    except UploadExportJob.DoesNotExist:
        logger.error(f"UploadExportJob {job_id} not found.")
    except Exception as e:
        logger.exception(f"Error during export job {job_id}: {e}")
        try:
            job = UploadExportJob.objects.get(id=job_id)
            job.status = UploadExportJob.Status.FAILED
            job.error_message = str(e)
            job.save(update_fields=['status', 'error_message', 'updated_at'])
        except Exception as inner_e:
            logger.exception(f"Failed to record failure for job {job_id}: {inner_e}")
