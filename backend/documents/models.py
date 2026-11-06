import os
import posixpath
from typing import List, Optional, TypedDict

from django.db import models
from django.db.models import Q
from django.core.exceptions import ValidationError
from django.conf import settings

from core.models import BaseModel, Organization, User
from core.services import get_dynamic_setting


class SoftDeleteQuerySet(models.QuerySet):
    def active(self):
        return self.filter(deleted_at__isnull=True)

    def deleted(self):
        return self.filter(deleted_at__isnull=False)

class FolderManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    def get_root_for_org(self, organization):
        """
        Retrieves the invisible __root__ folder for a given organization.
        Raises Folder.DoesNotExist if the root folder is not found, which
        indicates a critical configuration issue.
        """
        return self.get(organization=organization, name='__root__', parent=None)


class DocumentManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    pass


class Folder(BaseModel):
    FOLDER_TYPE_ROOT = 'root'
    FOLDER_TYPE_PERSONAL = 'personal'
    FOLDER_TYPE_VAULT = 'vault'

    FOLDER_TYPE_CHOICES = [
        (FOLDER_TYPE_ROOT, 'Org Root'),
        (FOLDER_TYPE_PERSONAL, 'Personal'),
        (FOLDER_TYPE_VAULT, 'System Vault'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=255, db_index=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='folders_created')
    folder_type = models.CharField(
        max_length=20,
        choices=FOLDER_TYPE_CHOICES,
        default=FOLDER_TYPE_PERSONAL,
        db_index=True,
    )
    is_starred = models.BooleanField(default=False)
    
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='folders_deleted'
    )

    objects = FolderManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['created_by', 'parent', 'name'],
                condition=Q(deleted_at__isnull=True),
                name='unique_active_folder_name'
            ),
            models.UniqueConstraint(
                fields=['organization', 'parent', 'name'],
                condition=Q(folder_type='vault', deleted_at__isnull=True),
                name='unique_active_vault_folder_name'
            ),
            models.CheckConstraint(
                condition=(
                    Q(folder_type='root', parent__isnull=True, created_by__isnull=True) |
                    Q(folder_type='personal', created_by__isnull=False) |
                    Q(folder_type='vault', parent__isnull=False, created_by__isnull=True)
                ),
                name='folder_type_structural_invariant',
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.folder_type == self.FOLDER_TYPE_ROOT:
            if self.parent_id is not None or self.created_by_id is not None:
                raise ValidationError("Root folder must have parent=None and created_by=None.")
        elif self.folder_type == self.FOLDER_TYPE_PERSONAL:
            if self.created_by_id is None:
                raise ValidationError("Personal folder must have created_by set.")
        elif self.folder_type == self.FOLDER_TYPE_VAULT:
            if self.parent_id is None:
                raise ValidationError("Vault folder must have a parent folder.")
            if self.created_by_id is not None:
                raise ValidationError("Vault folder must have created_by=None.")

    @classmethod
    def get_or_create_vault_subfolder(cls, *, organization, parent, name, **kwargs):
        """Sanctioned vault subfolder creation. Enforces folder_type and created_by invariant."""
        assert parent.folder_type == cls.FOLDER_TYPE_VAULT, (
            f"Parent folder {parent.id!r} is not a vault folder (got {parent.folder_type!r})."
        )
        if {'folder_type', 'created_by'} & kwargs.keys():
            raise ValueError("Vault folder type and creator are fixed.")
        return cls.objects.get_or_create(
            organization=organization,
            parent=parent,
            name=name,
            folder_type=cls.FOLDER_TYPE_VAULT,
            created_by=None,
            defaults=kwargs,
        )

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
    storage_key = models.CharField(max_length=1024, blank=True, null=True, db_index=True)
    original_storage_key = models.CharField(max_length=1024, blank=True, null=True, db_index=True)
    type = models.CharField(max_length=20)
    content_type = models.CharField(max_length=255)
    num_pages = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    download_only = models.BooleanField(default=False)
    assistant_enabled = models.BooleanField(default=False)
    is_starred = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='documents_created')
    metadata = models.JSONField(blank=True, default=dict)
    
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents_deleted'
    )

    objects = DocumentManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['created_by', 'folder', 'name'],
                condition=Q(deleted_at__isnull=True),
                name='unique_active_document_name'
            )
        ]

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

        # 5. Spreadsheets
        if self.type == 'spreadsheet':
            max_preview_size = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
            return bool(self.file_size and self.file_size > (max_preview_size * 1024 * 1024))

        # 6. Markdown Documents
        if self.type == 'markdown':
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


def sanitize_filename(name: Optional[str], max_length: int = 255) -> str:
    """
    Sanitizes a client-supplied filename:
    - Strips leading/trailing whitespace.
    - Strips directory components and path separators (cross-platform).
    - Removes ASCII control characters (< 32, 127).
    - Removes trailing dots and spaces.
    - Prevents directory traversal tokens ('.', '..').
    - Binds length to max_length while preserving file extension.
    """
    if not name or not isinstance(name, str):
        return ""

    s = name.strip()
    s = s.replace('\\', '/')
    s = posixpath.basename(s)

    s = "".join(c for c in s if ord(c) >= 32 and ord(c) != 127)
    s = s.rstrip('. ')

    if not s or s in {'.', '..'}:
        return ""

    if len(s) > max_length:
        base, ext = posixpath.splitext(s)
        allowed_base = max(1, max_length - len(ext))
        s = f"{base[:allowed_base]}{ext}"[:max_length]

    return s


