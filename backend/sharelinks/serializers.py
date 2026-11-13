import math
import re
from datetime import datetime
from urllib.parse import urljoin

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.models import Organization
from datarooms.models import Dataroom
from documents.models import Document
from esign.pdf_stamping import compute_sha256, validate_pdf_bytes
from esign.services import download_storage_bytes
from .models import (DataroomVisit, PageView, ShareLink,
                     QnAMessage, QnAThread,
                     ShareLinkDataroomSetting, ShareLinkTemplate, Viewer,
                     ViewSession, LinkClick, NDAAcceptance)
from .services import (_get_unique_dataroom_share_link_name,
                       _get_unique_share_link_name)


class RecordVisitSerializer(serializers.Serializer):
    dataroom_document_id = serializers.CharField(required=False, allow_null=True)
    dataroom_folder_id = serializers.CharField(required=False, allow_null=True)

    def validate(self, data):
        doc_id = data.get('dataroom_document_id')
        folder_id = data.get('dataroom_folder_id')

        if not doc_id and not folder_id:
            raise serializers.ValidationError("Either 'dataroom_document_id' or 'dataroom_folder_id' must be provided.")
        if doc_id and folder_id:
            raise serializers.ValidationError("Only one of 'dataroom_document_id' or 'dataroom_folder_id' can be provided.")
        return data


class PageViewSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PageView
        fields = [
            'page_number', 'duration_seconds', 'url', 'created_at', 'media_type',
            'video_start_time', 'video_end_time', 'video_volume', 'is_fullscreen', 'playback_speed',
            'scroll_percentage'
        ]

    def get_url(self, obj) -> str | None:
        pages_map = self.context.get('pages_map')
        if not pages_map:
            return None

        # Resolve target document id:
        # 1. Check Dataroom visit document id
        visit = getattr(obj, 'dataroom_visit', None)
        doc_id = getattr(visit, 'dataroom_document_id', None)

        # 2. Fall back to direct ViewSession share link document id
        if not doc_id:
            session = getattr(obj, 'view_session', None)
            link = getattr(session, 'share_link', None)
            doc_id = getattr(link, 'document_id', None)

        if not doc_id:
            return None

        doc_pages = pages_map.get(str(doc_id))
        return doc_pages.get(obj.page_number) if doc_pages else None


class LinkClickSerializer(serializers.ModelSerializer):
    class Meta:
        model = LinkClick
        fields = ['id', 'url', 'page_number', 'clicked_at']
        read_only_fields = ['id', 'clicked_at']


