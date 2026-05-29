import secrets

from django.db import models

from core.models import BaseModel, Organization, User
from documents.models import Document, Folder


class FileRequest(BaseModel):
    """
    Represents a secure, shareable link for collecting files from external parties.
    """
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name='file_requests')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='file_requests_created')
    name = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    slug = models.CharField(max_length=50, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    max_file_size = models.BigIntegerField(
        null=True, blank=True, help_text="Maximum file size in bytes."
    )
    allowed_file_types = models.JSONField(
        null=True, blank=True, help_text="List of allowed file extensions, e.g., ['.pdf', '.docx']"
    )
    custom_fields = models.JSONField(
        default=list,
        blank=True,
        help_text="Optional public intake field schema for this file request.",
    )

    def __str__(self):
        return f"File Request for {self.folder.name} by {self.created_by.email}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = secrets.token_urlsafe(16)
        super().save(*args, **kwargs)


class UploadedFile(BaseModel):
    """
    Links a Document uploaded via a FileRequest to the request itself
    and stores the uploader's information.
    """
    file_request = models.ForeignKey(FileRequest, on_delete=models.CASCADE, related_name='uploaded_files')
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='uploaded_via_file_request')
    uploader_name = models.CharField(max_length=255)
    uploader_email = models.EmailField()
    submitted_fields = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"'{self.document.name}' uploaded by {self.uploader_email} for request '{self.file_request.name}'"


class SecurityThreatEvent(BaseModel):
    """
    Audit record for file-request upload security incidents.
    """
    class EventType(models.TextChoices):
        MALWARE_DETECTED = 'malware_detected', 'Malware Detected'
        SCAN_FAILED = 'scan_failed', 'Scanner Failed'

    class Severity(models.TextChoices):
        HIGH = 'high', 'High'
        MEDIUM = 'medium', 'Medium'

    class Status(models.TextChoices):
        NEW = 'new', 'New'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        RESOLVED = 'resolved', 'Resolved'

    class StorageCleanupStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        DELETED = 'deleted', 'Deleted'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='security_threat_events')
    owner_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='security_threat_events')
    file_request = models.ForeignKey(FileRequest, on_delete=models.CASCADE, related_name='security_threat_events')
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    severity = models.CharField(max_length=16, choices=Severity.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)
    storage_key = models.CharField(max_length=1024, blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    content_type = models.CharField(max_length=255, blank=True)
    uploader_name = models.CharField(max_length=255, blank=True)
    uploader_email = models.EmailField(blank=True)
    scanner_engine = models.CharField(max_length=64, default='clamav')
    scanner_message = models.TextField(blank=True)
    storage_cleanup_status = models.CharField(
        max_length=16,
        choices=StorageCleanupStatus.choices,
        default=StorageCleanupStatus.PENDING,
    )
    storage_cleanup_at = models.DateTimeField(null=True, blank=True)
    storage_cleanup_error = models.TextField(blank=True)

    def __str__(self):
        return f"{self.event_type} for {self.file_request.slug} ({self.created_at})"
