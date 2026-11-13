import secrets

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from core.fields import ULIDField
from core.models import BaseModel, Organization, User

SEAL_METHOD_VISUAL_HASH = 'visual_hash'
SEAL_METHOD_PADES_X509 = 'pades_x509'
SEAL_METHOD_CHOICES = (
    (SEAL_METHOD_VISUAL_HASH, 'Visual Stamp + SHA-256'),
    (SEAL_METHOD_PADES_X509, 'PAdES X.509 Seal'),
)


class SignatureRequest(BaseModel):
    STATUS_DRAFT = 'draft'
    STATUS_SENT = 'sent'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_COMPLETED = 'completed'
    STATUS_DECLINED = 'declined'
    STATUS_VOIDED = 'voided'
    STATUS_CHOICES = (
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SENT, 'Sent'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_DECLINED, 'Declined'),
        (STATUS_VOIDED, 'Voided'),
    )

    MODE_DIRECT = 'direct_recipients'
    MODE_TEMPLATE = 'template_link'
    SIGNING_MODE_CHOICES = (
        (MODE_DIRECT, 'Direct Recipients'),
        (MODE_TEMPLATE, 'Template Link'),
    )

    ORDER_PARALLEL = 'parallel'
    ORDER_SEQUENTIAL = 'sequential'
    SIGNING_ORDER_CHOICES = (
        (ORDER_PARALLEL, 'Parallel'),
        (ORDER_SEQUENTIAL, 'Sequential'),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='signature_requests')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='signature_requests_created')
    document = models.ForeignKey('documents.Document', on_delete=models.CASCADE, related_name='signature_requests')
    document_version = models.ForeignKey('documents.DocumentVersion', on_delete=models.PROTECT, related_name='signature_requests')
    dataroom = models.ForeignKey('datarooms.Dataroom', null=True, blank=True, on_delete=models.SET_NULL, related_name='signature_requests')
    idempotency_key = models.CharField(max_length=200, blank=True, default='')
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    signing_mode = models.CharField(max_length=24, choices=SIGNING_MODE_CHOICES, default=MODE_DIRECT)
    signing_order = models.CharField(max_length=20, choices=SIGNING_ORDER_CHOICES, default=ORDER_PARALLEL)
    current_order_index = models.IntegerField(default=1)
    original_file_sha256 = models.CharField(max_length=64, blank=True, default='')
    completed_file_storage_key = models.CharField(max_length=512, blank=True, default='')
    completed_file_sha256 = models.CharField(max_length=64, blank=True, default='')
    seal_method = models.CharField(max_length=24, choices=SEAL_METHOD_CHOICES, default=SEAL_METHOD_VISUAL_HASH)
    certificate_storage_key = models.CharField(max_length=512, blank=True, default='')
    vault_dataroom_document = models.ForeignKey(
        'datarooms.DataroomDocument',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='executed_signature_requests',
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=255, blank=True, default='')
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['created_by', 'idempotency_key'],
                condition=~Q(idempotency_key=''),
                name='uq_esign_request_owner_idempotency',
            )
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"


class Signer(BaseModel):
    STATUS_PENDING = 'pending'
    STATUS_NOTIFIED = 'notified'
    STATUS_VIEWED = 'viewed'
    STATUS_SIGNED = 'signed'
    STATUS_DECLINED = 'declined'
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_NOTIFIED, 'Notified'),
        (STATUS_VIEWED, 'Viewed'),
        (STATUS_SIGNED, 'Signed'),
        (STATUS_DECLINED, 'Declined'),
    )

    ACTIVE_SIGNABLE_STATUSES = (STATUS_PENDING, STATUS_NOTIFIED, STATUS_VIEWED)

    request = models.ForeignKey(SignatureRequest, on_delete=models.CASCADE, related_name='signers')
    email = models.EmailField()
    name = models.CharField(max_length=255, blank=True, default='')
    role = models.CharField(max_length=100, blank=True, default='Signer')
    order_index = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(20)],
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    access_token = models.CharField(max_length=64, unique=True, db_index=True)
    declined_reason = models.TextField(blank=True, default='')
    signed_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['order_index', 'created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['request', 'email'],
                name='uq_esign_signer_request_email',
            )
        ]

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        if not self.access_token:
            self.access_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def can_sign(self) -> bool:
        if self.status not in self.ACTIVE_SIGNABLE_STATUSES:
            return False
        if self.request.status not in (SignatureRequest.STATUS_SENT, SignatureRequest.STATUS_IN_PROGRESS):
            return False
        if self.request.signing_order != SignatureRequest.ORDER_SEQUENTIAL:
            return True
        has_uncompleted_predecessors = self.request.signers.filter(
            order_index__lt=self.order_index
        ).exclude(status=self.STATUS_SIGNED).exists()
        return not has_uncompleted_predecessors

    def __str__(self) -> str:
        return f"{self.email} ({self.status})"