class DataroomVisitSerializer(serializers.ModelSerializer):
    dataroom_document_name = serializers.SerializerMethodField()
    dataroom_document_type = serializers.SerializerMethodField()
    dataroom_folder_name = serializers.SerializerMethodField()
    item_type = serializers.CharField(read_only=True)
    item_name = serializers.CharField(read_only=True)
    item_path = serializers.CharField(read_only=True)
    item_status = serializers.SerializerMethodField()
    page_views = PageViewSerializer(many=True, read_only=True)
    link_clicks = LinkClickSerializer(many=True, read_only=True)

    class Meta:
        model = DataroomVisit
        fields = [
            'id', 'visited_at', 'downloaded_at', 'dataroom_document_id', 'dataroom_folder_id',
            'dataroom_document_name', 'dataroom_document_type', 'dataroom_folder_name',
            'item_type', 'item_name', 'item_path', 'item_status',
            'page_views', 'link_clicks'
        ]
        read_only_fields = [
            'id', 'visited_at', 'downloaded_at', 'item_type', 'item_name', 'item_path', 'item_status'
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_dataroom_document_name(self, obj) -> str | None:
        # Prefer live item name if exists, fallback to snapshot name
        if obj.dataroom_document:
            if obj.dataroom_document.name:
                return obj.dataroom_document.name
            if obj.dataroom_document.document:
                return obj.dataroom_document.document.name
        if obj.item_type == 'document' or not obj.item_type:
            return obj.item_name or None
        return None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_dataroom_document_type(self, obj) -> str | None:
        if obj.dataroom_document and obj.dataroom_document.document:
            return obj.dataroom_document.document.type
        if obj.item_type == 'document' or not obj.item_type:
            return obj.document_type or None
        return None

    def _get_root_dataroom(self, obj):
        if obj.item_path == '/' and not obj.dataroom_folder_id:
            view_session = getattr(obj, 'view_session', None)
            share_link = getattr(view_session, 'share_link', None)
            return getattr(share_link, 'dataroom', None)
        return None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_dataroom_folder_name(self, obj) -> str | None:
        if obj.dataroom_folder:
            return obj.dataroom_folder.name
        root_dataroom = self._get_root_dataroom(obj)
        if root_dataroom:
            return root_dataroom.name
        if obj.item_type == 'folder':
            return obj.item_name or None
        return None

    @extend_schema_field(serializers.CharField())
    def get_item_status(self, obj) -> str:
        """Returns 'active', 'deleted', or 'renamed'."""
        if obj.item_type == 'folder' or (not obj.item_type and obj.dataroom_folder_id):
            if not obj.dataroom_folder:
                if obj.item_path == '/' and not obj.dataroom_folder_id:
                    root_dataroom = self._get_root_dataroom(obj)
                    if not root_dataroom:
                        return 'deleted'
                    if obj.item_name and root_dataroom.name != obj.item_name:
                        return 'renamed'
                    return 'active'
                return 'deleted'
            if obj.item_name and obj.dataroom_folder.name != obj.item_name:
                return 'renamed'
            return 'active'

        # Document
        if not obj.dataroom_document:
            return 'deleted'
        current_name = obj.dataroom_document.name or (
            obj.dataroom_document.document.name if obj.dataroom_document.document else ''
        )
        if obj.item_name and current_name and current_name != obj.item_name:
            return 'renamed'
        return 'active'


class ShareLinkDataroomSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareLinkDataroomSetting
        fields = ['id', 'dataroom_document', 'dataroom_folder', 'is_visible', 'allow_download', 'enable_watermark']


class ShareLinkDataroomSettingUpdateSerializer(serializers.Serializer):
    id = serializers.CharField()
    is_visible = serializers.BooleanField(required=False)
    allow_download = serializers.BooleanField(required=False)
    enable_watermark = serializers.BooleanField(required=False)

    def validate(self, data):
        # Ensure at least one setting is being updated
        if not any(k in data for k in ['is_visible', 'allow_download', 'enable_watermark']):
            raise serializers.ValidationError("At least one setting (is_visible, allow_download, enable_watermark) must be provided for an update.")
        return data


class BaseViewSessionSerializer(serializers.ModelSerializer):
    """
    Base serializer for ViewSession models.
    Encapsulates common session metadata (viewer, IP geo-location, duration, completion rate,
    timestamps, is_owner_view flag) and viewer binding logic across all session contexts.
    """
    share_link_name = serializers.CharField(source='share_link.name', read_only=True)
    is_owner_view = serializers.SerializerMethodField()

    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name',
            'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude',
            'duration_seconds', 'completion_rate', 'viewed_at', 'downloaded_at',
            'is_owner_view', 'email_verification_method'
        ]
        read_only_fields = fields

    def get_is_owner_view(self, obj) -> bool:
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            return (obj.viewer_email or '').strip().lower() == request.user.email.strip().lower()
        return False

    def create(self, validated_data):
        email = validated_data.get('viewer_email')
        share_link = validated_data.get('share_link')

        if email and share_link:
            # The organization is derived from the document or dataroom being shared
            if share_link.document:
                organization = share_link.document.organization
            elif share_link.dataroom:
                organization = share_link.dataroom.organization
            else:
                # Should not happen due to model constraints
                return super().create(validated_data)

            email = email.strip().lower()
            viewer, _ = Viewer.objects.get_or_create(
                organization=organization,
                email=email
            )
            # Associate the view with the identified viewer
            validated_data['viewer'] = viewer

        return super().create(validated_data)


class DocumentViewSessionSerializer(BaseViewSessionSerializer):
    """
    Specialized serializer for direct Document view sessions.
    Used by:
      - GET /api/v1/documents/{id}/view_sessions/
      - GET /api/v1/sharelinks/{id}/view_sessions/ (when target is a Document)

    Includes single-document metrics: flat page_views (with preview thumbnails)
    and link_clicks, while omitting dataroom-specific fields (e.g., dataroom_visits).
    """
    document_id = serializers.CharField(source='share_link.document.id', read_only=True)
    document_name = serializers.CharField(source='share_link.document.name', read_only=True)
    document_type = serializers.CharField(source='share_link.document.type', read_only=True, default=None)
    page_views = PageViewSerializer(many=True, read_only=True)
    link_clicks = LinkClickSerializer(many=True, read_only=True)

    class Meta(BaseViewSessionSerializer.Meta):
        fields = BaseViewSessionSerializer.Meta.fields + [
            'document_id', 'document_name', 'document_type',
            'page_views', 'link_clicks'
        ]
        read_only_fields = fields


