import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from core.fields import ULIDField
from core.models import BaseModel, Organization, User
from django_cryptography.fields import encrypt


class ShareLinkTemplate(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='share_link_templates')
    name = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    expires_in_days = models.IntegerField(null=True, blank=True)
    requires_password = models.BooleanField(default=False)
    requires_email = models.BooleanField(default=False)
    requires_email_verification = models.BooleanField(default=False)
    allow_download = models.BooleanField(default=True)
    enable_watermark = models.BooleanField(default=False)
    watermark_text = models.CharField(max_length=255, blank=True)
    receive_email_notification = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class ShareLink(BaseModel):
    document = models.ForeignKey('documents.Document', on_delete=models.CASCADE, null=True, blank=True, related_name='share_links')
    dataroom = models.ForeignKey('datarooms.Dataroom', on_delete=models.CASCADE, null=True, blank=True, related_name='share_links')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='share_links_created')
    name = models.CharField(max_length=255, blank=True)
    slug = models.CharField(max_length=50, unique=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    password = encrypt(models.CharField(max_length=255, null=True, blank=True))
    requires_email = models.BooleanField(default=False)
    requires_email_verification = models.BooleanField(default=False)
    allow_download = models.BooleanField(default=True)
    enable_watermark = models.BooleanField(default=False)
    watermark_text = models.CharField(max_length=255, blank=True)
    receive_email_notification = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(document__isnull=False, dataroom__isnull=True) |
                    Q(document__isnull=True, dataroom__isnull=False)
                ),
                name='sharelink_exactly_one_target'
            )
        ]

    def __str__(self):
        return f"{self.name}-{str(self.id)}"

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


class ShareLinkDataroomSetting(BaseModel):
    share_link = models.ForeignKey('ShareLink', on_delete=models.CASCADE, related_name='dataroom_settings')
    dataroom_document = models.ForeignKey('datarooms.DataroomDocument', on_delete=models.CASCADE, null=True, blank=True)
    dataroom_folder = models.ForeignKey('datarooms.DataroomFolder', on_delete=models.CASCADE, null=True, blank=True)
    is_visible = models.BooleanField(default=True)
    allow_download = models.BooleanField(default=True)
    enable_watermark = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(dataroom_document__isnull=False, dataroom_folder__isnull=True) |
                    Q(dataroom_document__isnull=True, dataroom_folder__isnull=False)
                ),
                name='sharelinkdataroomsetting_exactly_one_target'
            )
        ]

    def __str__(self):
        target = self.dataroom_document or self.dataroom_folder
        return f"dataroom-setting for {target}, perms: {self.is_visible}, {self.allow_download}, {self.enable_watermark}"


class DataroomVisit(models.Model):
    id = ULIDField(primary_key=True, editable=False)
    view_session = models.ForeignKey('ViewSession', on_delete=models.CASCADE, related_name='dataroom_visits')
    dataroom_document = models.ForeignKey('datarooms.DataroomDocument', on_delete=models.SET_NULL, null=True, blank=True)
    dataroom_folder = models.ForeignKey('datarooms.DataroomFolder', on_delete=models.SET_NULL, null=True, blank=True)
    visited_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['visited_at']
        constraints = [
            models.CheckConstraint(
                # This constraint allows a visit to point to a document OR a folder,
                # but not both. It also allows both to be NULL, which is what happens
                # when the target item is deleted and on_delete=SET_NULL is triggered.
                condition=~Q(dataroom_document__isnull=False, dataroom_folder__isnull=False),
                name='dataroomvisit_not_both_targets'
            )
        ]


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
    share_link = models.ForeignKey('ShareLink', on_delete=models.CASCADE, related_name='view_sessions')
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
    viewed_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"ViewSession {self.id} on {self.share_link}"

    class Meta:
        ordering = ['-viewed_at']


