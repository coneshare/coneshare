import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone
from datetime import timedelta

from core.fields import ULIDField
from core.models import BaseModel, Organization, User


class Folder(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=255)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='folders_created')

    class Meta:
        unique_together = ('organization', 'parent', 'name')

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

    def save(self, *args, **kwargs):
        if self._state.adding and not self.folder_id:
            # On creation, if no folder is specified, assign to the organization's root folder.
            root_folder = Folder.objects.get(
                organization=self.organization,
                parent=None,
                name='__root__'
            )
            self.folder = root_folder
        super().save(*args, **kwargs)


class DocumentVersion(BaseModel):
    """
    Enables version control for a Document. Each version tracks a specific file state.
    """
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
    requires_email = models.BooleanField(default=False)
    requires_email_verification = models.BooleanField(default=False)
    allow_download = models.BooleanField(default=True)
    enable_watermark = models.BooleanField(default=False)
    receive_email_notification = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class ShareLink(BaseModel):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='share_links')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='share_links_created')
    name = models.CharField(max_length=255, blank=True)
    slug = models.CharField(max_length=50, unique=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    requires_email = models.BooleanField(default=False)
    requires_email_verification = models.BooleanField(default=False)
    allow_download = models.BooleanField(default=True)
    enable_watermark = models.BooleanField(default=False)
    receive_email_notification = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name or str(self.id)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = secrets.token_urlsafe(16)
        super().save(*args, **kwargs)


class EmailVerificationToken(models.Model):
    """
    A temporary, single-use token to verify a viewer's email address
    for a share link.
    """
    id = ULIDField(primary_key=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    share_link = models.ForeignKey('ShareLink', on_delete=models.CASCADE, related_name='email_verification_tokens')
    email = models.EmailField()
    expires_at = models.DateTimeField()

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            # Set expiry for 15 minutes from now.
            self.expires_at = timezone.now() + timedelta(minutes=15)
        super().save(*args, **kwargs)

    def is_expired(self):
        return self.expires_at < timezone.now()


class Viewer(models.Model):
    id = ULIDField(primary_key=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='viewers')
    email = models.EmailField()

    class Meta:
        unique_together = ('organization', 'email')

    def __str__(self):
        return self.email


class ViewSession(models.Model):
    id = ULIDField(primary_key=True, editable=False)
    share_link = models.ForeignKey(ShareLink, on_delete=models.CASCADE, related_name='view_sessions')
    viewer = models.ForeignKey(Viewer, on_delete=models.SET_NULL, null=True, blank=True, related_name='view_sessions')
    viewer_email = models.EmailField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    duration_seconds = models.IntegerField(default=0)
    completion_rate = models.FloatField(default=0.0)
    downloaded_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"ViewSession {self.id} on {self.share_link}"


class PageView(models.Model):
    """
    Records a granular page view event within a single viewing session (ViewSession).
    """
    id = ULIDField(primary_key=True, editable=False)
    view_session = models.ForeignKey('ViewSession', on_delete=models.CASCADE, related_name='page_views')
    page_number = models.PositiveIntegerField()
    duration_seconds = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"PageView {self.id} for ViewSession {self.view_session.id}, Page {self.page_number}"


class PreviewSession(BaseModel):
    """
    A temporary, single-use session for a user to preview a share link,
    bypassing its security settings.
    """
    token = models.CharField(max_length=64, unique=True, db_index=True)
    share_link = models.ForeignKey('ShareLink', on_delete=models.CASCADE, related_name='preview_sessions')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    expires_at = models.DateTimeField()

    def is_expired(self):
        return self.expires_at < timezone.now()