class DataroomViewSessionSerializer(BaseViewSessionSerializer):
    """
    Specialized serializer for Dataroom activity log sessions.
    Used by:
      - GET /api/v1/datarooms/{id}/view_sessions/
      - GET /api/v1/sharelinks/{id}/view_sessions/ (when target is a Dataroom)

    Focuses on hierarchical folder and document navigation (dataroom_visits), where each visit
    contains its own scoped page_views, while preserving session-level link_clicks and completion_rate.
    """
    dataroom_id = serializers.CharField(source='share_link.dataroom.id', read_only=True, default=None)
    dataroom_name = serializers.CharField(source='share_link.dataroom.name', read_only=True, default=None)
    dataroom_visits = DataroomVisitSerializer(many=True, read_only=True)
    link_clicks = LinkClickSerializer(many=True, read_only=True)

    class Meta(BaseViewSessionSerializer.Meta):
        fields = BaseViewSessionSerializer.Meta.fields + [
            'dataroom_id', 'dataroom_name', 'dataroom_visits', 'link_clicks'
        ]
        read_only_fields = fields


class ViewSessionSerializer(BaseViewSessionSerializer):
    """
    Universal / polymorphic ViewSession serializer (superset of all fields).
    Used by:
      - POST /api/v1/view-sessions/ (polymorphic session creation write endpoint)
      - GET /api/v1/analytics/view-sessions/ (global analytics where sessions mix docs and datarooms)
      - Detail and legacy endpoints requiring full schema backward compatibility.
    """
    page_views = PageViewSerializer(many=True, read_only=True)
    dataroom_visits = DataroomVisitSerializer(many=True, read_only=True)
    link_clicks = LinkClickSerializer(many=True, read_only=True)
    document_id = serializers.CharField(source='share_link.document.id', read_only=True)
    document_name = serializers.CharField(source='share_link.document.name', read_only=True)
    document_type = serializers.CharField(source='share_link.document.type', read_only=True, default=None)
    dataroom_id = serializers.CharField(source='share_link.dataroom.id', read_only=True, default=None)
    dataroom_name = serializers.CharField(source='share_link.dataroom.name', read_only=True, default=None)

    class Meta(BaseViewSessionSerializer.Meta):
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name', 'document_id', 'document_name', 'document_type',
            'dataroom_id', 'dataroom_name', 'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude', 'duration_seconds',
            'completion_rate', 'viewed_at', 'page_views', 'dataroom_visits', 'link_clicks', 'is_owner_view', 'downloaded_at', 'email_verification_method'
        ]
        read_only_fields = [
            'id', 'viewer', 'duration_seconds', 'completion_rate', 'viewed_at', 'ip_address', 'user_agent',
            'share_link_name', 'document_id', 'document_name', 'document_type', 'dataroom_id', 'dataroom_name',
            'country', 'city', 'latitude', 'longitude', 'page_views', 'dataroom_visits', 'link_clicks',
            'is_owner_view', 'downloaded_at', 'email_verification_method'
        ]


class ViewerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Viewer
        fields = ['id', 'organization', 'email', 'created_at']
        read_only_fields = ['id', 'organization', 'created_at']

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and getattr(request.user, 'organization', None):
            validated_data['organization'] = request.user.organization
        else:
            raise serializers.ValidationError({"organization": "Organization context is required."})
        return super().create(validated_data)