class SignatureField(BaseModel):
    TYPE_SIGNATURE = 'signature'
    TYPE_INITIALS = 'initials'
    TYPE_DATE = 'date'
    TYPE_FULL_NAME = 'full_name'
    TYPE_TITLE = 'title'
    TYPE_COMPANY = 'company'
    TYPE_TEXT = 'text'
    TYPE_CHECKBOX = 'checkbox'
    FIELD_TYPE_CHOICES = (
        (TYPE_SIGNATURE, 'Signature'),
        (TYPE_INITIALS, 'Initials'),
        (TYPE_DATE, 'Date'),
        (TYPE_FULL_NAME, 'Full Name'),
        (TYPE_TITLE, 'Title'),
        (TYPE_COMPANY, 'Company'),
        (TYPE_TEXT, 'Text'),
        (TYPE_CHECKBOX, 'Checkbox'),
    )

    request = models.ForeignKey(SignatureRequest, on_delete=models.CASCADE, related_name='fields')
    signer = models.ForeignKey(Signer, null=True, blank=True, on_delete=models.CASCADE, related_name='fields')
    field_type = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES, default=TYPE_SIGNATURE)
    page_number = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(500)])
    x = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(100.0)])
    y = models.FloatField(validators=[MinValueValidator(0.0), MaxValueValidator(100.0)])
    width = models.FloatField(validators=[MinValueValidator(0.1), MaxValueValidator(100.0)])
    height = models.FloatField(validators=[MinValueValidator(0.1), MaxValueValidator(100.0)])
    is_required = models.BooleanField(default=True)
    value = models.TextField(blank=True, default='')
    signature_image_storage_key = models.CharField(max_length=512, blank=True, default='')

    class Meta:
        ordering = ['page_number', 'y', 'x', 'created_at']

    def __str__(self) -> str:
        return f"{self.field_type} p{self.page_number} ({self.x}, {self.y})"


class SignatureAuditTrail(models.Model):
    EVENT_CREATED = 'created'
    EVENT_SENT = 'sent'
    EVENT_VIEWED = 'viewed'
    EVENT_FIELD_UPDATED = 'field_updated'
    EVENT_SIGNED = 'signed'
    EVENT_COMPLETED = 'completed'
    EVENT_DECLINED = 'declined'
    EVENT_VOIDED = 'voided'
    EVENT_CHOICES = (
        (EVENT_CREATED, 'Created'),
        (EVENT_SENT, 'Sent'),
        (EVENT_VIEWED, 'Viewed'),
        (EVENT_FIELD_UPDATED, 'Field Updated'),
        (EVENT_SIGNED, 'Signed'),
        (EVENT_COMPLETED, 'Completed'),
        (EVENT_DECLINED, 'Declined'),
        (EVENT_VOIDED, 'Voided'),
    )

    id = ULIDField(primary_key=True, editable=False)
    request = models.ForeignKey(SignatureRequest, on_delete=models.CASCADE, related_name='audit_events')
    signer = models.ForeignKey(Signer, null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_events')
    event_type = models.CharField(max_length=24, choices=EVENT_CHOICES)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    details = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp', 'id']

    def __str__(self) -> str:
        return f"{self.event_type} on {self.request_id}"


class SignerPageView(models.Model):
    """Records pre-signature page dwell engagement for a Signer session."""
    id = ULIDField(primary_key=True, editable=False)
    request = models.ForeignKey(SignatureRequest, on_delete=models.CASCADE, related_name='signer_page_views')
    signer = models.ForeignKey(Signer, on_delete=models.CASCADE, related_name='page_views')
    page_number = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(500)])
    duration_seconds = models.PositiveIntegerField(validators=[MinValueValidator(0), MaxValueValidator(86400)])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self) -> str:
        return f"Signer {self.signer_id} p{self.page_number} ({self.duration_seconds}s)"
