from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings

from core.models import BaseModel, Organization, User
from core.services import get_dynamic_setting


class FolderManager(models.Manager):
    def get_root_for_org(self, organization):
        """
        Retrieves the invisible __root__ folder for a given organization.
        Raises Folder.DoesNotExist if the root folder is not found, which
        indicates a critical configuration issue.
        """
        return self.get(organization=organization, name='__root__', parent=None)


class Folder(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=255, db_index=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='folders_created')
    is_starred = models.BooleanField(default=False)

    objects = FolderManager()

    class Meta:
        unique_together = ('created_by', 'parent', 'name')

    def __str__(self):
        return self.name

    def get_descendants(self):
        """
        Returns a flat list of all descendant folders.
        """
        descendants = []
        # Using a list as a stack for an iterative depth-first search is
        # efficient and avoids deep recursion.
        stack = list(self.children.all())
        while stack:
            folder = stack.pop()
            descendants.append(folder)
            stack.extend(list(folder.children.all()))
        return descendants


class Document(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='documents')
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    name = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ('uploading', 'Uploading'),
            ('processing', 'Processing'),
            ('ready', 'Ready'),
            ('error', 'Error')
        ],
        default='processing'
    )
    status_message = models.CharField(max_length=255, blank=True, null=True)
    storage_key = models.CharField(max_length=1024, blank=True, null=True)
    original_storage_key = models.CharField(max_length=1024, blank=True, null=True)
    type = models.CharField(max_length=20)
    content_type = models.CharField(max_length=255)
    num_pages = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    download_only = models.BooleanField(default=False)
    assistant_enabled = models.BooleanField(default=False)
    is_starred = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='documents_created')
    metadata = models.JSONField(blank=True, default=dict)

    class Meta:
        unique_together = ('created_by', 'folder', 'name')

    def __str__(self):
        return self.name

    @property
    def is_download_only(self) -> bool:
        """
        Dynamically calculates whether the document can only be downloaded.
        Checks file type limits and enabled settings in real-time.
        """
        # 1. Unsupported raw files
        if self.type == 'file':
            return True

        # 2. Videos
        if self.type == 'video':
            if not getattr(settings, 'ENABLE_VIDEO_PREVIEW', False):
                return True
            max_video_size = get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
            return bool(self.file_size and self.file_size > (max_video_size * 1024 * 1024))

        # 3. Office Documents
        if self.type == 'document':
            if not getattr(settings, 'ENABLE_OFFICE_PREVIEW', False):
                return True
            max_preview_size = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
            return bool(self.file_size and self.file_size > (max_preview_size * 1024 * 1024))

        # 4. PDF Documents
        if self.type == 'pdf':
            max_preview_size = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
            return bool(self.file_size and self.file_size > (max_preview_size * 1024 * 1024))

        # Fallback to the persisted DB column (e.g., images, manually overridden status)
        return self.download_only

    def save(self, *args, **kwargs):
        if self._state.adding and not self.folder_id:
            # On creation, if no folder is specified, assign to the organization's root folder.
            root_folder = Folder.objects.get_root_for_org(
                organization=self.organization
            )
            self.folder = root_folder
        super().save(*args, **kwargs)


def validate_document_version_metadata(value):
    """
    Validates the keys and values inside the DocumentVersion metadata JSON field
    to ensure schema integrity.
    """
    if not isinstance(value, dict):
        raise ValidationError("metadata must be a dictionary.")

    allowed_keys = {'cloud_import'}
    invalid_keys = set(value.keys()) - allowed_keys
    if invalid_keys:
        raise ValidationError(f"Invalid keys in metadata: {', '.join(invalid_keys)}")

    if 'cloud_import' in value:
        cloud_import = value['cloud_import']
        if not isinstance(cloud_import, dict):
            raise ValidationError("metadata['cloud_import'] must be a dictionary.")

        allowed_cloud_keys = {'provider', 'provider_display', 'connection_id', 'file_id', 'etag_or_rev'}
        invalid_cloud_keys = set(cloud_import.keys()) - allowed_cloud_keys
        if invalid_cloud_keys:
            raise ValidationError(f"Invalid keys in metadata['cloud_import']: {', '.join(invalid_cloud_keys)}")

        for key in ('provider', 'provider_display', 'connection_id', 'file_id'):
            if key in cloud_import:
                val = cloud_import[key]
                if val is not None and not isinstance(val, (str, int)):
                    raise ValidationError(f"Value for '{key}' in metadata['cloud_import'] must be a string or integer.")

        if 'etag_or_rev' in cloud_import:
            val = cloud_import['etag_or_rev']
            if val is not None and not isinstance(val, str):
                raise ValidationError("Value for 'etag_or_rev' in metadata['cloud_import'] must be a string.")


class DocumentVersion(BaseModel):
    """
    Enables version control for a Document. Each version tracks a specific file state.
    """
    RENDER_NOT_APPLICABLE = 'not_applicable'
    RENDER_NOT_GENERATED = 'not_generated'
    RENDER_QUEUED = 'queued'
    RENDER_PROCESSING = 'processing'
    RENDER_READY = 'ready'
    RENDER_FAILED = 'failed'

    RENDER_STATUS_CHOICES = [
        (RENDER_NOT_APPLICABLE, 'Not applicable'),
        (RENDER_NOT_GENERATED, 'Not generated'),
        (RENDER_QUEUED, 'Queued'),
        (RENDER_PROCESSING, 'Processing'),
        (RENDER_READY, 'Ready'),
        (RENDER_FAILED, 'Failed'),
    ]

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='versions')
    version_number = models.IntegerField()
    storage_key = models.CharField(max_length=1024, blank=True)  # Key for the file to be processed into pages (e.g., a PDF).
    original_storage_key = models.CharField(max_length=1024)     # Key for the original, untouched uploaded file (e.g., .docx, .pdf).
    content_type = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=50, blank=True)
    storage_type = models.CharField(max_length=20, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    num_pages = models.IntegerField(null=True, blank=True)
    length = models.IntegerField(null=True, blank=True)
    is_primary = models.BooleanField(default=False)
    is_vertical = models.BooleanField(default=True)
    has_pages = models.BooleanField(default=False)
    render_status = models.CharField(
        max_length=20,
        choices=RENDER_STATUS_CHOICES,
        default=RENDER_NOT_APPLICABLE,
        db_index=True,
    )
    render_error = models.TextField(blank=True, null=True)

    # Expected schema for metadata:
    # {
    #     'cloud_import': {
    #         'provider': str (optional),
    #         'provider_display': str (optional),
    #         'connection_id': str/int (optional),
    #         'file_id': str (optional),
    #         'etag_or_rev': str (optional)
    #     }
    # }
    metadata = models.JSONField(
        default=dict,
        blank=True,
        validators=[validate_document_version_metadata]
    )

    def __str__(self):
        return f'{self.document.name} v{self.version_number}'


class DocumentPage(BaseModel):
    """
    Represents a single page of a processed document, typically stored as an image
    for efficient viewing.
    """
    document_version = models.ForeignKey(DocumentVersion, on_delete=models.CASCADE, related_name='pages')
    page_number = models.IntegerField()
    storage_key = models.CharField(max_length=1024)
    storage_type = models.CharField(max_length=20, blank=True)
    page_links = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f'Page {self.page_number} of {self.document_version}'