class PageViewRecordSerializer(serializers.ModelSerializer):
    """
    Serializer for validating and creating PageView records from tracking data.
    """
    view_session = serializers.PrimaryKeyRelatedField(
        queryset=ViewSession.objects.select_related('share_link__document').all()
    )
    dataroom_visit = serializers.PrimaryKeyRelatedField(
        queryset=DataroomVisit.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = PageView
        fields = [
            'view_session', 'page_number', 'duration_seconds', 'dataroom_visit', 'media_type',
            'video_start_time', 'video_end_time', 'video_volume', 'is_fullscreen', 'playback_speed',
            'scroll_percentage'
        ]
        extra_kwargs = {
            'page_number': {'min_value': 1, 'max_value': 100000},
            'scroll_percentage': {'min_value': 0, 'max_value': 100},
            'duration_seconds': {'min_value': 0, 'max_value': 86400},
            'video_volume': {'min_value': 0, 'max_value': 100},
            'video_start_time': {'min_value': 0.0, 'max_value': 86400.0},
            'video_end_time': {'min_value': 0.0, 'max_value': 86400.0},
            'playback_speed': {'min_value': 0.1, 'max_value': 16.0},
        }

    def validate(self, data):
        view_session = data.get('view_session')
        dataroom_visit = data.get('dataroom_visit')

        if dataroom_visit and view_session:
            if dataroom_visit.view_session != view_session:
                raise serializers.ValidationError(
                    {"dataroom_visit": "This document visit does not belong to the provided view session."}
                )
        return data

    def create(self, validated_data):
        view_session = validated_data.get('view_session')
        dataroom_visit = validated_data.get('dataroom_visit')

        doc_type = 'document'
        if dataroom_visit and dataroom_visit.dataroom_document:
            doc_type = dataroom_visit.dataroom_document.document.type
        elif view_session and view_session.share_link.document:
            doc_type = view_session.share_link.document.type

        # Normalize doc_type to media_type
        if doc_type == 'video':
            validated_data['media_type'] = 'video'
        elif doc_type == 'audio':
            validated_data['media_type'] = 'audio'
        elif doc_type == 'markdown':
            validated_data['media_type'] = 'markdown'
        elif doc_type == 'spreadsheet':
            validated_data['media_type'] = 'spreadsheet'
        else:
            validated_data['media_type'] = 'document'

        return super().create(validated_data)


class LinkClickRecordSerializer(serializers.ModelSerializer):
    """
    Serializer for validating and creating LinkClick records from tracking data.
    """
    view_session = serializers.PrimaryKeyRelatedField(
        queryset=ViewSession.objects.all()
    )
    dataroom_visit = serializers.PrimaryKeyRelatedField(
        queryset=DataroomVisit.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = LinkClick
        fields = ['view_session', 'dataroom_visit', 'url', 'page_number']

    def validate(self, data):
        view_session = data.get('view_session')
        dataroom_visit = data.get('dataroom_visit')
        url = data.get('url')

        if view_session:
            link = view_session.share_link
            if not link.is_active or (link.expires_at and link.expires_at < timezone.now()):
                raise serializers.ValidationError(
                    {"view_session": "The associated share link is inactive or expired."}
                )

        if url:
            cleaned_url = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', url.strip())
            if not (cleaned_url.startswith('http://') or cleaned_url.startswith('https://')):
                raise serializers.ValidationError(
                    {"url": "Only outbound HTTP and HTTPS URLs are allowed."}
                )
            data['url'] = cleaned_url

        if dataroom_visit and view_session:
            if dataroom_visit.view_session != view_session:
                raise serializers.ValidationError(
                    {"dataroom_visit": "This document visit does not belong to the provided view session."}
                )
        return data


def _pin_nda_document_snapshot(nda_document: Document):
    """Downloads and validates a PDF NDA template outside DB locks and returns (version, storage_key, sha256)."""
    version = nda_document.versions.filter(is_primary=True).order_by('-version_number').first()
    if not version or not version.original_storage_key:
        raise serializers.ValidationError({'nda_document': 'NDA template document does not have a ready PDF version.'})
    try:
        pdf_bytes = download_storage_bytes(version.original_storage_key)
        validate_pdf_bytes(pdf_bytes)
    except Exception as exc:
        raise serializers.ValidationError({'nda_document': f'Invalid NDA PDF template: {exc}'}) from exc
    return version, version.original_storage_key, compute_sha256(pdf_bytes)


class ShareLinkSerializer(serializers.ModelSerializer):
    dataroom = serializers.PrimaryKeyRelatedField(
        queryset=Dataroom.objects.all(), required=False, allow_null=True
    )
    nda_document = serializers.PrimaryKeyRelatedField(
        queryset=Document.objects.all(), required=False, allow_null=True
    )
    nda_document_name = serializers.CharField(source='nda_document.name', read_only=True, allow_null=True)
    dataroom_settings = ShareLinkDataroomSettingSerializer(many=True, read_only=True)
    has_password = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    recent_view_sessions = serializers.SerializerMethodField()
    document_name = serializers.CharField(source='document.name', read_only=True, allow_null=True)
    document_type = serializers.CharField(source='document.type', read_only=True, allow_null=True)
    dataroom_name = serializers.CharField(source='dataroom.name', read_only=True, allow_null=True)
    last_viewed_at = serializers.SerializerMethodField()
    has_accepted_current_nda = serializers.SerializerMethodField()

    def get_has_accepted_current_nda(self, obj) -> bool:
        request = self.context.get('request')
        if not request:
            return False

        # Admin / Owner bypasses
        if request.user and request.user.is_authenticated and (request.user == obj.created_by or request.user.is_staff):
            return True

        # Check session
        authorized_links = request.session.get('authorized_share_links', {})
        auth_status = authorized_links.get(str(obj.id), {})
        if auth_status.get('nda_accepted_version') == obj.nda_version:
            return True

        # Check database
        viewer_email = auth_status.get('viewer_email')
        if viewer_email:
            if NDAAcceptance.objects.filter(share_link=obj, viewer__email=viewer_email, nda_version=obj.nda_version).exists():
                return True

        query_params = getattr(request, 'query_params', getattr(request, 'GET', {}))
        view_session_id = query_params.get('view_session_id') if query_params else None
        if view_session_id:
            if NDAAcceptance.objects.filter(share_link=obj, view_session_id=view_session_id, nda_version=obj.nda_version).exists():
                return True

        return False

    def validate(self, data):
        """
        Enforce business rules:
        - A link must point to either a document or a dataroom, but not both.
        - If the associated document is download-only, force allow_download to be true.
        - On update, check for name uniqueness manually.
        """
        document = data.get('document')
        dataroom = data.get('dataroom')

        # On update, targets are immutable. Use instance target state.
        if self.instance:
            if 'document' in data and data['document'] != self.instance.document:
                raise serializers.ValidationError({'document': 'Share link target document cannot be changed after creation.'})
            if 'dataroom' in data and data['dataroom'] != self.instance.dataroom:
                raise serializers.ValidationError({'dataroom': 'Share link target dataroom cannot be changed after creation.'})
            document = self.instance.document
            dataroom = self.instance.dataroom

        if not document and not dataroom:
            raise serializers.ValidationError("A share link must be associated with either a document or a dataroom.")
        if document and dataroom:
            raise serializers.ValidationError("A share link cannot be associated with both a document and a dataroom.")

        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user and request.user.is_authenticated:
            user = request.user
            is_admin = getattr(user, 'role', '') == 'admin' and (
                (document and document.organization_id == user.organization_id) or
                (dataroom and dataroom.organization_id == user.organization_id) or
                (self.instance and self.instance.organization_id == user.organization_id)
            )
            if not self.instance:
                if document:
                    is_owner = document.created_by_id is not None and document.created_by_id == user.id
                    if not (is_owner or is_admin):
                        raise serializers.ValidationError({'document': 'You do not have permission to share this document.'})
                if dataroom:
                    is_owner = dataroom.created_by_id is not None and dataroom.created_by_id == user.id
                    is_collaborator = dataroom.collaborators.filter(user=user).exists()
                    if not (is_owner or is_admin or is_collaborator):
                        raise serializers.ValidationError({'dataroom': 'You do not have permission to share this dataroom.'})

        enable_watermark = data.get('enable_watermark', self.instance.enable_watermark if self.instance else False)
        if document:
            if document.type == 'video' and enable_watermark:
                raise serializers.ValidationError(
                    "Watermarking is not supported for video files."
                )
            if document.is_download_only:
                data['allow_download'] = True

        if enable_watermark:
            watermark_text = data.get('watermark_text', self.instance.watermark_text if self.instance else '')
            if not watermark_text or not watermark_text.strip():
                data['watermark_text'] = 'CONFIDENTIAL - {{email}}'

        nda_type = data.get('nda_type', self.instance.nda_type if self.instance else ShareLink.NDA_TYPE_TEXT)
        nda_document = data.get('nda_document', self.instance.nda_document if self.instance else None)
        if nda_type == ShareLink.NDA_TYPE_PDF:
            if not nda_document:
                raise serializers.ValidationError({'nda_document': 'A PDF template document is required when nda_type is pdf.'})
            if nda_document.type != 'pdf':
                raise serializers.ValidationError({'nda_document': 'NDA template document must be a PDF.'})
            if nda_document.status != 'ready':
                raise serializers.ValidationError({'nda_document': 'NDA template document must be ready.'})
            target_org_id = (
                document.organization_id if document else
                (dataroom.organization_id if dataroom else (self.instance.organization_id if self.instance else None))
            )
            if target_org_id and nda_document.organization_id != target_org_id:
                raise serializers.ValidationError({'nda_document': 'NDA template document must belong to the same organization.'})
            if request and hasattr(request, 'user') and request.user and request.user.is_authenticated:
                user = request.user
                is_nda_owner = nda_document.created_by_id is not None and nda_document.created_by_id == user.id
                is_nda_org_admin = getattr(user, 'role', '') == 'admin' and nda_document.organization_id == user.organization_id
                if not (is_nda_owner or is_nda_org_admin):
                    raise serializers.ValidationError({'nda_document': 'You do not have permission to use this NDA template document.'})
            if not nda_document.versions.filter(is_primary=True).exists():
                raise serializers.ValidationError({'nda_document': 'NDA template document does not have a primary PDF version.'})

        # Manually handle uniqueness validation on update only.
        # On create, the `create` method handles finding a unique name.
        if self.instance and 'name' in data:
            name = data['name']
            if name:
                queryset = ShareLink.objects.filter(name=name).exclude(pk=self.instance.pk)
                if document:
                    if queryset.filter(document=document).exists():
                        raise serializers.ValidationError(
                            {'name': 'A share link with this name already exists for this document.'}
                        )
                elif dataroom:
                    if queryset.filter(dataroom=dataroom).exists():
                        raise serializers.ValidationError(
                            {'name': 'A share link with this name already exists for this dataroom.'}
                        )

        return data

    created_by_user = serializers.SerializerMethodField()

    @extend_schema_field(serializers.DictField(allow_null=True))
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

    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'dataroom', 'document_name', 'document_type', 'dataroom_name', 'dataroom_settings', 'created_by', 'created_by_user', 'name', 'slug', 'url', 'expires_at',
            'has_password', 'password', 'requires_email', 'requires_email_verification', 'allow_download', 'enable_qna',
            'enable_watermark', 'watermark_text', 'receive_email_notification', 'is_active', 'created_at', 'updated_at',
            'view_count', 'recent_view_sessions', 'last_viewed_at', 'require_nda', 'nda_text', 'nda_type',
            'nda_document', 'nda_document_name', 'nda_document_version', 'nda_source_sha256', 'has_nda_pdf',
            'nda_version', 'has_accepted_current_nda'
        ]
        read_only_fields = [
            'id', 'created_by', 'created_by_user', 'slug', 'url', 'created_at', 'updated_at',
            'document_name', 'document_type', 'nda_document_name', 'nda_document_version',
            'nda_source_sha256', 'has_nda_pdf', 'nda_version', 'has_accepted_current_nda'
        ]
        extra_kwargs = {
            'name': {'required': True, 'allow_blank': True},
            'password': {
                'required': False,
                'allow_blank': True,
                'style': {'input_type': 'password'}
            }
        }
        # Remove the default UniqueTogetherValidator.
        # We handle uniqueness manually in `validate()` for updates and `create()` for creations.
        validators = []

    has_nda_pdf = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    def get_has_nda_pdf(self, obj) -> bool:
        """Returns True if the share link has a pinned PDF NDA storage artifact."""
        return bool(obj.nda_pdf_storage_key)

    def get_url(self, obj) -> str:
        site_domain = settings.SITE_DOMAIN.rstrip('/')
        return f"{site_domain}/view/{obj.slug}"

    def get_has_password(self, obj) -> bool:
        """Returns True if the link is password-protected."""
        return bool(obj.password)

    def get_view_count(self, obj) -> int:
        """Returns the number of view sessions for the link."""
        # This is efficient because of the prefetch_related in the view.
        if hasattr(obj, 'annotated_view_count'):
            return obj.annotated_view_count
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['view_sessions'])
        return obj.view_sessions.count()

    def get_recent_view_sessions(self, obj) -> list[dict]:
        """Returns up to 10 most recent view sessions."""
        # This is efficient because of the prefetch_related in the view.
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            # Slicing the prefetched list. Relies on the model's Meta ordering.
            sessions = obj._prefetched_objects_cache['view_sessions'][:10]
        else:
            # Fallback to a query if not prefetched. Relies on Meta.ordering.
            sessions = obj.view_sessions.all()[:10]

        serializer = ViewSessionSerializer(sessions, many=True, context=self.context)
        return serializer.data

    def get_last_viewed_at(self, obj) -> datetime | None:
        """Returns the timestamp of the most recent view session."""
        # This is efficient because of the prefetch_related in the view.
        # The ViewSession model's Meta ordering is '-viewed_at', so the first session is the latest.
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            sessions = obj._prefetched_objects_cache['view_sessions']
            if sessions:
                return sessions[0].viewed_at
        else:
            # Fallback to a query if not prefetched.
            latest_session = obj.view_sessions.first()
            if latest_session:
                return latest_session.viewed_at
        return None

    def create(self, validated_data):
        request = self.context['request']
        validated_data['created_by'] = request.user

        document = validated_data.get('document')
        dataroom = validated_data.get('dataroom')

        original_name = validated_data.get('name') or "Untitled Link"

        if document:
            validated_data['name'] = _get_unique_share_link_name(document, original_name)
        elif dataroom:
            validated_data['name'] = _get_unique_dataroom_share_link_name(dataroom, original_name)

        nda_type = validated_data.get('nda_type', ShareLink.NDA_TYPE_TEXT)
        nda_document = validated_data.get('nda_document')
        if nda_type == ShareLink.NDA_TYPE_PDF and nda_document:
            version, storage_key, sha256 = _pin_nda_document_snapshot(nda_document)
            validated_data['nda_document_version'] = version
            validated_data['nda_pdf_storage_key'] = storage_key
            validated_data['nda_source_sha256'] = sha256
        elif nda_type == ShareLink.NDA_TYPE_TEXT:
            validated_data['nda_document'] = None
            validated_data['nda_document_version'] = None
            validated_data['nda_pdf_storage_key'] = ''
            validated_data['nda_source_sha256'] = ''

        # The post_save signal will now handle creating settings for dataroom links.
        share_link = super().create(validated_data)

        return share_link

    def update(self, instance, validated_data):
        nda_type = validated_data.get('nda_type', instance.nda_type)
        nda_document = validated_data.get('nda_document', instance.nda_document)
        should_pin = (
            nda_type == ShareLink.NDA_TYPE_PDF
            and nda_document is not None
            and (
                'nda_type' in validated_data
                or 'nda_document' in validated_data
                or not instance.nda_source_sha256
            )
        )
        if should_pin:
            version, storage_key, sha256 = _pin_nda_document_snapshot(nda_document)
            validated_data['nda_document_version'] = version
            validated_data['nda_pdf_storage_key'] = storage_key
            validated_data['nda_source_sha256'] = sha256
        elif nda_type == ShareLink.NDA_TYPE_TEXT and 'nda_type' in validated_data:
            validated_data['nda_document'] = None
            validated_data['nda_document_version'] = None
            validated_data['nda_pdf_storage_key'] = ''
            validated_data['nda_source_sha256'] = ''

        return super().update(instance, validated_data)


