import os
import mimetypes
import logging
import requests
import uuid
from django.utils import timezone

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Q, Sum
from rest_framework.exceptions import APIException

from backend.utils import get_unique_name
from core.models import User
from core.services import get_dynamic_setting
from .fileserver import fileserver_client
from .models import Document, DocumentPage, DocumentVersion, Folder
from .tasks import convert_office_to_pdf_task, generate_pdf_pages_task, generate_video_stream_task


OFFICE_MIMETYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
    'application/msword',  # .doc
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',  # .pptx
    'application/vnd.ms-powerpoint',  # .ppt
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
    'application/vnd.ms-excel',  # .xls
]
IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
VIDEO_MIMETYPES = [
    'video/mp4',
    'video/quicktime',  # .mov
    'video/x-msvideo',  # .avi
    'video/webm',
    'video/ogg',
    'video/mp2t',
    'video/3gpp',
]
PDF_MIMETYPE = 'application/pdf'
SERVER_RENDERABLE_TYPES = {'document', 'pdf'}


class QuotaExceededError(Exception):
    """Custom exception for when user quota is exceeded."""
    pass


def check_user_quota_on_upload(user: User, new_file_size: int, document_to_update: Document = None):
    """
    Checks if a new upload would exceed the user's file size quota.
    Raises a QuotaExceededError if the quota is exceeded.
    """
    file_size_quota_mb = user.effective_file_size_quota_mb
    if file_size_quota_mb == 0:
        return  # 0 means unlimited quota

    quota_in_bytes = file_size_quota_mb * 1024 * 1024
    current_usage = user.total_document_size

    potential_new_usage = current_usage + new_file_size

    if document_to_update:
        # For a version update, the old version's size is subtracted from the total.
        if document_to_update.file_size:
            potential_new_usage -= document_to_update.file_size

    if potential_new_usage > quota_in_bytes:
        raise QuotaExceededError(
            f"Uploading this file would exceed your storage quota of {file_size_quota_mb} MB."
        )


def _normalize_content_type(content_type: str, filename: str) -> str:
    if not content_type or content_type == 'application/octet-stream':
        guessed_type, _ = mimetypes.guess_type(filename)
        if guessed_type:
            return guessed_type
    return content_type


def _get_doc_type_from_content_type(content_type: str) -> str:
    """Determines the document type from its MIME type."""
    if content_type in OFFICE_MIMETYPES:
        return 'document'
    elif content_type == PDF_MIMETYPE:
        return 'pdf'
    elif content_type in IMAGE_MIMETYPES:
        return 'image'
    elif content_type in VIDEO_MIMETYPES:
        return 'video'
    return 'file'  # default


def _route_document_for_processing(document: Document, version: DocumentVersion, file_size: int, content_type: str):
    """
    Sets initial metadata and preview rendering states on document and version
    records based on file type and size. Defers heavy processing tasks.

    TODO: We may need to rename this function (e.g., to `_initialize_document_metadata_and_states`)
    since it no longer directly routes/triggers Celery processing tasks under lazy preview mode.
    """
    max_preview_file_size_mb = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
    max_size_bytes = max_preview_file_size_mb * 1024 * 1024
    is_too_large = file_size > max_size_bytes

    doc_type = _get_doc_type_from_content_type(content_type)
    
    if doc_type == 'video':
        max_video_size_mb = get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
        max_size_bytes = max_video_size_mb * 1024 * 1024
        is_too_large = file_size > max_size_bytes
        is_previewable = settings.ENABLE_VIDEO_PREVIEW and not is_too_large
    else:
        is_previewable = doc_type != 'file' and not is_too_large

    # Update parent document attributes
    document.download_only = not is_previewable
    document.type = doc_type
    document.content_type = content_type
    document.file_size = file_size
    document.status_message = ''

    version.render_error = ''

    # The file itself is ready after upload. Heavy server-rendered preview
    # generation is deferred until the first preview request.
    if is_previewable:
        if doc_type == 'image':
            document.status = 'ready'
            document.num_pages = 1
            version.num_pages = 1
            version.has_pages = True
            version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
            version.save()
        elif doc_type == 'video':
            document.status = 'ready'
            version.has_pages = False
            version.render_status = DocumentVersion.RENDER_NOT_GENERATED
            version.save(update_fields=['has_pages', 'render_status', 'render_error', 'updated_at'])
        else:  # Office or PDF
            document.status = 'ready'
            version.has_pages = False
            version.render_status = DocumentVersion.RENDER_NOT_GENERATED
            version.save(update_fields=['has_pages', 'render_status', 'render_error', 'updated_at'])
    else:  # Download only
        document.status = 'ready'
        version.has_pages = False
        version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        version.save(update_fields=['has_pages', 'render_status', 'render_error', 'updated_at'])

    document.save()


