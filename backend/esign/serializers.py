from __future__ import annotations

import math

from rest_framework import serializers

from .models import (
    SEAL_METHOD_CHOICES,
    SEAL_METHOD_VISUAL_HASH,
    SignatureAuditTrail,
    SignatureField,
    SignatureRequest,
    Signer,
    SignerPageView,
)


class SignerSerializer(serializers.ModelSerializer):
    """Public/Owner representation of a signer; strictly omits access_token."""
    can_sign = serializers.SerializerMethodField()

    class Meta:
        model = Signer
        fields = [
            'id', 'email', 'name', 'role', 'order_index', 'status',
            'declined_reason', 'signed_at', 'can_sign', 'created_at',
        ]
        read_only_fields = fields

    def get_can_sign(self, obj: Signer) -> bool:
        return obj.can_sign()


class SignatureFieldSerializer(serializers.ModelSerializer):
    signer_email = serializers.EmailField(source='signer.email', read_only=True, allow_null=True)

    class Meta:
        model = SignatureField
        fields = [
            'id', 'signer', 'signer_email', 'field_type', 'page_number',
            'x', 'y', 'width', 'height', 'is_required', 'value', 'created_at',
        ]
        read_only_fields = fields


class SignatureAuditTrailSerializer(serializers.ModelSerializer):
    signer_email = serializers.EmailField(source='signer.email', read_only=True, allow_null=True)

    class Meta:
        model = SignatureAuditTrail
        fields = ['id', 'signer', 'signer_email', 'event_type', 'ip_address', 'details', 'timestamp']
        read_only_fields = fields


class SignerPageViewSummarySerializer(serializers.ModelSerializer):
    signer_email = serializers.EmailField(source='signer.email', read_only=True)

    class Meta:
        model = SignerPageView
        fields = ['id', 'signer', 'signer_email', 'page_number', 'duration_seconds', 'created_at']
        read_only_fields = fields


class SignatureRequestSerializer(serializers.ModelSerializer):
    document_name = serializers.CharField(source='document.name', read_only=True)
    dataroom_name = serializers.CharField(source='dataroom.name', read_only=True, allow_null=True)
    signers = SignerSerializer(many=True, read_only=True)
    fields = SignatureFieldSerializer(many=True, read_only=True)
    audit_events = SignatureAuditTrailSerializer(many=True, read_only=True)
    has_completed_pdf = serializers.SerializerMethodField()

    class Meta:
        model = SignatureRequest
        fields = [
            'id', 'title', 'message', 'document', 'document_name', 'document_version',
            'dataroom', 'dataroom_name', 'idempotency_key', 'status', 'signing_mode',
            'signing_order', 'current_order_index', 'original_file_sha256',
            'completed_file_sha256', 'seal_method', 'has_completed_pdf',
            'vault_dataroom_document', 'voided_at', 'void_reason', 'completed_at',
            'expires_at', 'created_at', 'updated_at', 'signers', 'fields', 'audit_events',
        ]
        read_only_fields = fields

    def get_has_completed_pdf(self, obj: SignatureRequest) -> bool:
        return bool(obj.completed_file_storage_key)


class SignerInputSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    role = serializers.CharField(max_length=100, required=False, allow_blank=True, default='Signer')
    order_index = serializers.IntegerField(min_value=1, max_value=20, required=False, default=1)


class SignatureFieldInputSerializer(serializers.Serializer):
    signer_email = serializers.EmailField(required=False, allow_blank=True)
    signer_index = serializers.IntegerField(min_value=0, max_value=19, required=False)
    field_type = serializers.ChoiceField(choices=SignatureField.FIELD_TYPE_CHOICES, default=SignatureField.TYPE_SIGNATURE)
    page_number = serializers.IntegerField(min_value=1, max_value=500)
    x = serializers.FloatField(min_value=0.0, max_value=100.0)
    y = serializers.FloatField(min_value=0.0, max_value=100.0)
    width = serializers.FloatField(min_value=0.1, max_value=100.0)
    height = serializers.FloatField(min_value=0.1, max_value=100.0)
    is_required = serializers.BooleanField(required=False, default=True)

    def validate(self, attrs):
        coords = (attrs['x'], attrs['y'], attrs['width'], attrs['height'])
        if not all(math.isfinite(float(v)) for v in coords):
            raise serializers.ValidationError('Field coordinates must be finite numbers.')
        if attrs['x'] + attrs['width'] > 100.0 + 1e-6 or attrs['y'] + attrs['height'] > 100.0 + 1e-6:
            raise serializers.ValidationError('Field bounding box cannot exceed page 100% boundary.')
        return attrs


class SignatureRequestCreateSerializer(serializers.Serializer):
    document = serializers.CharField(max_length=32)
    document_version = serializers.CharField(max_length=32, required=False, allow_blank=True, allow_null=True)
    dataroom = serializers.CharField(max_length=32, required=False, allow_blank=True, allow_null=True)
    title = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    message = serializers.CharField(required=False, allow_blank=True, default='')
    signing_mode = serializers.ChoiceField(choices=SignatureRequest.SIGNING_MODE_CHOICES, default=SignatureRequest.MODE_DIRECT)
    signing_order = serializers.ChoiceField(choices=SignatureRequest.SIGNING_ORDER_CHOICES, default=SignatureRequest.ORDER_PARALLEL)
    seal_method = serializers.ChoiceField(choices=SEAL_METHOD_CHOICES, default=SEAL_METHOD_VISUAL_HASH)
    idempotency_key = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    signers = SignerInputSerializer(many=True)
    fields = SignatureFieldInputSerializer(many=True)


class SignerTokenExchangeSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128, trim_whitespace=True)


class SignerFieldValueInputSerializer(serializers.Serializer):
    field_id = serializers.CharField(max_length=32)
    value = serializers.CharField(required=False, allow_blank=True, default='', max_length=2000)
    signature_type = serializers.ChoiceField(choices=[('draw', 'Drawn'), ('type', 'Typed')], required=False, default='draw')
    signature_data = serializers.CharField(required=False, allow_blank=True, default='')


class SignerSubmitSerializer(serializers.Serializer):
    fields = SignerFieldValueInputSerializer(many=True)


class SignerDeclineSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='', max_length=1000)


class SignerPageViewInputSerializer(serializers.Serializer):
    page_number = serializers.IntegerField(min_value=1, max_value=500)
    duration_seconds = serializers.IntegerField(min_value=0, max_value=86400)


class VoidRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='', max_length=255)