class ShareLinkEmailSerializer(serializers.Serializer):
    """Serializer for the email submission form."""
    email = serializers.EmailField()


class ShareLinkTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareLinkTemplate
        fields = [
            'id', 'organization', 'name', 'is_default', 'expires_in_days',
            'requires_password', 'requires_email', 'requires_email_verification', 'allow_download',
            'enable_watermark', 'watermark_text', 'receive_email_notification', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context['request']
        # Automatically assign the user's organization
        validated_data['organization'] = request.user.organization
        return super().create(validated_data)


class ShareLinkPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)


class QnAMessageSerializer(serializers.ModelSerializer):
    sender_type = serializers.SerializerMethodField()
    sender_email = serializers.SerializerMethodField()
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = QnAMessage
        fields = [
            'id', 'thread', 'body', 'sender_type', 'sender_email', 'sender_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_sender_type(self, obj) -> str:
        return 'user' if obj.sent_by_user_id else 'viewer'

    def get_sender_email(self, obj) -> str:
        if obj.sent_by_user:
            return obj.sent_by_user.email
        if obj.sent_by_viewer:
            return obj.sent_by_viewer.email
        if obj.sent_by_view_session:
            return obj.sent_by_view_session.viewer_email
        return ''

    def get_sender_name(self, obj) -> str:
        if obj.sent_by_user:
            return obj.sent_by_user.name or obj.sent_by_user.email
        return self.get_sender_email(obj) or 'Viewer'


class QnAThreadSerializer(serializers.ModelSerializer):
    messages = QnAMessageSerializer(many=True, read_only=True)
    context_type = serializers.SerializerMethodField()
    context_name = serializers.SerializerMethodField()
    created_by_type = serializers.SerializerMethodField()
    created_by_email = serializers.SerializerMethodField()

    class Meta:
        model = QnAThread
        fields = [
            'id', 'organization', 'share_link', 'dataroom', 'document',
            'dataroom_document', 'dataroom_folder', 'context_type', 'context_name',
            'subject', 'status', 'created_by_type', 'created_by_email',
            'created_at', 'updated_at', 'messages'
        ]
        read_only_fields = fields

    def get_context_type(self, obj) -> str:
        if obj.dataroom_document_id:
            return 'dataroom_document'
        if obj.dataroom_folder_id:
            return 'dataroom_folder'
        if obj.dataroom_id:
            return 'dataroom'
        return 'document'

    def get_context_name(self, obj) -> str:
        if obj.dataroom_document:
            return obj.dataroom_document.name or obj.dataroom_document.document.name
        if obj.dataroom_folder:
            return obj.dataroom_folder.name
        if obj.dataroom:
            return obj.dataroom.name
        if obj.document:
            return obj.document.name
        return ''

    def get_created_by_type(self, obj) -> str:
        return 'user' if obj.created_by_user_id else 'viewer'

    def get_created_by_email(self, obj) -> str:
        if obj.created_by_user:
            return obj.created_by_user.email
        if obj.created_by_viewer:
            return obj.created_by_viewer.email
        if obj.created_by_view_session:
            return obj.created_by_view_session.viewer_email
        return ''


class QnAThreadCreateSerializer(serializers.Serializer):
    subject = serializers.CharField()
    body = serializers.CharField()
    view_session_id = serializers.CharField(required=False, allow_blank=True)
    dataroom_document_id = serializers.CharField(required=False, allow_blank=True)
    dataroom_folder_id = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        doc_id = data.get('dataroom_document_id')
        folder_id = data.get('dataroom_folder_id')
        if doc_id and folder_id:
            raise serializers.ValidationError("Only one of 'dataroom_document_id' or 'dataroom_folder_id' can be provided.")
        return data


class QnAMessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField()
    view_session_id = serializers.CharField(required=False, allow_blank=True)


class QnAOwnerThreadCreateSerializer(QnAThreadCreateSerializer):
    share_link_id = serializers.CharField()


class QnAThreadStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[QnAThread.STATUS_OPEN, QnAThread.STATUS_CLOSED])