def is_server_renderable_version(version: DocumentVersion) -> bool:
    """
    Return whether this version can use the server page-image renderer.

    Check both document.type and version.type because they can diverge during
    Office conversion: the user-facing document remains "document", while the
    processed version may become "pdf" after LibreOffice conversion. A
    download-only document is excluded even if its MIME family is renderable;
    upload routing uses download_only for unsupported files and files larger
    than MAX_PREVIEW_FILE_SIZE_MB, and future capability flags may also use it
    to keep Office/PDF files out of the heavy preview pipeline.
    """
    document = version.document
    
    if document.is_download_only:
        return False
        
    if document.type not in SERVER_RENDERABLE_TYPES or version.type not in SERVER_RENDERABLE_TYPES:
        return False
        
    if settings.PDF_PREVIEW_ENGINE != 'server_pages':
        return False
        
    if document.type == 'document' and not settings.ENABLE_OFFICE_PREVIEW:
        return False
        
    return True


def get_effective_render_status(version: DocumentVersion) -> str:
    """
    Normalize persisted render fields into the status the preview API should expose.

    has_pages wins because page-image assets are the server renderer's usable
    output. If those assets exist, preview can proceed even if render_status is
    stale from older rows, migrations, or interrupted task updates. The fallback
    to not_generated is defensive for incomplete legacy/test objects; persisted
    rows should normally have a non-empty render_status from the model default.
    """
    if version.has_pages:
        return DocumentVersion.RENDER_READY
    if version.type == 'video':
        if not settings.ENABLE_VIDEO_PREVIEW:
            return DocumentVersion.RENDER_NOT_APPLICABLE
        return version.render_status
    if not is_server_renderable_version(version):
        return DocumentVersion.RENDER_NOT_APPLICABLE
    return version.render_status


def preview_mode_for_version(version: DocumentVersion) -> str:
    """Choose the viewer mode from document type and server-render eligibility."""
    document = version.document
    if document.is_download_only:
        return 'download_only'
        
    if document.type == 'video':
        if not settings.ENABLE_VIDEO_PREVIEW:
            return 'download_only'
        max_video_size = get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
        if version.file_size and version.file_size > (max_video_size * 1024 * 1024):
            return 'download_only'
        return 'video'

    max_preview_file_size_mb = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
    if version.file_size and version.file_size > (max_preview_file_size_mb * 1024 * 1024):
        return 'download_only'

    if document.type == 'image':
        return 'image'
        
    if document.type == 'pdf' and settings.PDF_PREVIEW_ENGINE == 'pdfjs':
        return 'client_pdf'
        
    if is_server_renderable_version(version):
        return 'server_pages'
        
    return 'download_only'


def preview_status_for_render_status(render_status: str) -> str:
    """Map internal render lifecycle values to coarse frontend preview states."""
    if render_status in {
        DocumentVersion.RENDER_QUEUED,
        DocumentVersion.RENDER_PROCESSING,
    }:
        return 'processing'
    if render_status == DocumentVersion.RENDER_READY:
        return 'ready'
    if render_status == DocumentVersion.RENDER_FAILED:
        return 'failed'
    if render_status == DocumentVersion.RENDER_NOT_GENERATED:
        return 'not_generated'
    return 'not_applicable'


