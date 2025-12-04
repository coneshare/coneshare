from rest_framework import serializers

from core.models import Organization
from datarooms.models import Dataroom
from .models import (DataroomVisit, PageView, ShareLink,
                     ShareLinkDataroomSetting, ShareLinkTemplate, Viewer,
                     ViewSession)
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
        fields = ['page_number', 'duration_seconds', 'url']

    def get_url(self, obj):
        pages_map = self.context.get('pages_map', {})
        return pages_map.get(obj.page_number)


class DataroomVisitSerializer(serializers.ModelSerializer):
    dataroom_document_name = serializers.CharField(source='dataroom_document.document.name', read_only=True, default=None)
    dataroom_folder_name = serializers.CharField(source='dataroom_folder.name', read_only=True, default=None)
    page_views = PageViewSerializer(many=True, read_only=True)

    class Meta:
        model = DataroomVisit
        fields = [
            'id', 'visited_at', 'dataroom_document_id', 'dataroom_folder_id',
            'dataroom_document_name', 'dataroom_folder_name', 'page_views'
        ]


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
    is_owner_view = serializers.SerializerMethodField()
    document_id = serializers.CharField(source='share_link.document.id', read_only=True)
    document_name = serializers.CharField(source='share_link.document.name', read_only=True)

    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name', 'document_id', 'document_name', 'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude', 'duration_seconds',
            'completion_rate', 'viewed_at', 'page_views', 'dataroom_visits', 'is_owner_view', 'downloaded_at'
        ]
        read_only_fields = ['id', 'viewed_at', 'ip_address', 'user_agent', 'share_link_name', 'document_id', 'document_name', 'country', 'city', 'latitude', 'longitude', 'page_views', 'dataroom_visits', 'is_owner_view', 'downloaded_at']
    
    def get_is_owner_view(self, obj):
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
        fields = ['view_session', 'page_number', 'duration_seconds', 'dataroom_visit']

    def validate(self, data):
        view_session = data.get('view_session')
        dataroom_visit = data.get('dataroom_visit')

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
    dataroom_name = serializers.CharField(source='dataroom.name', read_only=True, allow_null=True)
    last_viewed_at = serializers.SerializerMethodField()

    def validate(self, data):
        """
        Enforce business rules:
        - A link must point to either a document or a dataroom, but not both.
        - If the associated document is download-only, force allow_download to be true.
        - On update, check for name uniqueness manually.
        """
        document = data.get('document')
        dataroom = data.get('dataroom')

        # On update, we need to consider the instance's state
        if self.instance:
            document = document or self.instance.document
            dataroom = dataroom or self.instance.dataroom
            if 'document' in data and data['document'] is None:  # Explicitly setting to null
                document = None
            if 'dataroom' in data and data['dataroom'] is None:
                dataroom = None

        if not document and not dataroom:
            raise serializers.ValidationError("A share link must be associated with either a document or a dataroom.")
        if document and dataroom:
            raise serializers.ValidationError("A share link cannot be associated with both a document and a dataroom.")

        if document and document.download_only:
            data['allow_download'] = True

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

    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'dataroom', 'document_name', 'dataroom_name', 'dataroom_settings', 'created_by', 'name', 'slug', 'expires_at',
            'has_password', 'password', 'requires_email', 'requires_email_verification', 'allow_download',
            'enable_watermark', 'watermark_text', 'receive_email_notification', 'is_active', 'created_at', 'updated_at',
            'view_count', 'recent_view_sessions', 'last_viewed_at'
        ]
        read_only_fields = [
            'id', 'created_by', 'slug', 'created_at', 'updated_at', 'document_name'
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

    def get_has_password(self, obj):
        """Returns True if the link is password-protected."""
        return bool(obj.password)

    def get_view_count(self, obj):
        """Returns the number of view sessions for the link."""
        # This is efficient because of the prefetch_related in the view.
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['view_sessions'])
        return obj.view_sessions.count()

    def get_recent_view_sessions(self, obj):
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

    def get_last_viewed_at(self, obj):
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
