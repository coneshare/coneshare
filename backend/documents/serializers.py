from django.contrib.auth.hashers import make_password
from django.db import transaction
from rest_framework import serializers
from core.models import Organization
from datarooms.models import Dataroom, DataroomDocument, DataroomFolder, ShareLinkDataroomSetting
from .models import Document, DocumentPage, DocumentVersion, Folder, PageView, ShareLink, ShareLinkPreset, ViewSession, Viewer
from .services import _get_unique_folder_name, _get_unique_share_link_name


class EnsureFolderPathsSerializer(serializers.Serializer):
    """
    Serializer for validating paths for the ensure-paths endpoint.
    """
    paths = serializers.ListField(
        child=serializers.CharField(max_length=1024, allow_blank=False),
        allow_empty=False
    )
    parent_path = serializers.CharField(max_length=1024, allow_blank=True, required=False)


class FolderSerializer(serializers.ModelSerializer):
    ancestors = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = ['id', 'name', 'parent', 'organization', 'created_at', 'updated_at', 'ancestors', 'is_starred']
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at', 'ancestors']

    def get_ancestors(self, obj):
        """
        Returns a list of ancestor folders, from the root down to the
        immediate parent. Excludes the invisible __root__ folder.
        """

        # This while loop to fetch ancestors introduces a potential N+1 query problem. Each access to parent.parent will trigger a separate database query.
        # For deeply nested folders, this could lead to performance issues.
        # While the current implementation is simple and works for shallow hierarchies, for future scalability you might consider a more optimized approach, such as:
        #    Using a recursive Common Table Expression (CTE) with raw SQL (if your database supports it, like PostgreSQL).
        #    Using a library like django-mptt which is designed to handle hierarchical data efficiently.

        ancestors = []
        parent = obj.parent
        while parent and parent.name != '__root__':
            ancestors.append({'id': parent.id, 'name': parent.name})
            parent = parent.parent
        return list(reversed(ancestors))

    def validate(self, data):
        """
        Manually enforce uniqueness for a folder's name within its parent,
        accounting for the invisible __root__ folder.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return data

        organization = request.user.organization
        name = data.get('name', self.instance.name if self.instance else None)
        # On update, parent might not be in payload. We get it from instance.
        parent = data.get('parent', self.instance.parent if self.instance else None)

        if parent is None:
            # If no parent is specified, the logical parent is the invisible root.
            try:
                parent = Folder.objects.get_root_for_org(organization)
            except Folder.DoesNotExist:
                raise serializers.ValidationError({
                    'non_field_errors': [
                        "A server configuration error occurred: organization root folder is missing."
                    ]
                })

        # On folder creation, we auto-rename if a duplicate exists.
        # On folder update, we want to raise an error if the new name is a duplicate.
        if self.instance:
            queryset = Folder.objects.filter(
                created_by=request.user, parent=parent, name=name
            ).exclude(pk=self.instance.pk)

            if queryset.exists():
                raise serializers.ValidationError({
                    'name': "A folder with this name already exists in this location."
                })
        return data

    def create(self, validated_data):
        # organization and created_by are passed from FolderViewSet.perform_create
        organization = validated_data['organization']
        parent = validated_data.get('parent')
        original_name = validated_data['name']

        if parent is None:
            try:
                parent = Folder.objects.get_root_for_org(organization)
                validated_data['parent'] = parent
            except Folder.DoesNotExist:
                raise serializers.ValidationError("Organization root folder is missing.")

        unique_name = _get_unique_folder_name(
            created_by=validated_data['created_by'],
            parent_folder=parent,
            original_name=original_name
        )
        validated_data['name'] = unique_name

        return super().create(validated_data)


class DocumentPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentPage
        fields = ['id', 'page_number', 'storage_key', 'created_at']
        read_only_fields = fields


class DocumentVersionSerializer(serializers.ModelSerializer):
    pages = DocumentPageSerializer(many=True, read_only=True)

    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'version_number', 'file_size', 'num_pages',
            'is_primary', 'has_pages', 'pages', 'created_at'
        ]
        read_only_fields = fields


class PageViewSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PageView
        fields = ['page_number', 'duration_seconds', 'url']

    def get_url(self, obj):
        pages_map = self.context.get('pages_map', {})
        return pages_map.get(obj.page_number)


class ViewSessionSerializer(serializers.ModelSerializer):
    share_link_name = serializers.CharField(source='share_link.name', read_only=True)
    page_views = PageViewSerializer(many=True, read_only=True)
    is_owner_view = serializers.SerializerMethodField()
    document_id = serializers.CharField(source='share_link.document.id', read_only=True)
    document_name = serializers.CharField(source='share_link.document.name', read_only=True)

    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name', 'document_id', 'document_name', 'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude', 'duration_seconds',
            'completion_rate', 'viewed_at', 'page_views', 'is_owner_view', 'downloaded_at'
        ]
        read_only_fields = ['id', 'viewed_at', 'ip_address', 'user_agent', 'share_link_name', 'document_id', 'document_name', 'country', 'city', 'latitude', 'longitude', 'page_views', 'is_owner_view', 'downloaded_at']
    
    def get_is_owner_view(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            return obj.viewer_email == request.user.email
        return False

    def create(self, validated_data):
        email = validated_data.get('viewer_email')
        share_link = validated_data.get('share_link')

        if email and share_link:
            # The organization is derived from the document being shared
            organization = share_link.document.organization
            viewer, _ = Viewer.objects.get_or_create(
                organization=organization,
                email=email
            )
            # Associate the view with the identified viewer
            validated_data['viewer'] = viewer

        return super().create(validated_data)


class ShareLinkSerializer(serializers.ModelSerializer):
    dataroom = serializers.PrimaryKeyRelatedField(
        queryset=Dataroom.objects.all(), write_only=True, required=False, allow_null=True
    )
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
            if name and ShareLink.objects.filter(
                document=document, name=name
            ).exclude(pk=self.instance.pk).exists():
                raise serializers.ValidationError(
                    {'name': 'A share link with this name already exists for this document.'}
                )

        return data

    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'dataroom', 'document_name', 'dataroom_name', 'created_by', 'name', 'slug', 'expires_at',
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

        if document:
            # Default to "Untitled Link" if name is not provided or is empty.
            original_name = validated_data.get('name') or "Untitled Link"
            validated_data['name'] = _get_unique_share_link_name(document, original_name)

        # For datarooms, we'll just use the provided name for now. A future
        # task could be to implement unique name generation for dataroom links.
        elif dataroom and not validated_data.get('name'):
             validated_data['name'] = "Untitled Link"

        # The post_save signal will now handle creating settings for dataroom links.
        share_link = super().create(validated_data)

        return share_link

    def update(self, instance, validated_data):
        return super().update(instance, validated_data)


class ShareLinkEmailSerializer(serializers.Serializer):
    """Serializer for the email submission form."""
    email = serializers.EmailField()


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

    class Meta:
        model = PageView
        fields = ['view_session', 'page_number', 'duration_seconds']


class DocumentSerializer(serializers.ModelSerializer):
    versions = DocumentVersionSerializer(many=True, read_only=True)
    share_links = ShareLinkSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'organization', 'folder', 'name', 'description', 'status',
            'status_message', 'storage_key', 'original_storage_key', 'type', 'content_type',
            'num_pages', 'file_size', 'download_only', 'assistant_enabled', 'is_starred', 'created_by',
            'created_at', 'updated_at', 'versions', 'share_links'
        ]
        read_only_fields = [
            'id', 'organization', 'created_by', 'created_at', 'updated_at'
        ]

    def create(self, validated_data):
        request = self.context['request']
        # Automatically assign the user's organization and the user
        validated_data['organization'] = request.user.organization
        validated_data['created_by'] = request.user
        return super().create(validated_data)


class ShareLinkPresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareLinkPreset
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