def _is_dynamically_previewable(version: DocumentVersion) -> bool:
    """Helper to check if a version is dynamically previewable based on current settings."""
    if version.type == 'video':
        return settings.ENABLE_VIDEO_PREVIEW and not version.document.is_download_only
    return is_server_renderable_version(version)


def enqueue_server_preview_render(version: DocumentVersion) -> str:
    """
    Ensure server page-image generation is queued when this version needs it.

    This is safe to call for any preview request: ready, failed, processing,
    queued, download-only, and image versions are returned as-is.
    
    If the version was previously saved as RENDER_NOT_APPLICABLE but is now
    dynamically previewable (e.g. settings limits were raised), it resets the
    DB status to RENDER_NOT_GENERATED.
    
    Then, only not_generated server-renderable versions attempt the conditional
    update to RENDER_QUEUED. That update is the idempotency boundary for
    concurrent first views.

    Returns the effective render status after the enqueue attempt or race
    resolution. Keeps the passed model instance synchronized for callers that
    also read render_error or render_status while shaping the response.
    """
    # 1. Reset persisted RENDER_NOT_APPLICABLE if settings changed to allow previews
    if version.render_status == DocumentVersion.RENDER_NOT_APPLICABLE:
        if _is_dynamically_previewable(version):
            DocumentVersion.objects.filter(
                pk=version.pk,
                render_status=DocumentVersion.RENDER_NOT_APPLICABLE,
            ).update(render_status=DocumentVersion.RENDER_NOT_GENERATED)
            version.render_status = DocumentVersion.RENDER_NOT_GENERATED

    # 2. Proceed with normal enqueue logic
    render_status = get_effective_render_status(version)
    if render_status != DocumentVersion.RENDER_NOT_GENERATED:
        return render_status

    # Atomically claim the render job. Only the first concurrent preview request
    # that still sees not_generated should transition the row and enqueue work.
    updated = DocumentVersion.objects.filter(
        pk=version.pk,
        render_status=DocumentVersion.RENDER_NOT_GENERATED,
    ).update(
        render_status=DocumentVersion.RENDER_QUEUED,
        render_error='',
    )

    if updated:
        # QuerySet.update() bypasses this Python model instance, so keep it in
        # sync for callers that shape the API response from the same object.
        version.render_status = DocumentVersion.RENDER_QUEUED
        version.render_error = ''
        if version.type == 'document':
            convert_office_to_pdf_task.delay(version.id)
        elif version.type == 'pdf':
            generate_pdf_pages_task.delay(version.id)
        elif version.type == 'video':
            generate_video_stream_task.delay(version.id)
        return DocumentVersion.RENDER_QUEUED

    # Another request or worker changed the row first. Refresh only the fields
    # needed to compute the effective status and expose an accurate error.
    version.refresh_from_db(fields=['render_status', 'has_pages', 'render_error'])
    return get_effective_render_status(version)


def _get_unique_document_name(requesting_user, folder, original_name: str) -> str:
    """Generates a unique name for a document within a folder to avoid duplicates."""
    filter_kwargs = {'created_by': requesting_user, 'folder': folder}
    return get_unique_name(Document, original_name, filter_kwargs, has_extension=True)


def _get_unique_folder_name(created_by, parent_folder, original_name: str) -> str:
    """Generates a unique name for a folder within a parent folder to avoid duplicates."""
    filter_kwargs = {'created_by': created_by, 'parent': parent_folder}
    return get_unique_name(Folder, original_name, filter_kwargs, has_extension=False)


def generate_storage_key(organization_id, file_name: str) -> str:
    """
    Generates a unique, partitioned storage key for a new file.
    e.g., "org_.../a1/b2c3d4...xyz.pdf"
    """
    file_id = uuid.uuid4().hex
    file_ext = os.path.splitext(file_name)[1]
    return f"{organization_id}/{file_id[:2]}/{file_id[2:]}{file_ext}"


