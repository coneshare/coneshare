from django.conf import settings
from django.db import transaction
from django.db.models import F

from core.models import User
from documents.models import Document, DocumentVersion, Folder
from documents.services import _get_unique_document_name
from .models import CloudConnection
from .tasks import import_from_cloud_task


def create_document_for_import(
    requesting_user: User,
    file_name: str,
    file_size: int,
    connection: CloudConnection,
    file_id_or_path: str
) -> Document:
    """
    Creates a document record for a file being imported from a cloud service.
    The document is created in an 'uploading' state.
    """
    if file_size < 0:
        raise ValueError("file_size must be non-negative.")

    # 1. Find or create the destination folder for this provider
    folder_mapping = settings.CLOUD_IMPORT_FOLDER_MAPPING
    folder_name = folder_mapping.get(connection.provider, f"{connection.get_provider_display()} Imports")

    root_folder = Folder.objects.get_root_for_org(requesting_user.organization)
    import_folder, _ = Folder.objects.get_or_create(
        organization=requesting_user.organization,
        parent=root_folder,
        name=folder_name,
        created_by=requesting_user,
    )

    # 2. Get a unique name for the document
    unique_name = _get_unique_document_name(
        requesting_user=requesting_user,
        folder=import_folder,
        original_name=file_name
    )

    # 3. Create database records in 'uploading' state and update user quota atomically
    with transaction.atomic():
        document = Document.objects.create(
            organization=requesting_user.organization,
            created_by=requesting_user,
            name=unique_name,
            folder=import_folder,
            status='uploading',
            status_message='Import scheduled.',
            file_size=file_size,
        )

        DocumentVersion.objects.create(
            document=document,
            version_number=1,
            file_size=file_size,
            is_primary=True,
            metadata={
                "cloud_import": {
                    "provider": connection.provider,
                    "provider_display": connection.get_provider_display(),
                    "connection_id": str(connection.id),
                    "file_id": file_id_or_path
                }
            }
        )

        if file_size:
            User.objects.filter(pk=requesting_user.pk).update(
                total_document_size=F('total_document_size') + file_size
            )

    # 4. Trigger the async import task
    import_from_cloud_task.delay(document.id, connection.id, file_id_or_path)

    return document