class QnAThread(BaseModel):
    STATUS_OPEN = "open"
    STATUS_CLOSED = "closed"
    STATUS_CHOICES = (
        (STATUS_OPEN, "Open"),
        (STATUS_CLOSED, "Closed"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="qna_threads")
    share_link = models.ForeignKey("ShareLink", on_delete=models.CASCADE, related_name="qna_threads")
    dataroom = models.ForeignKey("datarooms.Dataroom", on_delete=models.CASCADE, null=True, blank=True, related_name="qna_threads")
    document = models.ForeignKey("documents.Document", on_delete=models.CASCADE, null=True, blank=True, related_name="qna_threads")
    dataroom_document = models.ForeignKey("datarooms.DataroomDocument", on_delete=models.CASCADE, null=True, blank=True, related_name="qna_threads")
    dataroom_folder = models.ForeignKey("datarooms.DataroomFolder", on_delete=models.CASCADE, null=True, blank=True, related_name="qna_threads")
    subject = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    created_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="qna_threads_created")
    created_by_viewer = models.ForeignKey("Viewer", on_delete=models.SET_NULL, null=True, blank=True, related_name="qna_threads_created")
    created_by_view_session = models.ForeignKey("ViewSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="qna_threads_created")

    class Meta:
        ordering = ["-updated_at", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    (
                        Q(document__isnull=False)
                        & Q(dataroom__isnull=True)
                        & Q(dataroom_document__isnull=True)
                        & Q(dataroom_folder__isnull=True)
                    )
                    | (
                        Q(document__isnull=True)
                        & Q(dataroom__isnull=False)
                        & Q(dataroom_document__isnull=True)
                        & Q(dataroom_folder__isnull=True)
                    )
                    | (
                        Q(document__isnull=True)
                        & Q(dataroom__isnull=False)
                        & Q(dataroom_document__isnull=False)
                        & Q(dataroom_folder__isnull=True)
                    )
                    | (
                        Q(document__isnull=True)
                        & Q(dataroom__isnull=False)
                        & Q(dataroom_document__isnull=True)
                        & Q(dataroom_folder__isnull=False)
                    )
                ),
                name="qna_thread_exactly_one_context",
            ),
            models.CheckConstraint(
                # Creator principals use SET_NULL so Q&A history can survive
                # user/session deletion. Enforce at most one live principal.
                condition=~(
                    Q(created_by_user__isnull=False)
                    & Q(created_by_view_session__isnull=False)
                ),
                name="qna_thread_at_most_one_creator_type",
            ),
        ]

    def __str__(self):
        return f"{self.subject[:80]} ({self.status})"


class QnAMessage(BaseModel):
    thread = models.ForeignKey(QnAThread, on_delete=models.CASCADE, related_name="messages")
    body = models.TextField()
    sent_by_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="qna_messages_sent")
    sent_by_viewer = models.ForeignKey("Viewer", on_delete=models.SET_NULL, null=True, blank=True, related_name="qna_messages_sent")
    sent_by_view_session = models.ForeignKey("ViewSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="qna_messages_sent")

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.CheckConstraint(
                # Sender principals use SET_NULL so message history can survive
                # user/session deletion. Enforce at most one live principal.
                condition=~(
                    Q(sent_by_user__isnull=False)
                    & Q(sent_by_view_session__isnull=False)
                ),
                name="qna_message_at_most_one_sender_type",
            ),
        ]

    def __str__(self):
        return f"Message on {self.thread_id}"


class PageView(models.Model):
    """
    Records a granular page view event within a single viewing session (ViewSession).
    """
    id = ULIDField(primary_key=True, editable=False)
    view_session = models.ForeignKey('ViewSession', on_delete=models.CASCADE, related_name='page_views')
    dataroom_visit = models.ForeignKey('DataroomVisit', on_delete=models.SET_NULL, null=True, blank=True, related_name='page_views')
    page_number = models.PositiveIntegerField()
    duration_seconds = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"PageView {self.id} for ViewSession {self.view_session.id}, Page {self.page_number}"