def create_document_from_upload(
    requesting_user: User,
    folder: Folder,
    storage_key: str,
    unique_name: str,
    file_size: int,
    content_type: str,
) -> Document:
    """
    Creates document records from data about a file already uploaded to the
    file server, and routes it for processing.
    """
    if folder is None:
        folder, _ = Folder.objects.get_or_create(
            organization=requesting_user.organization,
            parent=None,
            name='__root__',
            defaults={'created_by': None}
        )

    content_type = _normalize_content_type(content_type, unique_name)
    doc_type = _get_doc_type_from_content_type(content_type)

    # Create database records within a transaction to include user size update
    with transaction.atomic():
        document = Document.objects.create(
            organization=requesting_user.organization,
            created_by=requesting_user,
            name=unique_name,
            folder=folder,
            status='uploading',
            type=doc_type,
            content_type=content_type,
            original_storage_key=storage_key,
        )

        # Update user's total document size
        User.objects.filter(pk=requesting_user.pk).update(total_document_size=F('total_document_size') + file_size)

    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        original_storage_key=storage_key,
        storage_key=storage_key,
        content_type=content_type,
        file_size=file_size,
        type=doc_type,
        is_primary=True,
    )

    # Route for processing
    _route_document_for_processing(
        document=document,
        version=version,
        file_size=file_size,
        content_type=content_type,
    )

    return document


logger = logging.getLogger(__name__)


def delete_folder_and_contents(folder: Folder):
    """
    Deletes a folder and all its contents (subfolders and documents),
    updates the user's total document size, and deletes associated files
    from storage.
    """
    descendants = folder.get_descendants()
    all_folders_to_delete = [folder] + descendants
    documents_to_delete = Document.objects.filter(folder__in=all_folders_to_delete)

    total_size = documents_to_delete.aggregate(total=Sum('file_size'))['total'] or 0

    storage_keys_to_delete = set()
    versions = DocumentVersion.objects.filter(document__in=documents_to_delete)
    pages = DocumentPage.objects.filter(document_version__in=versions)

    for version in versions:
        if version.original_storage_key:
            storage_keys_to_delete.add(version.original_storage_key)
        if version.storage_key and version.storage_key != version.original_storage_key:
            storage_keys_to_delete.add(version.storage_key)

    for page in pages:
        if page.storage_key:
            storage_keys_to_delete.add(page.storage_key)

    deletion_errors = []
    for key in storage_keys_to_delete:
        try:
            fileserver_client.delete_file(key)
        except APIException as e:
            logger.error(f"Failed to delete file {key} from file server: {e}")
            deletion_errors.append(key)

    if deletion_errors:
        raise Exception(f"Failed to delete one or more associated files: {', '.join(deletion_errors)}")

    with transaction.atomic():
        user = folder.created_by
        if user and total_size > 0:
            User.objects.filter(pk=user.pk).update(total_document_size=F('total_document_size') - total_size)
        # Explicitly delete the documents. This will cascade to versions and pages.
        documents_to_delete.delete()
        folder.delete()


def delete_document_and_files(document: Document):
    """
    Deletes a document, its versions, pages, and all associated files from storage.
    """
    storage_keys_to_delete = set()

    for version in document.versions.all():
        if version.original_storage_key:
            storage_keys_to_delete.add(version.original_storage_key)
        if version.storage_key and version.storage_key != version.original_storage_key:
            storage_keys_to_delete.add(version.storage_key)

        for page in version.pages.all():
            if page.storage_key:
                storage_keys_to_delete.add(page.storage_key)

    # Delete files from storage
    deletion_errors = []
    for key in storage_keys_to_delete:
        try:
            fileserver_client.delete_file(key)
        except APIException as e:
            logger.error(f"Failed to delete file {key} from file server: {e}")
            deletion_errors.append(key)

    if deletion_errors:
        # If any file failed to delete, do not delete the DB record.
        # Re-raise an exception to be handled by the calling view.
        raise Exception(f"Failed to delete one or more associated files: {', '.join(deletion_errors)}")

    # Atomically update user's total size and delete the document record
    with transaction.atomic():
        user = document.created_by
        if user and document.file_size:
            User.objects.filter(pk=user.pk).update(total_document_size=F('total_document_size') - document.file_size)
        # Delete the document record, which will cascade to versions, pages, share links etc.
        document.delete()


