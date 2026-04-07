from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django_cryptography.fields import encrypt

from core.models import BaseModel, Organization, User


class AutomationDestination(BaseModel):
    class DestinationType(models.TextChoices):
        WEBHOOK = 'webhook', 'Webhook'
        SLACK = 'slack', 'Slack'

    class HttpMethod(models.TextChoices):
        POST = 'POST', 'POST'
        PUT = 'PUT', 'PUT'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='automation_destinations')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='automation_destinations_created')
    name = models.CharField(max_length=255)
    destination_type = models.CharField(max_length=20, choices=DestinationType.choices, default=DestinationType.WEBHOOK)
    endpoint_url = models.URLField(max_length=2048)
    http_method = models.CharField(max_length=10, choices=HttpMethod.choices, default=HttpMethod.POST)
    headers = models.JSONField(default=dict, blank=True)
    signing_secret = encrypt(models.CharField(max_length=255, null=True, blank=True))
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('organization', 'name')

    def __str__(self):
        return self.name


class AutomationRule(BaseModel):
    class ScopeType(models.TextChoices):
        GLOBAL = 'global', 'Global'
        SHARE_LINK = 'share_link', 'Share Link'
        DATAROOM = 'dataroom', 'Dataroom'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='automation_rules')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='automation_rules_created')
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    scope_type = models.CharField(max_length=20, choices=ScopeType.choices, default=ScopeType.GLOBAL)
    share_link = models.ForeignKey('sharelinks.ShareLink', on_delete=models.CASCADE, null=True, blank=True, related_name='automation_rules')
    dataroom = models.ForeignKey('datarooms.Dataroom', on_delete=models.CASCADE, null=True, blank=True, related_name='automation_rules')
    subscribed_events = models.JSONField(default=list, blank=True)
    actions = models.JSONField(default=list, blank=True)
    destinations = models.ManyToManyField(AutomationDestination, related_name='rules', blank=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('organization', 'name')
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(scope_type='global', share_link__isnull=True, dataroom__isnull=True)
                    | Q(scope_type='share_link', share_link__isnull=False, dataroom__isnull=True)
                    | Q(scope_type='dataroom', share_link__isnull=True, dataroom__isnull=False)
                ),
                name='automationrule_scope_target_consistency',
            )
        ]

    def clean(self):
        if self.scope_type == self.ScopeType.GLOBAL and (self.share_link_id or self.dataroom_id):
            raise ValidationError('Global scope cannot have share_link or dataroom.')
        if self.scope_type == self.ScopeType.SHARE_LINK and not self.share_link_id:
            raise ValidationError('Share link scope requires share_link.')
        if self.scope_type == self.ScopeType.SHARE_LINK and self.dataroom_id:
            raise ValidationError('Share link scope cannot have dataroom.')
        if self.scope_type == self.ScopeType.DATAROOM and not self.dataroom_id:
            raise ValidationError('Dataroom scope requires dataroom.')
        if self.scope_type == self.ScopeType.DATAROOM and self.share_link_id:
            raise ValidationError('Dataroom scope cannot have share_link.')

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class AutomationDelivery(BaseModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SUCCESS = 'success', 'Success'
        FAILED = 'failed', 'Failed'
        DEAD_LETTER = 'dead_letter', 'Dead Letter'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='automation_deliveries')
    rule = models.ForeignKey(AutomationRule, on_delete=models.CASCADE, related_name='deliveries')
    destination = models.ForeignKey(AutomationDestination, on_delete=models.CASCADE, related_name='deliveries')
    event_type = models.CharField(max_length=100)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    response_code = models.IntegerField(null=True, blank=True)
    response_body_excerpt = models.TextField(blank=True)
    attempt_count = models.PositiveIntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.event_type} -> {self.destination_id} ({self.status})'


class AutomationAssignment(BaseModel):
    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        CLOSED = 'closed', 'Closed'

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='automation_assignments')
    delivery = models.ForeignKey(AutomationDelivery, on_delete=models.CASCADE, related_name='assignments')
    assigned_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='automation_assignments')
    assigned_by_rule = models.ForeignKey(AutomationRule, on_delete=models.CASCADE, related_name='assignments')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Assignment {self.id} -> {self.assigned_user_id}'
