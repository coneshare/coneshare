from django.db import models

from django_cryptography.fields import encrypt

from core.models import BaseModel, User


class CloudConnection(BaseModel):
    """
    Stores user-specific authorization tokens for a cloud provider.
    """
    PROVIDER_CHOICES = [
        ('dropbox', 'Dropbox'),
        ('google_drive', 'Google Drive'),
        ('nextcloud', 'Nextcloud'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cloud_connections')
    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES)
    email = models.EmailField(blank=True)
    # In a production environment, these tokens should be encrypted at rest
    # using a library like django-cryptography.
    access_token = encrypt(models.TextField())
    refresh_token = encrypt(models.TextField(blank=True, null=True))
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('user', 'provider')

    def __str__(self):
        return f"{self.user}'s {self.get_provider_display()} Connection"