def copy_document(original_doc: Document, user: User) -> Document:
    """
    Creates a copy of a document, including its file in storage and database records.
    """
    if not original_doc.file_size:
        raise APIException("Cannot copy a document with no file size.")

    # 1. Check user quota before doing anything else
    try:
        check_user_quota_on_upload(user=user, new_file_size=original_doc.file_size)
    except QuotaExceededError as e:
        # Re-raise to be handled by the view
        raise e

    # 2. Get unique name for the copy
    new_name = _get_unique_document_name(
        requesting_user=user,
        folder=original_doc.folder,
        original_name=original_doc.name
    )

    # 3. Generate new storage key for the copied file
    new_storage_key = generate_storage_key(user.organization.id, new_name)

    # 4. Get the primary version of the original document
    original_primary_version = original_doc.versions.filter(is_primary=True).first()
    if not original_primary_version:
        raise APIException("Original document has no primary version to copy.")

    # TODO: Refactor this to use Asynchronous Copy via Celery to avoid blocking
    # Django/Gunicorn request threads on copying large files (like 1GB videos).
    # 5. Copy the file on the file server
    try:
        fileserver_client.copy_file(
            source_storage_key=original_primary_version.original_storage_key,
            destination_storage_key=new_storage_key,
            file_size=original_doc.file_size
        )
    except APIException as e:
        logger.error(f"Failed to copy file in storage for doc {original_doc.id}: {e}")
        # Re-raise the original exception to preserve the status code.
        raise

    try:
        with transaction.atomic():
            # 6. Create new Document and DocumentVersion records
            new_metadata = original_doc.metadata.copy()
            new_metadata.pop('uploader_info', None)

            new_doc = Document.objects.create(
                organization=original_doc.organization,
                folder=original_doc.folder,
                name=new_name,
                description=original_doc.description,
                status='processing',
                storage_key=new_storage_key,
                original_storage_key=new_storage_key,
                type=original_doc.type,
                content_type=original_doc.content_type,
                num_pages=original_doc.num_pages,
                file_size=original_doc.file_size,
                download_only=original_doc.is_download_only,
                assistant_enabled=original_doc.assistant_enabled,
                is_starred=False,
                created_by=user,
                metadata=new_metadata,
            )

            new_version = DocumentVersion.objects.create(
                document=new_doc,
                version_number=1,
                is_primary=True,
                storage_key=new_storage_key,
                original_storage_key=new_storage_key,
                content_type=original_primary_version.content_type,
                type=original_primary_version.type,
                file_size=original_primary_version.file_size,
                num_pages=original_primary_version.num_pages,
                is_vertical=original_primary_version.is_vertical,
                has_pages=False,
            )

            # 7. Update user's total document size
            User.objects.filter(pk=user.pk).update(
                total_document_size=F('total_document_size') + new_doc.file_size
            )

        # 8. Route for processing
        _route_document_for_processing(
            document=new_doc,
            version=new_version,
            file_size=new_doc.file_size,
            content_type=new_doc.content_type
        )

        return new_doc
    except Exception as e:
        logger.error(f"DB operation failed after file copy for doc {original_doc.id}. Cleaning up file. Error: {e}")
        try:
            fileserver_client.delete_file(new_storage_key)
        except APIException as cleanup_e:
            logger.error(f"Failed to cleanup orphaned file {new_storage_key}: {cleanup_e}")
        raise e


def create_new_document_version(
    document: Document,
    requesting_user: User,
    storage_key: str,
    file_size: int,
    content_type: str,
) -> DocumentVersion:
    """
    Handles creating a new version of a document, routing to the correct
    processing task based on file type and size.
    """
    # 1. Find the current version number
    latest_version = document.versions.order_by('-version_number').first()
    new_version_number = (latest_version.version_number if latest_version else 0) + 1

    content_type = _normalize_content_type(content_type, document.name)
    doc_type = _get_doc_type_from_content_type(content_type)

    with transaction.atomic():
        # 1. Update user's total document size
        old_file_size = document.file_size or 0
        User.objects.filter(pk=requesting_user.pk).update(total_document_size=F('total_document_size') - old_file_size + file_size)

        # 2. Set the old version to not be primary
        if latest_version:
            latest_version.is_primary = False
            latest_version.save()

        # 3. Create the new version record
        new_version = DocumentVersion.objects.create(
            document=document,
            version_number=new_version_number,
            original_storage_key=storage_key,
            storage_key=storage_key,
            is_primary=True,
            content_type=content_type,
            file_size=file_size,
            type=doc_type
        )

        # 4. Route for processing
        _route_document_for_processing(
            document=document,
            version=new_version,
            file_size=file_size,
            content_type=content_type,
        )

    return new_version


