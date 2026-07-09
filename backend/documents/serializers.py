from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import (Document, DocumentPage, DocumentVersion, Folder)
from .services import _get_unique_folder_name


class EnsureFolderPathsSerializer(serializers.Serializer):
    """
    Serializer for validating paths for the ensure-paths endpoint.
    """
    paths = serializers.ListField(
        child=serializers.CharField(max_length=1024, allow_blank=False),
        allow_empty=False
    )
    parent_path = serializers.CharField(
        max_length=1024, allow_blank=True, required=False, allow_null=True
    )


class FolderSerializer(serializers.ModelSerializer):
    ancestors = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = ['id', 'name', 'parent', 'organization', 'created_at', 'updated_at', 'ancestors', 'is_starred']
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at', 'ancestors']

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
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
    cloud_import = serializers.SerializerMethodField()

    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'version_number', 'file_size', 'num_pages',
            'is_primary', 'has_pages', 'render_status', 'render_error',
            'pages', 'cloud_import', 'created_at'
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_cloud_import(self, obj) -> dict:
        """
        Exposes display-safe cloud import details. Raw metadata is filtered
        to prevent leaking sensitive connection details (e.g. connection_id).
        """
        if isinstance(obj.metadata, dict):
            ci = obj.metadata.get('cloud_import')
            if isinstance(ci, dict):
                return {
                    'provider': ci.get('provider'),
                    'provider_display': ci.get('provider_display'),
                    'file_name': ci.get('file_name'),
                    'file_path': ci.get('file_path') or ci.get('file_id'),
                }
        return None


class DocumentVersionListSerializer(serializers.ModelSerializer):
    cloud_import = serializers.SerializerMethodField()

    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'version_number', 'file_size', 'num_pages',
            'is_primary', 'has_pages', 'render_status', 'render_error',
            'cloud_import', 'created_at'
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_cloud_import(self, obj) -> dict:
        """
        Exposes display-safe cloud import details. Raw metadata is filtered
        to prevent leaking sensitive connection details (e.g. connection_id).
        """
        if isinstance(obj.metadata, dict):
            ci = obj.metadata.get('cloud_import')
            if isinstance(ci, dict):
                return {
                    'provider': ci.get('provider'),
                    'provider_display': ci.get('provider_display'),
                    'file_name': ci.get('file_name'),
                    'file_path': ci.get('file_path') or ci.get('file_id'),
                }
        return None


class NestedFolderField(serializers.PrimaryKeyRelatedField):
    """
    A custom field that uses a primary key for writes but serializes
    the full related object for reads.
    """
    def to_representation(self, value):
        # When a related field is not prefetched, 'value' may be a lazy
        # proxy object. We must fetch the full instance to serialize it.
        instance = self.get_queryset().get(pk=value.pk)
        return FolderSerializer(instance, context=self.context).data


class RootFolderDefault:
    """
    A default class that can be used to set the root folder for a user.
    """
    requires_context = True

    def __call__(self, serializer_field):
        request = serializer_field.context['request']
        return Folder.objects.get_root_for_org(request.user.organization)

    def __repr__(self):
        return '%s()' % self.__class__.__name__


class DocumentSerializer(serializers.ModelSerializer):
    versions = DocumentVersionSerializer(many=True, read_only=True)
    share_links = serializers.SerializerMethodField()
    uploader_info = serializers.SerializerMethodField()
    share_link_view_count = serializers.SerializerMethodField()
    cloud_import = serializers.SerializerMethodField()
    # parent folder this document belongs to.
    # TODO: we may need to explict pass parent folder to this serialier for performance consideration.
    # XXX: why default=RootFolderDefault()? Even though required=False tells the serializer that the client does not
    # need to send the folder field, the ModelSerializer is smart enough to know that it cannot create a valid
    # Document instance without a value for this field. This underlying model constraint causes the initial
    # validation to fail before any of your custom logic (like the validate or create methods) can run.
    folder = NestedFolderField(
        queryset=Folder.objects.all(),
        required=False,
        allow_null=True,
        default=RootFolderDefault()
    )

    class Meta:
        model = Document
        fields = [
            'id', 'organization', 'folder', 'name', 'description', 'status',
            'status_message', 'storage_key', 'original_storage_key', 'type', 'content_type',
            'num_pages', 'file_size', 'download_only', 'assistant_enabled', 'is_starred', 'created_by',
            'created_at', 'updated_at', 'versions', 'share_links', 'uploader_info', 'share_link_view_count',
            'cloud_import'
        ]
        read_only_fields = [
            'id', 'organization', 'created_by', 'created_at', 'updated_at'
        ]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_share_links(self, instance):
        from sharelinks.serializers import ShareLinkSerializer
        # The 'share_links' related manager is often prefetched in the viewset,
        # so this should be efficient.
        queryset = instance.share_links.all()
        return ShareLinkSerializer(queryset, many=True, context=self.context).data

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_uploader_info(self, obj) -> dict:
        return obj.metadata.get('uploader_info', None)

    @extend_schema_field(serializers.IntegerField())
    def get_share_link_view_count(self, obj) -> int:
        annotated_count = getattr(obj, 'share_link_view_count', None)
        if annotated_count is not None:
            return annotated_count

        from sharelinks.models import ViewSession
        return ViewSession.objects.filter(share_link__document=obj).count()

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_cloud_import(self, obj) -> dict:
        """
        Exposes display-safe cloud import details from the active primary version.
        Raw metadata is filtered to prevent leaking sensitive connection details (e.g. connection_id).
        """
        # Retrieve the currently active/primary version
        primary_version = obj.versions.filter(is_primary=True).first()
        if primary_version and isinstance(primary_version.metadata, dict):
            ci = primary_version.metadata.get('cloud_import')
            if isinstance(ci, dict):
                return {
                    'provider': ci.get('provider'),
                    'provider_display': ci.get('provider_display'),
                    'file_name': ci.get('file_name'),
                    'file_path': ci.get('file_path') or ci.get('file_id'),
                    'file_id': ci.get('file_id'),
                    'etag_or_rev': ci.get('etag_or_rev'),
                }
        return None

    def create(self, validated_data):
        request = self.context['request']
        # Automatically assign the user's organization and the user
        validated_data['organization'] = request.user.organization
        validated_data['created_by'] = request.user
        return super().create(validated_data)
