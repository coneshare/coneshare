import secrets

from django.db import models

from core.models import BaseModel, User
from documents.models import Folder


class FileRequest(BaseModel):
    """
    Represents a secure, shareable link for collecting files from external parties.
    """
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name='file_requests')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='file_requests_created')
    name = models.CharField(max_length=255, blank=True)
    slug = models.CharField(max_length=50, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    max_file_size = models.BigIntegerField(
        null=True, blank=True, help_text="Maximum file size in bytes."
    )
    allowed_file_types = models.JSONField(
        null=True, blank=True, help_text="List of allowed file extensions, e.g., ['.pdf', '.docx']"
    )

    def __str__(self):
        return f"File Request for {self.folder.name} by {self.created_by.email}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = secrets.token_urlsafe(16)
        super().save(*args, **kwargs)
