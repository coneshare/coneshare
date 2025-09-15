from django.contrib.auth.models import AbstractUser, Group
from django.db import models

from core.fields import ULIDField

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


class Organization(BaseModel):
    """
    The top-level tenant in the system. It is the ultimate owner of all
    resources.
    """
    name = models.CharField(max_length=255)
    plan = models.CharField(max_length=50, default='self-hosted')
    stripe_customer_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return self.name


class User(AbstractUser):
    """
    Represents an individual user account belonging to an Organization.
    """
    id = ULIDField(primary_key=True, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='users')
    avatar_url = models.URLField(max_length=512, null=True, blank=True)
    role = models.CharField(max_length=20, default='member')
    name = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Use a single `name` field instead of first/last name.
    first_name = None
    last_name = None

    # Email is unique and used for login.
    email = models.EmailField("email address", unique=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

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
