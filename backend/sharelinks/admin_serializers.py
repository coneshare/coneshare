from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.models import User
from .models import ShareLink, ViewSession


class AdminShareLinkUserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_avatar_url(self, obj):
        if hasattr(obj, 'avatar_url'):
            return obj.avatar_url
        if getattr(obj, 'avatar', None) and hasattr(obj.avatar, 'url'):
            return obj.avatar.url
        return None

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'avatar_url', 'role']
        read_only_fields = fields


class AdminShareLinkSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ViewSession
        fields = [
            'id', 'viewed_at', 'viewer_email', 'email_verification_method',
            'ip_address', 'country', 'city', 'duration_seconds',
            'completion_rate', 'downloaded_at'
        ]
        read_only_fields = fields


class AdminShareLinkListSerializer(serializers.ModelSerializer):
    target_type = serializers.SerializerMethodField()
    target_id = serializers.SerializerMethodField()
    target_name = serializers.SerializerMethodField()
    document_type = serializers.CharField(source='document.type', read_only=True, allow_null=True)
    created_by = AdminShareLinkUserSerializer(read_only=True)
    has_password = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    view_count = serializers.IntegerField(read_only=True, default=0)
    last_viewed_at = serializers.DateTimeField(read_only=True, allow_null=True)

    @extend_schema_field(serializers.CharField())
    def get_target_type(self, obj) -> str:
        return 'dataroom' if obj.dataroom_id else 'document'

    @extend_schema_field(serializers.CharField())
    def get_target_id(self, obj) -> str:
        return str(obj.dataroom_id or obj.document_id)

    @extend_schema_field(serializers.CharField())
    def get_target_name(self, obj) -> str:
        if obj.dataroom:
            return obj.dataroom.name
        if obj.document:
            return obj.document.name
        return obj.name or ''

    @extend_schema_field(serializers.BooleanField())
    def get_has_password(self, obj) -> bool:
        return bool(obj.password)

    @extend_schema_field(serializers.BooleanField())
    def get_is_expired(self, obj) -> bool:
        return bool(obj.expires_at and obj.expires_at <= timezone.now())

    @extend_schema_field(serializers.CharField())
    def get_status(self, obj) -> str:
        if not obj.is_active:
            return 'revoked'
        if obj.expires_at and obj.expires_at <= timezone.now():
            return 'expired'
        return 'active'

    class Meta:
        model = ShareLink
        fields = [
            'id', 'name', 'slug', 'target_type', 'target_id', 'target_name',
            'document_type', 'created_by', 'created_at', 'updated_at',
            'expires_at', 'is_active', 'is_expired', 'status',
            'has_password', 'requires_email', 'requires_email_verification',
            'allow_download', 'enable_qna', 'enable_watermark', 'require_nda',
            'view_count', 'last_viewed_at'
        ]
        read_only_fields = fields


class AdminShareLinkDetailSerializer(AdminShareLinkListSerializer):
    recent_view_sessions = serializers.SerializerMethodField()

    @extend_schema_field(AdminShareLinkSessionSerializer(many=True))
    def get_recent_view_sessions(self, obj):
        sessions = obj.view_sessions.order_by('-viewed_at')[:20]
        return AdminShareLinkSessionSerializer(sessions, many=True).data

    class Meta(AdminShareLinkListSerializer.Meta):
        fields = AdminShareLinkListSerializer.Meta.fields + [
            'watermark_text', 'nda_text', 'nda_version', 'recent_view_sessions'
        ]
        read_only_fields = fields


class AdminShareLinkUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareLink
        fields = ['is_active']
