import os
from django.core.files.uploadedfile import UploadedFile
from django.core.files.storage import default_storage
from django.db import transaction

from core.fields import generate_ulid
from core.models import User
from .models import Document, DocumentVersion, Folder
from .tasks import generate_pdf_pages_task, convert_office_to_pdf_task


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


def create_document_from_upload(
    requesting_user: User,
    uploaded_file: UploadedFile,
    folder: Folder = None
) -> Document:
    """
    Creates document records and routes the file to the correct
    asynchronous processing task based on its content type.
    """
    # 1. Store the original file
    file_id = generate_ulid()
    file_ext = os.path.splitext(uploaded_file.name)[1]
    storage_key = f"{requesting_user.organization.id}/{file_id}{file_ext}"

    original_storage_key = default_storage.save(storage_key, uploaded_file)

    if folder is None:
        folder, _ = Folder.objects.get_or_create(
            organization=requesting_user.organization,
            parent=None,
            name='__root__',
            defaults={'created_by': None}
        )

    content_type = uploaded_file.content_type

    # Determine document type from content_type
    doc_type = 'file'  # default
    if content_type in OFFICE_MIMETYPES:
        doc_type = 'document'
    elif content_type == PDF_MIMETYPE:
        doc_type = 'pdf'
    elif content_type in IMAGE_MIMETYPES:
        doc_type = 'image'

    # 2. Create database records
    document = Document.objects.create(
        organization=requesting_user.organization,
        created_by=requesting_user,
        name=uploaded_file.name,
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

    # 3. Trigger background task based on type
    if content_type in OFFICE_MIMETYPES:
        document.status = 'processing'
        document.save()
        convert_office_to_pdf_task.delay(version.id)
    elif content_type == PDF_MIMETYPE:
        document.status = 'processing'
        document.save()
        generate_pdf_pages_task.delay(version.id)
    elif content_type in IMAGE_MIMETYPES:
        document.status = 'ready'
        document.num_pages = 1
        document.save()
        version.num_pages = 1
        version.has_pages = True
        version.save()
    else:
        document.download_only = True
        document.status = 'ready'
        document.save()

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
    Handles creating a new version of a document.
    1. Stores the new file.
    2. Creates a new DocumentVersion record and marks it as primary.
    3. De-primary-s the old version.
    4. Triggers async processing.
    """
    # 1. Find the current version number
    latest_version = document.versions.order_by('-version_number').first()
    new_version_number = (latest_version.version_number if latest_version else 0) + 1

    # 2. Store the new file
    file_id = generate_ulid()
    file_ext = os.path.splitext(uploaded_file.name)[1]
    storage_key = f"{requesting_user.organization.id}/{file_id}{file_ext}"
    new_storage_key = default_storage.save(storage_key, uploaded_file)

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
            content_type=uploaded_file.content_type,
            file_size=uploaded_file.size,
            type='pdf'  # V1 only supports PDF
        )

        # 5. Update the parent Document's status
        document.status = 'processing'
        document.save()

    # 6. Trigger the same async processing task as a new document
    generate_pdf_pages_task.delay(new_version.id)

    return new_version
