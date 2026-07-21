import os

from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.contrib.auth.models import AbstractUser, Group
from django.db import models
from django.db.models import Sum

from core.fields import ULIDField
from .managers import UserManager

class BaseModel(models.Model):
    """
    An abstract base class model that provides a ULID primary key,
    and self-updating ``created_at`` and ``updated_at`` fields.
    """
    id = ULIDField(primary_key=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


def user_avatar_path(instance, filename):
    """
    Generates a unique path for a user's avatar image.
    e.g., avatars/usr_0123456789ABCDEF/pic.jpg
    """
    _, extension = os.path.splitext(filename)
    return f'avatars/{instance.id}/pic{extension}'


def organization_logo_path(instance, filename):
    """
    Generates a unique path for an organization's brand logo image.
    e.g., logos/org_0123456789ABCDEF/logo.jpg
    """
    _, extension = os.path.splitext(filename)
    return f'logos/{instance.id}/logo{extension}'


def validate_branding_extras(value):
    """
    Validates the keys and values inside the branding_extras JSON field
    to ensure schema integrity.
    """
    if not isinstance(value, dict):
        raise ValidationError("branding_extras must be a dictionary.")

    allowed_keys = {'terms_url', 'privacy_policy_url'}
    invalid_keys = set(value.keys()) - allowed_keys
    if invalid_keys:
        raise ValidationError(f"Invalid keys in branding_extras: {', '.join(invalid_keys)}")

    for key, val in value.items():
        if val is not None and not isinstance(val, str):
            raise ValidationError(f"Value for '{key}' must be a string.")


class Organization(BaseModel):
    """
    The top-level tenant in the system. It is the ultimate owner of all
    resources.
    """
    name = models.CharField(max_length=255)
    plan = models.CharField(max_length=50, default='self-hosted')
    stripe_customer_id = models.CharField(max_length=255, null=True, blank=True)
    brand_logo = models.FileField(
        upload_to=organization_logo_path,
        null=True,
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=['png', 'jpg', 'jpeg', 'svg'])]
    )
    brand_name = models.CharField(max_length=255, null=True, blank=True)
    brand_website_url = models.URLField(max_length=500, null=True, blank=True)

    # Expected schema for branding_extras:
    # {
    #     'terms_url': str (optional URL),
    #     'privacy_policy_url': str (optional URL)
    # }
    branding_extras = models.JSONField(
        default=dict,
        blank=True,
        validators=[validate_branding_extras]
    )

    def __str__(self):
        return self.name


class User(AbstractUser):
    """
    Represents an individual user account belonging to an Organization.
    """
    id = ULIDField(primary_key=True, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='users')
    avatar = models.ImageField(upload_to=user_avatar_path, null=True, blank=True)
    role = models.CharField(max_length=20, default='member')
    name = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    # TODO: add a periodic background task (e.g., a nightly Celery job) to recalculate
    # and correct the total_document_size for all users.
    total_document_size = models.BigIntegerField(
        default=0,
        help_text='Total size of all documents in bytes.'
    )
    custom_file_size_quota_mb = models.IntegerField(
        null=True,
        blank=True,
        help_text='Per-user custom file size quota in MB. If null, the global config is used. 0 means unlimited.'
    )

    @property
    def effective_file_size_quota_mb(self) -> int:
        if self.custom_file_size_quota_mb is not None:
            return self.custom_file_size_quota_mb
        from core.services import get_dynamic_setting
        return get_dynamic_setting('FILE_SIZE_QUOTA_MB')

    # Use a single `name` field instead of first/last name.
    first_name = None
    last_name = None

    # Email is unique and used for login.
    email = models.EmailField("email address", unique=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    objects = UserManager()

    def __str__(self):
        return self.email


class UserGroup(Group):
    """
    A named group of users within an Organization, used for assigning
    permissions. Extends Django's built-in Group model.
    """
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='user_groups')

    class Meta:
        verbose_name = 'User Group'
        verbose_name_plural = 'User Groups'


class LoginActivity(BaseModel):
    """
    Records a user login event for security and auditing purposes.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='login_activities')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Login Activity"
        verbose_name_plural = "Login Activities"

    def __str__(self):
        return f"{self.user.email} logged in at {self.created_at}"


class AppConfiguration(models.Model):
    """
    Stores dynamic, admin-configurable settings as key-value pairs.
    """
    key = models.CharField(max_length=100, unique=True, primary_key=True)
    value = models.TextField(blank=True)
    description = models.TextField(
        blank=True,
        help_text="A description of what this setting controls."
    )

    def __str__(self):
        return self.key

    class Meta:
        verbose_name = "Application Configuration"
        verbose_name_plural = "Application Configurations"
        ordering = ('key',)