def process_imported_file(document: Document, file_data: dict, version_id=None):
    """
    Processes a file downloaded from a cloud service, saves it to storage,
    and routes it for further processing (e.g., PDF conversion).
    """
    file_name = file_data['name']
    file_content = file_data['content']  # This is an in-memory file
    file_size = file_data['size']
    etag_or_rev = file_data.get('etag_or_rev', '')

    content_type, _ = mimetypes.guess_type(file_name)
    if not content_type:
        content_type = 'application/octet-stream'

    # 1. Store the file via the file server
    storage_key = generate_storage_key(document.organization.id, file_name)

    try:
        upload_url = fileserver_client.generate_upload_url(storage_key)
        # Ensure we read from the start of the file-like object
        file_content.seek(0)
        upload_response = requests.put(upload_url, data=file_content)
        upload_response.raise_for_status()
        original_storage_key = storage_key
    except (APIException, requests.exceptions.RequestException) as e:
        logger.error(f"Failed to upload imported file to file server for doc {document.id}: {e}")
        raise

    # 2. Update document and version records
    if version_id:
        version = document.versions.get(id=version_id)
    else:
        version = document.versions.get(version_number=1)

    version.original_storage_key = original_storage_key
    version.storage_key = original_storage_key
    version.content_type = content_type
    version.type = _get_doc_type_from_content_type(content_type)
    version.file_size = file_size
    
    # Store the etag/rev in version metadata
    if not isinstance(version.metadata, dict):
        version.metadata = {}
    if 'cloud_import' in version.metadata:
        version.metadata['cloud_import']['etag_or_rev'] = etag_or_rev
    
    version.save()

    # 3. Re-check quota with actual size and route for processing.
    user = document.created_by
    if user:
        try:
            check_user_quota_on_upload(
                user=user,
                new_file_size=file_size,
                document_to_update=document if (version.version_number > 1) else None
            )
        except QuotaExceededError as e:
            logger.warning(
                f"Cloud import for doc {document.id} failed: quota exceeded with actual file size. "
                f"User: {user.id}, Size: {file_size}."
            )
            # Clean up the file that was just uploaded to our storage
            try:
                fileserver_client.delete_file(original_storage_key)
            except APIException as delete_e:
                logger.error(f"Failed to clean up file {original_storage_key} after quota error: {delete_e}")
            raise

    old_file_size = document.file_size or 0 if version.version_number > 1 else 0

    with transaction.atomic():
        _route_document_for_processing(
            document=document,
            version=version,
            file_size=file_size,
            content_type=content_type,
        )
        if user:
            User.objects.filter(pk=user.pk).update(
                total_document_size=F('total_document_size') - old_file_size + file_size
            )


