from rest_framework import serializers

from core.models import Organization
from .models import (Document, DocumentPage, DocumentVersion, Folder,
                     PageView, ViewSession, Viewer)
from .services import _get_unique_folder_name


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

    class Meta:
        model = PageView
        fields = ['view_session', 'page_number', 'duration_seconds']


class DocumentSerializer(serializers.ModelSerializer):
    versions = DocumentVersionSerializer(many=True, read_only=True)
    share_links = serializers.SerializerMethodField()

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

    def get_share_links(self, instance):
        from sharelinks.serializers import ShareLinkSerializer
        # The 'share_links' related manager is often prefetched in the viewset,
        # so this should be efficient.
        queryset = instance.share_links.all()
        return ShareLinkSerializer(queryset, many=True, context=self.context).data

    def create(self, validated_data):
        request = self.context['request']
        # Automatically assign the user's organization and the user
        validated_data['organization'] = request.user.organization
        validated_data['created_by'] = request.user
        return super().create(validated_data)