class NDAAcceptanceSummarySerializer(serializers.ModelSerializer):
    viewer_email = serializers.CharField(source='viewer.email', read_only=True, allow_null=True)
    has_executed_pdf = serializers.SerializerMethodField()

    class Meta:
        model = NDAAcceptance
        fields = [
            'id',
            'viewer_email',
            'accepted_at',
            'nda_version',
            'signer_name',
            'signer_title',
            'signer_company',
            'signer_email',
            'signature_type',
            'original_doc_sha256',
            'signed_doc_sha256',
            'seal_method',
            'has_executed_pdf',
            'vault_dataroom_document',
        ]
        read_only_fields = fields

    def get_has_executed_pdf(self, obj) -> bool:
        return bool(obj.executed_pdf_storage_key)


class ShareLinkAcceptPDFNDASerializer(serializers.Serializer):
    view_session_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    signer_name = serializers.CharField(max_length=255)
    signer_title = serializers.CharField(required=False, allow_blank=True, max_length=255, default='')
    signer_company = serializers.CharField(required=False, allow_blank=True, max_length=255, default='')
    signer_email = serializers.EmailField(required=False, allow_blank=True, default='')
    signature_type = serializers.ChoiceField(choices=['draw', 'type'])
    signature_data = serializers.CharField()
    page_number = serializers.IntegerField(required=False, min_value=1, max_value=500)
    x_pct = serializers.FloatField(required=False, min_value=0.0, max_value=100.0)
    y_pct = serializers.FloatField(required=False, min_value=0.0, max_value=100.0)
    width_pct = serializers.FloatField(required=False, min_value=0.1, max_value=100.0)
    height_pct = serializers.FloatField(required=False, min_value=0.1, max_value=100.0)

    def validate(self, data):
        signer_name = (data.get('signer_name') or '').strip()
        if not signer_name:
            raise serializers.ValidationError({'signer_name': 'Signer name cannot be empty.'})
        data['signer_name'] = signer_name

        coord_keys = ('page_number', 'x_pct', 'y_pct', 'width_pct', 'height_pct')
        provided_coords = [k for k in coord_keys if k in data]
        if provided_coords:
            if len(provided_coords) != len(coord_keys):
                raise serializers.ValidationError('Partial signature coordinates are not allowed; provide all of page_number, x_pct, y_pct, width_pct, height_pct or omit all.')
            x = data['x_pct']
            y = data['y_pct']
            w = data['width_pct']
            h = data['height_pct']
            for key, val in (('x_pct', x), ('y_pct', y), ('width_pct', w), ('height_pct', h)):
                if not math.isfinite(val):
                    raise serializers.ValidationError({key: f'{key} must be a finite number.'})
            if not (0.0 <= x < 100.0) or not (0.0 <= y < 100.0):
                raise serializers.ValidationError('x_pct and y_pct must satisfy 0 <= value < 100.')
            if not (w > 0.0 and h > 0.0) or (x + w > 100.0) or (y + h > 100.0):
                raise serializers.ValidationError('Signature placement bounds exceed [0, 100] page percentage limits.')
        return data
