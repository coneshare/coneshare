import re
from datetime import datetime
from urllib.parse import urljoin

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.models import Organization
from datarooms.models import Dataroom
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
            'video_start_time', 'video_end_time', 'video_volume', 'is_fullscreen', 'playback_speed'
        ]

    def get_url(self, obj) -> str | None:
        pages_map = self.context.get('pages_map', {})
        return pages_map.get(obj.page_number)


class LinkClickSerializer(serializers.ModelSerializer):
    class Meta:
        model = LinkClick
        fields = ['id', 'url', 'page_number', 'clicked_at']
        read_only_fields = ['id', 'clicked_at']


class DataroomVisitSerializer(serializers.ModelSerializer):
    dataroom_document_name = serializers.CharField(source='dataroom_document.document.name', read_only=True, default=None)
    dataroom_document_type = serializers.CharField(source='dataroom_document.document.type', read_only=True, default=None)
    dataroom_folder_name = serializers.CharField(source='dataroom_folder.name', read_only=True, default=None)
    page_views = PageViewSerializer(many=True, read_only=True)
    link_clicks = LinkClickSerializer(many=True, read_only=True)

    class Meta:
        model = DataroomVisit
        fields = [
            'id', 'visited_at', 'downloaded_at', 'dataroom_document_id', 'dataroom_folder_id',
            'dataroom_document_name', 'dataroom_document_type', 'dataroom_folder_name', 'page_views', 'link_clicks'
        ]
        read_only_fields = ['id', 'visited_at', 'downloaded_at']


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


class ViewSessionSerializer(serializers.ModelSerializer):
    share_link_name = serializers.CharField(source='share_link.name', read_only=True)
    page_views = PageViewSerializer(many=True, read_only=True)
    dataroom_visits = DataroomVisitSerializer(many=True, read_only=True)
    link_clicks = LinkClickSerializer(many=True, read_only=True)
    is_owner_view = serializers.SerializerMethodField()
    document_id = serializers.CharField(source='share_link.document.id', read_only=True)
    document_name = serializers.CharField(source='share_link.document.name', read_only=True)
    document_type = serializers.CharField(source='share_link.document.type', read_only=True, default=None)
    dataroom_id = serializers.CharField(source='share_link.dataroom.id', read_only=True, default=None)
    dataroom_name = serializers.CharField(source='share_link.dataroom.name', read_only=True, default=None)

    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name', 'document_id', 'document_name', 'document_type',
            'dataroom_id', 'dataroom_name', 'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude', 'duration_seconds',
            'completion_rate', 'viewed_at', 'page_views', 'dataroom_visits', 'link_clicks', 'is_owner_view', 'downloaded_at'
        ]
        read_only_fields = ['id', 'viewed_at', 'ip_address', 'user_agent', 'share_link_name', 'document_id', 'document_name', 'document_type', 'dataroom_id', 'dataroom_name', 'country', 'city', 'latitude', 'longitude', 'page_views', 'dataroom_visits', 'link_clicks', 'is_owner_view', 'downloaded_at']
    
    def get_is_owner_view(self, obj) -> bool:
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            return obj.viewer_email == request.user.email
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

            viewer, _ = Viewer.objects.get_or_create(
                organization=organization,
                email=email
            )
            # Associate the view with the identified viewer
            validated_data['viewer'] = viewer

        return super().create(validated_data)


class ViewerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Viewer
        fields = ['id', 'organization', 'email', 'created_at']
        read_only_fields = ['id', 'organization', 'created_at']

    def create(self, validated_data):
        # Automatically assign the default organization
        validated_data['organization'] = Organization.objects.first()
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
            'video_start_time', 'video_end_time', 'video_volume', 'is_fullscreen', 'playback_speed'
        ]

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


class ShareLinkSerializer(serializers.ModelSerializer):
    dataroom = serializers.PrimaryKeyRelatedField(
        queryset=Dataroom.objects.all(), required=False, allow_null=True
    )
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
            if document and document.created_by_id and document.created_by_id != user.id:
                raise serializers.ValidationError({'document': 'You do not have permission to share this document.'})
            if dataroom:
                is_owner = dataroom.created_by_id == user.id
                is_admin = getattr(user, 'role', '') == 'admin' and dataroom.organization_id == user.organization_id
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
            'view_count', 'recent_view_sessions', 'last_viewed_at', 'require_nda', 'nda_text', 'nda_version', 'has_accepted_current_nda'
        ]
        read_only_fields = [
            'id', 'created_by', 'created_by_user', 'slug', 'url', 'created_at', 'updated_at', 'document_name', 'document_type', 'nda_version', 'has_accepted_current_nda'
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

    url = serializers.SerializerMethodField()

    def get_url(self, obj) -> str:
        site_domain = settings.SITE_DOMAIN.rstrip('/')
        return f"{site_domain}/view/{obj.slug}"

    def get_has_password(self, obj) -> bool:
        """Returns True if the link is password-protected."""
        return bool(obj.password)

    def get_view_count(self, obj) -> int:
        """Returns the number of view sessions for the link."""
        # This is efficient because of the prefetch_related in the view.
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

        # The post_save signal will now handle creating settings for dataroom links.
        share_link = super().create(validated_data)

        return share_link

    def update(self, instance, validated_data):
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
