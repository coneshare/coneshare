from django.contrib.auth.hashers import make_password
from rest_framework import serializers
from core.models import Organization
from .models import Document, DocumentPage, DocumentVersion, Folder, PageView, ShareLink, ShareLinkPreset, ViewSession, Viewer
from .services import _get_unique_folder_name, _get_unique_share_link_name


class FolderFromPathSerializer(serializers.Serializer):
    """
    Serializer for validating the path for the from_path endpoint.
    """
    path = serializers.CharField(max_length=1024, allow_blank=False)


class FolderSerializer(serializers.ModelSerializer):
    ancestors = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = ['id', 'name', 'parent', 'organization', 'created_at', 'updated_at', 'ancestors']
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
        parent = data.get('parent')
        name = data.get('name', self.instance.name if self.instance else None)

        if parent is None:
            # If no parent is specified, the logical parent is the invisible root.
            try:
                parent = Folder.objects.get(
                    organization=organization, name='__root__', parent=None
                )
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
                organization=organization, parent=parent, name=name
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
                parent = Folder.objects.get(
                    organization=organization, name='__root__', parent=None
                )
                validated_data['parent'] = parent
            except Folder.DoesNotExist:
                raise serializers.ValidationError("Organization root folder is missing.")

        unique_name = _get_unique_folder_name(
            organization=organization,
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

    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name', 'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude', 'duration_seconds',
            'completion_rate', 'viewed_at', 'page_views', 'is_owner_view', 'downloaded_at'
        ]
        read_only_fields = ['id', 'viewed_at', 'ip_address', 'user_agent', 'share_link_name', 'country', 'city', 'latitude', 'longitude', 'page_views', 'is_owner_view', 'downloaded_at']
    
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
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={'input_type': 'password'}
    )
    has_password = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    view_sessions = ViewSessionSerializer(many=True, read_only=True)

    def validate(self, data):
        """
        Enforce business rules:
        - If the associated document is download-only, force allow_download to be true.
        """
        # On update, 'document' may not be in the payload. We get it from the instance.
        document = data.get('document') or getattr(self.instance, 'document', None)

        if document and document.download_only:
            data['allow_download'] = True

        return data

    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'created_by', 'name', 'slug', 'expires_at',
            'has_password', 'password', 'requires_email', 'requires_email_verification', 'allow_download',
            'enable_watermark', 'receive_email_notification', 'is_active', 'created_at', 'updated_at',
            'view_count', 'view_sessions'
        ]
        read_only_fields = [
            'id', 'created_by', 'slug', 'created_at', 'updated_at'
        ]
        extra_kwargs = {'name': {'required': False, 'allow_blank': True}}

    def get_has_password(self, obj):
        """Returns True if the link is password-protected."""
        return obj.password_hash is not None

    def get_view_count(self, obj):
        """Returns the number of view sessions for the link."""
        # This is efficient because of the prefetch_related in the view.
        if hasattr(obj, '_prefetched_objects_cache') and 'view_sessions' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['view_sessions'])
        return obj.view_sessions.count()

    def _hash_password(self, validated_data):
        """Hashes the password if it exists in the validated data."""
        if 'password' in validated_data:
            password = validated_data.pop('password')
            if password:
                validated_data['password_hash'] = make_password(password)
            else:
                # If password is an empty string, treat it as clearing the password
                validated_data['password_hash'] = None

    def create(self, validated_data):
        request = self.context['request']
        validated_data['created_by'] = request.user

        document = validated_data['document']
        # Default to "Untitled Link" if name is not provided or is empty.
        original_name = validated_data.get('name') or "Untitled Link"
        validated_data['name'] = _get_unique_share_link_name(document, original_name)

        self._hash_password(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self._hash_password(validated_data)
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
            'storage_key', 'original_storage_key', 'type', 'content_type',
            'num_pages', 'download_only', 'assistant_enabled', 'created_by',
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
            'enable_watermark', 'receive_email_notification', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context['request']
        # Automatically assign the user's organization
        validated_data['organization'] = request.user.organization
        return super().create(validated_data)