def promote_document_version(document: Document, version: DocumentVersion, requesting_user: User):
    """
    Promotes a specific DocumentVersion to be the active (primary) version of the Document.
    Synchronizes parent Document fields with the promoted version's metadata.
    """
    if version.document != document:
        raise ValidationError("The selected version does not belong to this document.")

    if version.is_primary:
        raise ValidationError("This version is already the active version.")

    new_file_size = version.file_size or 0

    with transaction.atomic():
        # Obtain select_for_update lock on document to prevent concurrency issues.
        # Read old_file_size from the locked row (Rule 1: never read quota-sensitive
        # fields from the un-locked argument before acquiring the lock).
        locked_doc = Document.objects.select_for_update().get(pk=document.pk)
        old_file_size = locked_doc.file_size or 0

        if requesting_user and new_file_size > old_file_size:
            check_user_quota_on_upload(
                user=requesting_user,
                new_file_size=new_file_size,
                document_to_update=locked_doc
            )

        # Deactivate all current primary versions
        document.versions.filter(is_primary=True).update(is_primary=False)

        # Activate the chosen version
        version.is_primary = True
        version.save(update_fields=['is_primary', 'updated_at'])

        # Sync fields onto the Document
        locked_doc.file_size = new_file_size
        locked_doc.content_type = version.content_type
        locked_doc.type = version.type
        locked_doc.storage_key = version.storage_key
        locked_doc.original_storage_key = version.original_storage_key
        locked_doc.num_pages = version.num_pages

        # Determine download_only based on render capabilities
        max_preview_file_size_mb = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        max_size_bytes = max_preview_file_size_mb * 1024 * 1024
        is_too_large = new_file_size > max_size_bytes

        if version.type == 'video':
            max_video_size_mb = get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
            max_size_bytes = max_video_size_mb * 1024 * 1024
            is_too_large = new_file_size > max_size_bytes
            is_previewable = settings.ENABLE_VIDEO_PREVIEW and not is_too_large
        else:
            is_previewable = version.type != 'file' and not is_too_large

        locked_doc.download_only = not is_previewable

        # Map version's render_status to Document status
        if version.render_status == DocumentVersion.RENDER_FAILED:
            locked_doc.status = 'error'
            locked_doc.status_message = version.render_error or 'An error occurred during preview generation.'
        elif version.render_status in (DocumentVersion.RENDER_QUEUED, DocumentVersion.RENDER_PROCESSING):
            locked_doc.status = 'processing'
            locked_doc.status_message = 'Generating preview...'
        else:
            locked_doc.status = 'ready'
            locked_doc.status_message = ''

        locked_doc.save()

        # Update user's total document size
        if requesting_user and old_file_size != new_file_size:
            User.objects.filter(pk=requesting_user.pk).update(
                total_document_size=F('total_document_size') - old_file_size + new_file_size
            )

    # Since locked_doc was retrieved via select_for_update() as a separate Python object instance,
    # changes made and saved to locked_doc won't be visible on the original 'document' instance
    # passed to this function. Refresh from DB to ensure the caller (e.g. view serializer)
    # receives up-to-date metadata in memory.
    document.refresh_from_db()


def soft_delete_document(document: Document, user: User):
    """Soft deletes a document."""
    document.deleted_at = timezone.now()
    document.deleted_by = user
    document.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])


def soft_delete_folder(folder: Folder, user: User):
    """
    Soft deletes a folder and all its active contents (subfolders and documents).
    Preserves original deleted_at timestamps on items that were soft deleted earlier.
    """
    now = timezone.now()
    with transaction.atomic():
        descendants = folder.get_descendants()
        all_folders = [folder] + descendants
        
        Folder.objects.active().filter(id__in=[f.id for f in all_folders]).update(
            deleted_at=now,
            deleted_by=user
        )
        Document.objects.active().filter(folder__in=all_folders).update(
            deleted_at=now,
            deleted_by=user
        )