def resolve_version_filename(
    document_name: str,
    storage_key: str = '',
    file_name: Optional[str] = None
) -> str:
    """
    Resolves the canonical filename for a document version:
    1. Returns sanitized client-supplied file_name if present.
    2. Falls back to document_name with storage_key extension if storage_key has an extension.
    3. Falls back to document_name or storage_key basename.
    """
    if file_name:
        clean = sanitize_filename(file_name)
        if clean:
            return clean

    doc_base, _ = posixpath.splitext(document_name) if document_name else ('', '')
    key_ext = posixpath.splitext(storage_key)[1] if storage_key else ''

    if doc_base and key_ext:
        return f"{doc_base}{key_ext}"

    return document_name or (posixpath.basename(storage_key) if storage_key else '')


def validate_document_version_metadata(value):
    """
    Validates the keys and values inside the DocumentVersion metadata JSON field
    to ensure schema integrity.
    """
    if not isinstance(value, dict):
        raise ValidationError("metadata must be a dictionary.")

    allowed_keys = {'cloud_import', 'file_name'}
    invalid_keys = set(value.keys()) - allowed_keys
    if invalid_keys:
        raise ValidationError(f"Invalid keys in metadata: {', '.join(invalid_keys)}")

    if 'file_name' in value:
        val = value['file_name']
        if val is not None:
            if not isinstance(val, str):
                raise ValidationError("Value for 'file_name' in metadata must be a string.")
            if len(val) > 255:
                raise ValidationError("Value for 'file_name' in metadata cannot exceed 255 characters.")
            if any(ord(c) < 32 or ord(c) == 127 for c in val):
                raise ValidationError("Value for 'file_name' in metadata contains invalid control characters.")
            if '/' in val or '\\' in val or val in ('.', '..'):
                raise ValidationError("Value for 'file_name' in metadata cannot contain path separators or traversal characters.")

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
    storage_key = models.CharField(max_length=1024, blank=True, db_index=True)  # Key for the file to be processed into pages (e.g., a PDF).
    original_storage_key = models.CharField(max_length=1024, db_index=True)     # Key for the original, untouched uploaded file (e.g., .docx, .pdf).
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
    #     'file_name': str (optional, max 255 chars, sanitized original version file name),
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

    def get_filename(self) -> str:
        """
        Returns the original filename for this specific version.
        Prioritizes the uploaded file_name recorded in metadata,
        falling back to document.name for version 1, or document.name with version storage_key extension.
        """
        stored_name = self.metadata.get('file_name') if isinstance(self.metadata, dict) else None
        if stored_name:
            clean = sanitize_filename(stored_name)
            if clean:
                return clean
        doc = self.document if self.document_id else None
        doc_name = doc.name if doc and doc.name else ''
        if self.version_number == 1 and doc_name:
            return doc_name
        key = self.original_storage_key or self.storage_key or ''
        return resolve_version_filename(doc_name, key, None)

    def __str__(self):
        return f'{self.document.name} v{self.version_number}'


class BoundingBoxDict(TypedDict):
    left: float
    top: float
    width: float
    height: float


class PageTextLineDict(TypedDict):
    text: str
    bbox: BoundingBoxDict
    font_size_pt: float


class PageTextContentDict(TypedDict):
    lines: List[PageTextLineDict]


class DocumentPageMetadataDict(TypedDict, total=False):
    text_content: PageTextContentDict
    width: int
    height: int


class DocumentPage(BaseModel):
    """
    Represents a single page of a processed document, typically stored as an image
    for efficient viewing.
    """
    document_version = models.ForeignKey(DocumentVersion, on_delete=models.CASCADE, related_name='pages')
    page_number = models.IntegerField()
    storage_key = models.CharField(max_length=1024, db_index=True)
    storage_type = models.CharField(max_length=20, blank=True)
    page_links = models.JSONField(default=dict, blank=True)

    # Expected schema for metadata: DocumentPageMetadataDict
    # {
    #     'text_content': {'lines': [{'text': str, 'bbox': {'left': float, 'top': float, 'width': float, 'height': float}, 'font_size_pt': float}]},
    #     'width': int (optional),
    #     'height': int (optional),
    # }
    metadata: DocumentPageMetadataDict = models.JSONField(default=dict, blank=True)  # type: ignore[assignment]

    @property
    def text_content(self) -> PageTextContentDict:
        if not self.metadata or not isinstance(self.metadata, dict):
            return {"lines": []}
        return self.metadata.get('text_content', {"lines": []})

    @text_content.setter
    def text_content(self, value: PageTextContentDict) -> None:
        if self.metadata is None or not isinstance(self.metadata, dict):
            self.metadata = {}
        self.metadata['text_content'] = value

    @property
    def width(self) -> Optional[int]:
        if not self.metadata or not isinstance(self.metadata, dict):
            return None
        return self.metadata.get('width')

    @width.setter
    def width(self, value: Optional[int]) -> None:
        if self.metadata is None or not isinstance(self.metadata, dict):
            self.metadata = {}
        if value is None:
            self.metadata.pop('width', None)
        else:
            self.metadata['width'] = value

    @property
    def height(self) -> Optional[int]:
        if not self.metadata or not isinstance(self.metadata, dict):
            return None
        return self.metadata.get('height')

    @height.setter
    def height(self, value: Optional[int]) -> None:
        if self.metadata is None or not isinstance(self.metadata, dict):
            self.metadata = {}
        if value is None:
            self.metadata.pop('height', None)
        else:
            self.metadata['height'] = value

    @property
    def plain_text(self) -> str:
        """
        Returns a continuous text string of the page contents, useful for
        full-text search indexing, embeddings, and text extraction.
        """
        lines = self.text_content.get('lines', [])
        return "\n".join(
            line['text'] for line in lines
            if isinstance(line, dict) and line.get('text')
        )

    def __str__(self):
        return f'Page {self.page_number} of {self.document_version}'
