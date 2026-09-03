from urllib.parse import urljoin
from django.conf import settings
from rest_framework import serializers

from sharelinks.models import ShareLink, ViewSession
from sharelinks.serializers import ShareLinkDataroomSettingSerializer


class DashboardRecentViewSessionSerializer(serializers.ModelSerializer):
    """
    Optimized serializer for recent view sessions on the dashboard and nested
    inside recent active link previews. Avoids heavy recursive relation queries.
    """
    share_link_name = serializers.CharField(source='share_link.name', read_only=True, default=None)
    document_id = serializers.CharField(source='share_link.document.id', read_only=True, default=None)
    document_name = serializers.CharField(source='share_link.document.name', read_only=True, default=None)
    document_type = serializers.CharField(source='share_link.document.type', read_only=True, default=None)
    dataroom_id = serializers.CharField(source='share_link.dataroom.id', read_only=True, default=None)
    dataroom_name = serializers.CharField(source='share_link.dataroom.name', read_only=True, default=None)
    is_owner_view = serializers.SerializerMethodField()

    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name',
            'document_id', 'document_name', 'document_type', 'dataroom_id', 'dataroom_name',
            'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude',
            'duration_seconds', 'completion_rate', 'viewed_at', 'downloaded_at', 'is_owner_view'
        ]
        read_only_fields = fields

    def get_is_owner_view(self, obj) -> bool:
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            return obj.viewer_email == request.user.email
        return False


class DashboardRecentLinkSerializer(serializers.ModelSerializer):
    """
    Optimized serializer for recent active share links on the dashboard.
    """
    dataroom_settings = ShareLinkDataroomSettingSerializer(many=True, read_only=True)
    has_password = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    recent_view_sessions = serializers.SerializerMethodField()
    document_name = serializers.CharField(source='document.name', read_only=True, allow_null=True)
    document_type = serializers.CharField(source='document.type', read_only=True, allow_null=True)
    dataroom_name = serializers.CharField(source='dataroom.name', read_only=True, allow_null=True)
    last_viewed_at = serializers.DateTimeField(read_only=True)
    url = serializers.SerializerMethodField()
    created_by_user = serializers.SerializerMethodField()

    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'dataroom', 'document_name', 'document_type', 'dataroom_name',
            'dataroom_settings', 'created_by', 'created_by_user', 'name', 'slug', 'url',
            'expires_at', 'has_password', 'requires_email', 'requires_email_verification',
            'allow_download', 'enable_qna', 'enable_watermark', 'watermark_text',
            'receive_email_notification', 'is_active', 'created_at', 'updated_at',
            'view_count', 'recent_view_sessions', 'last_viewed_at', 'require_nda',
            'nda_text', 'nda_version'
        ]
        read_only_fields = fields

    def get_url(self, obj) -> str:
        site_domain = settings.SITE_DOMAIN.rstrip('/')
        return f"{site_domain}/view/{obj.slug}"

    def get_has_password(self, obj) -> bool:
        return bool(obj.password)

    def get_created_by_user(self, obj):
        if obj.created_by:
            avatar_url = None
            if obj.created_by.avatar and hasattr(obj.created_by.avatar, 'url'):
                avatar_url = urljoin(settings.SITE_DOMAIN, obj.created_by.avatar.url)
            return {
                'id': str(obj.created_by.id),
                'email': obj.created_by.email,
                'name': obj.created_by.name,
                'avatar_url': avatar_url,
            }
        return None

    def get_view_count(self, obj) -> int:
        if hasattr(obj, 'annotated_view_count'):
            return obj.annotated_view_count
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['view_sessions'])
        return obj.view_sessions.count()

    def get_recent_view_sessions(self, obj) -> list[dict]:
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            sessions = obj._prefetched_objects_cache['view_sessions'][:10]
        else:
            sessions = obj.view_sessions.all()[:10]
        return DashboardRecentViewSessionSerializer(sessions, many=True, context=self.context).data