def restore_item(item, item_type: str, user: User):
    """
    Restores a soft-deleted document or folder.
    Handles naming collisions by appending a numerical copy suffix if needed.
    Rejects restoration if parent folder is in Trash.
    Returns (restored_item, original_name, was_renamed).
    """
    original_name = item.name

    if item_type == 'document':
        if item.folder and item.folder.deleted_at is not None:
            active_replacement = Folder.objects.active().filter(
                parent=item.folder.parent,
                name=item.folder.name,
                organization=item.organization,
                created_by=item.created_by
            ).first()
            if active_replacement:
                item.folder = active_replacement
                item.save(update_fields=['folder', 'updated_at'])
            else:
                raise ValidationError(f"Cannot restore '{item.name}' because parent folder '{item.folder.name}' is in Trash. Restore '{item.folder.name}' first.")
    else:
        if item.parent and item.parent.deleted_at is not None:
            active_parent_replacement = Folder.objects.active().filter(
                parent=item.parent.parent,
                name=item.parent.name,
                organization=item.organization,
                created_by=item.created_by
            ).first()
            if active_parent_replacement:
                item.parent = active_parent_replacement
                item.save(update_fields=['parent', 'updated_at'])
            else:
                raise ValidationError(f"Cannot restore '{item.name}' because parent folder '{item.parent.name}' is in Trash. Restore '{item.parent.name}' first.")

    with transaction.atomic():
        if item_type == 'folder':
            descendants = item.get_descendants()
            all_folders = [item] + descendants

            # Check for active name collision on top-level folder
            if Folder.objects.active().filter(parent=item.parent, name=item.name).exists():
                item.name = _get_unique_folder_name(item.created_by, item.parent, item.name)
                item.save(update_fields=['name', 'updated_at'])

            # Handle duplicate document names within each restoring folder
            def _make_unique_in_set(name: str, existing_names: set, has_extension: bool = True) -> str:
                if name not in existing_names:
                    return name
                if has_extension:
                    base, ext = os.path.splitext(name)
                else:
                    base, ext = name, ""
                counter = 1
                new_name = f"{base} ({counter}){ext}"
                while new_name in existing_names:
                    counter += 1
                    new_name = f"{base} ({counter}){ext}"
                return new_name

            folder_deleted_at = item.deleted_at
            # Only restore subfolders and documents that were soft-deleted together with (or after) this folder.
            # Independently soft-deleted items (deleted_at < folder_deleted_at) remain in Trash.
            folders_to_restore = [f for f in all_folders if f.deleted_at is None or (folder_deleted_at is None or f.deleted_at >= folder_deleted_at)]

            for f in folders_to_restore:
                active_doc_names = set(Document.objects.active().filter(folder=f).values_list('name', flat=True))
                doc_filter = {'folder': f}
                if folder_deleted_at is not None:
                    doc_filter['deleted_at__gte'] = folder_deleted_at
                deleted_docs = list(
                    Document.objects.deleted().filter(**doc_filter).order_by('created_at', 'id')
                )

                for doc in deleted_docs:
                    if doc.name in active_doc_names:
                        doc.name = _make_unique_in_set(doc.name, active_doc_names, has_extension=True)
                        doc.save(update_fields=['name', 'updated_at'])
                    active_doc_names.add(doc.name)

            f_filter = {'id__in': [f.id for f in folders_to_restore]}
            if folder_deleted_at is not None:
                f_filter['deleted_at__gte'] = folder_deleted_at
            Folder.objects.deleted().filter(**f_filter).update(
                deleted_at=None,
                deleted_by=None
            )

            d_filter = {'folder__in': folders_to_restore}
            if folder_deleted_at is not None:
                d_filter['deleted_at__gte'] = folder_deleted_at
            Document.objects.deleted().filter(**d_filter).update(
                deleted_at=None,
                deleted_by=None
            )
            item.refresh_from_db()
        else:
            if Document.objects.active().filter(folder=item.folder, name=item.name).exists():
                item.name = _get_unique_document_name(item.created_by, item.folder, item.name)

            item.deleted_at = None
            item.deleted_by = None
            item.save(update_fields=['name', 'deleted_at', 'deleted_by', 'updated_at'])
            item.refresh_from_db()

        was_renamed = (item.name != original_name)
        return item, original_name, was_renamed


def empty_trash(user: User):
    """
    Permanently hard-deletes all soft-deleted items in the user's trash.
    Iterates root-level soft-deleted folders first, then orphaned soft-deleted docs.
    """
    with transaction.atomic():
        root_deleted_folders = Folder.objects.deleted().filter(
            deleted_by=user
        ).filter(
            Q(parent__isnull=True) | Q(parent__deleted_at__isnull=True)
        )
        for folder in list(root_deleted_folders):
            delete_folder_and_contents(folder)

        orphan_deleted_docs = Document.objects.deleted().filter(
            deleted_by=user
        ).filter(
            Q(folder__isnull=True) | Q(folder__deleted_at__isnull=True)
        )
        for doc in list(orphan_deleted_docs):
            delete_document_and_files(doc)
