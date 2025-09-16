import secrets
from django.db import models

from core.fields import ULIDField
from core.models import BaseModel, Organization, User


class Folder(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=255)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')

    def __str__(self):
        return self.name


class Document(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='documents')
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    name = models.CharField(max_length=255)
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
    storage_key = models.CharField(max_length=1024, blank=True, null=True)
    original_storage_key = models.CharField(max_length=1024, blank=True, null=True)
    type = models.CharField(max_length=20)
    content_type = models.CharField(max_length=255)
    num_pages = models.IntegerField(null=True, blank=True)
    download_only = models.BooleanField(default=False)
    assistant_enabled = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='documents_created')

    def __str__(self):
        return self.name


class DocumentVersion(BaseModel):
    """
    Enables version control for a Document. Each version tracks a specific file state.
    """
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='versions')
    version_number = models.IntegerField()
    storage_key = models.CharField(max_length=1024, blank=True)
    original_storage_key = models.CharField(max_length=1024)
    content_type = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=50, blank=True)
    storage_type = models.CharField(max_length=20, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    num_pages = models.IntegerField(null=True, blank=True)
    length = models.IntegerField(null=True, blank=True)
    is_primary = models.BooleanField(default=False)
    is_vertical = models.BooleanField(default=True)
    has_pages = models.BooleanField(default=False)

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


class ShareLinkPreset(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='share_link_presets')
    name = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    expires_in_days = models.IntegerField(null=True, blank=True)
    requires_password = models.BooleanField(default=False)
    requires_email_verification = models.BooleanField(default=False)
    allow_download = models.BooleanField(default=True)
    enable_watermark = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class ShareLink(BaseModel):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='share_links')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='share_links_created')
    name = models.CharField(max_length=255, blank=True)
    slug = models.CharField(max_length=50, unique=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    requires_email_verification = models.BooleanField(default=False)
    allow_download = models.BooleanField(default=True)
    enable_watermark = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)

    def __str__(self):
        return self.name or str(self.id)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = secrets.token_urlsafe(16)
        super().save(*args, **kwargs)


class Viewer(models.Model):
    id = ULIDField(primary_key=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='viewers')
    email = models.EmailField()

    class Meta:
        unique_together = ('organization', 'email')

    def __str__(self):
        return self.email


class View(models.Model):
    id = ULIDField(primary_key=True, editable=False)
    share_link = models.ForeignKey(ShareLink, on_delete=models.CASCADE, related_name='views')
    viewer = models.ForeignKey(Viewer, on_delete=models.SET_NULL, null=True, blank=True, related_name='views')
    viewer_email = models.EmailField(blank=True)
    duration_seconds = models.IntegerField()
    completion_rate = models.FloatField()
    viewed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"View {self.id} on {self.share_link}"
