import os
import re
import mimetypes
from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.core.files.storage import default_storage
from django.db import transaction

from backend.utils import get_unique_name
from core.fields import generate_ulid
from core.models import User
from .models import Document, DocumentVersion, Folder
from .tasks import convert_office_to_pdf_task, generate_pdf_pages_task


OFFICE_MIMETYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
    'application/msword',  # .doc
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',  # .pptx
    'application/vnd.ms-powerpoint',  # .ppt
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
    'application/vnd.ms-excel',  # .xls
]
IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
PDF_MIMETYPE = 'application/pdf'


def _get_doc_type_from_content_type(content_type: str) -> str:
    """Determines the document type from its MIME type."""
    if content_type in OFFICE_MIMETYPES:
        return 'document'
    elif content_type == PDF_MIMETYPE:
        return 'pdf'
    elif content_type in IMAGE_MIMETYPES:
        return 'image'
    return 'file'  # default


def _route_document_for_processing(document: Document, version: DocumentVersion, file_size: int, content_type: str):
    """
    Routes a document/version for processing based on type and size.
    Updates the parent document's state and triggers the appropriate async task.
    """
    max_size_bytes = settings.MAX_PREVIEW_FILE_SIZE_MB * 1024 * 1024
    is_too_large = file_size > max_size_bytes

    doc_type = _get_doc_type_from_content_type(content_type)
    is_previewable = doc_type != 'file' and not is_too_large

    # Update parent document attributes
    document.download_only = not is_previewable
    document.type = doc_type
    document.content_type = content_type
    document.file_size = file_size

    # Trigger task or set status to ready
    if is_previewable:
        if doc_type == 'image':
            document.status = 'ready'
            document.num_pages = 1
            version.num_pages = 1
            version.has_pages = True
            version.save()
        else:  # Office or PDF
            document.status = 'processing'
            if doc_type == 'document':
                convert_office_to_pdf_task.delay(version.id)
            elif doc_type == 'pdf':
                generate_pdf_pages_task.delay(version.id)
    else:  # Download only
        document.status = 'ready'

    document.save()


def _get_unique_document_name(requesting_user, folder, original_name: str) -> str:
    """Generates a unique name for a document within a folder to avoid duplicates."""
    filter_kwargs = {'created_by': requesting_user, 'folder': folder}
    return get_unique_name(Document, original_name, filter_kwargs, has_extension=True)


def _get_unique_folder_name(created_by, parent_folder, original_name: str) -> str:
    """Generates a unique name for a folder within a parent folder to avoid duplicates."""
    filter_kwargs = {'created_by': created_by, 'parent': parent_folder}
    return get_unique_name(Folder, original_name, filter_kwargs, has_extension=False)


def create_document_from_upload(
    requesting_user: User,
    uploaded_file: UploadedFile,
    folder: Folder = None
) -> Document:
    """
    Creates document records and routes the file to the correct
    asynchronous processing task based on its content type and size.
    """
    if folder is None:
        folder, _ = Folder.objects.get_or_create(
            organization=requesting_user.organization,
            parent=None,
            name='__root__',
            defaults={'created_by': None}
        )

    # 1. Get a unique name before storing the file
    unique_name = _get_unique_document_name(
        requesting_user=requesting_user,
        folder=folder,
        original_name=uploaded_file.name
    )

    # 2. Store the original file
    file_id = generate_ulid()
    file_ext = os.path.splitext(unique_name)[1]
    storage_key = f"{requesting_user.organization.id}/{file_id}{file_ext}"

    original_storage_key = default_storage.save(storage_key, uploaded_file)

    content_type = uploaded_file.content_type
    doc_type = _get_doc_type_from_content_type(content_type)

    # 3. Create database records
    document = Document.objects.create(
        organization=requesting_user.organization,
        created_by=requesting_user,
        name=unique_name,
        folder=folder,
        status='uploading',
        type=doc_type,
        content_type=content_type
    )

    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        original_storage_key=original_storage_key,
        storage_key=original_storage_key,
        content_type=content_type,
        file_size=uploaded_file.size,
        type=doc_type,
        is_primary=True,
    )

    # 3. Route for processing
    _route_document_for_processing(
        document=document,
        version=version,
        file_size=uploaded_file.size,
        content_type=content_type,
    )

    return document


def delete_document_and_files(document: Document):
    """
    Deletes a document, its versions, pages, and all associated files from storage.
    """
    storage_keys_to_delete = []

    for version in document.versions.all():
        if version.original_storage_key:
            storage_keys_to_delete.append(version.original_storage_key)

        for page in version.pages.all():
            if page.storage_key:
                storage_keys_to_delete.append(page.storage_key)

    # Delete files from storage
    for key in storage_keys_to_delete:
        default_storage.delete(key)

    # Delete the document record, which will cascade to versions, pages, share links etc.
    document.delete()


def create_new_document_version(
    document: Document,
    uploaded_file: UploadedFile,
    requesting_user: User
) -> DocumentVersion:
    """
    Handles creating a new version of a document, routing to the correct
    processing task based on file type and size.
    """
    # 1. Find the current version number
    latest_version = document.versions.order_by('-version_number').first()
    new_version_number = (latest_version.version_number if latest_version else 0) + 1

    # 2. Store the new file
    file_id = generate_ulid()
    file_ext = os.path.splitext(uploaded_file.name)[1]
    storage_key = f"{requesting_user.organization.id}/{file_id}{file_ext}"
    new_storage_key = default_storage.save(storage_key, uploaded_file)

    content_type = uploaded_file.content_type
    doc_type = _get_doc_type_from_content_type(content_type)

    with transaction.atomic():
        # 3. Set the old version to not be primary
        if latest_version:
            latest_version.is_primary = False
            latest_version.save()

        # 4. Create the new version record
        new_version = DocumentVersion.objects.create(
            document=document,
            version_number=new_version_number,
            original_storage_key=new_storage_key,
            storage_key=new_storage_key,
            is_primary=True,
            content_type=content_type,
            file_size=uploaded_file.size,
            type=doc_type
        )

        # 5. Route for processing
        _route_document_for_processing(
            document=document,
            version=new_version,
            file_size=uploaded_file.size,
            content_type=content_type,
        )

    return new_version


def process_imported_file(document: Document, file_data: dict):
    """
    Processes a file downloaded from a cloud service, saves it to storage,
    and routes it for further processing (e.g., PDF conversion).
    """
    file_name = file_data['name']
    file_content = file_data['content']  # This is an in-memory file
    file_size = file_data['size']

    content_type, _ = mimetypes.guess_type(file_name)
    if not content_type:
        content_type = 'application/octet-stream'

    # 1. Store the file
    file_id = generate_ulid()
    file_ext = os.path.splitext(file_name)[1]
    storage_key = f"{document.organization.id}/{file_id}{file_ext}"

    original_storage_key = default_storage.save(storage_key, file_content)

    # 2. Update document and version records
    version = document.versions.get(version_number=1)
    version.original_storage_key = original_storage_key
    version.storage_key = original_storage_key
    version.content_type = content_type
    version.type = _get_doc_type_from_content_type(content_type)
    version.save()

    document.status_message = 'File imported. Starting processing...'
    document.save()

    # 3. Route for processing
    _route_document_for_processing(
        document=document,
        version=version,
        file_size=file_size,
        content_type=content_type,
    )
