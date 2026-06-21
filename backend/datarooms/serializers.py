from rest_framework import serializers
import re
import posixpath
from urllib.parse import urljoin
from django.conf import settings
from django.db.models import Count

from .models import Dataroom, DataroomDocument, DataroomFolder, DataroomItemOrder

HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


class DataroomSerializer(serializers.ModelSerializer):
    remove_branding_banner = serializers.BooleanField(write_only=True, required=False, default=False)

    def _get_branding_banner_url(self, obj):
        if not obj.branding_banner:
            return None
        return urljoin(settings.SITE_DOMAIN, obj.branding_banner.url)

    def _validate_hex_color(self, value, field_name):
        if value in (None, ""):
            return value
        if not HEX_COLOR_RE.match(value):
            raise serializers.ValidationError(
                {field_name: "Must be a valid hex color in #RRGGBB or #RRGGBBAA format."}
            )
        return value

    def validate_brand_primary_color(self, value):
        return self._validate_hex_color(value, "brand_primary_color")

    def validate_brand_secondary_color(self, value):
        return self._validate_hex_color(value, "brand_secondary_color")

    def validate_brand_accent_color(self, value):
        return self._validate_hex_color(value, "brand_accent_color")

    class Meta:
        model = Dataroom
        fields = [
            'id', 'name', 'organization', 'created_at', 'updated_at', 'created_by',
            'show_file_index',
            'branding_banner', 'brand_primary_color', 'brand_secondary_color', 'brand_accent_color',
            'remove_branding_banner',
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at', 'created_by']

    def create(self, validated_data):
        # API compatibility: this write-only control flag is only meaningful for updates.
        validated_data.pop('remove_branding_banner', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        remove_logo = validated_data.pop('remove_branding_banner', False)
        if remove_logo and instance.branding_banner:
            instance.branding_banner.delete(save=False)
            instance.branding_banner = None
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['branding_banner'] = self._get_branding_banner_url(instance)
        return data


class DataroomFolderSerializer(serializers.ModelSerializer):
    ancestors = serializers.SerializerMethodField()

    class Meta:
        model = DataroomFolder
        fields = ['id', 'name', 'dataroom', 'parent', 'is_starred', 'created_at', 'updated_at', 'ancestors']
        read_only_fields = ['id', 'created_at', 'updated_at', 'ancestors']

    def get_ancestors(self, obj):
        """
        Returns a list of ancestor folders, from the root down to the
        immediate parent.
        """
        folder_parent_map = self.context.get('dataroom_folder_parent_map')
        if folder_parent_map:
            ancestors = []
            node_id = str(obj.parent_id) if obj.parent_id else None
            while node_id:
                parent = folder_parent_map.get(node_id)
                if not parent:
                    break
                ancestors.append({'id': parent['id'], 'name': parent['name']})
                parent_id = parent.get('parent_id')
                node_id = str(parent_id) if parent_id else None
            return list(reversed(ancestors))

        ancestors = []
        parent = obj.parent
        while parent:
            ancestors.append({'id': parent.id, 'name': parent.name})
            parent = parent.parent
        return list(reversed(ancestors))


class DataroomDocumentSerializer(serializers.ModelSerializer):
    document_type = serializers.CharField(source='document.type', read_only=True)
    document_id = serializers.CharField(source='document.id', read_only=True)
    file_size = serializers.IntegerField(source='document.file_size', read_only=True)
    updated_at = serializers.DateTimeField(source='document.updated_at', read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(source='document.created_by', read_only=True)
    folder = serializers.PrimaryKeyRelatedField(read_only=True)
    name = serializers.SerializerMethodField()
    dataroom_view_count = serializers.SerializerMethodField()

    class Meta:
        model = DataroomDocument
        fields = [
            'id', 'name', 'document_id', 'document_type', 'created_at',
            'file_size', 'updated_at', 'created_by', 'folder', 'is_starred',
            'dataroom_view_count'
        ]

    def get_name(self, obj):
        return obj.name or obj.document.name

    def get_dataroom_view_count(self, obj):
        return getattr(obj, 'dataroom_view_count', 0) or 0


class DataroomDetailSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    branding_banner = serializers.SerializerMethodField()

    class Meta:
        model = Dataroom
        fields = [
            'id', 'name', 'organization', 'created_at', 'updated_at', 'created_by',
            'show_file_index',
            'branding_banner', 'brand_primary_color', 'brand_secondary_color', 'brand_accent_color',
            'items'
        ]
        read_only_fields = fields

    def get_branding_banner(self, obj):
        if not obj.branding_banner:
            return None
        return urljoin(settings.SITE_DOMAIN, obj.branding_banner.url)

    def get_items(self, obj):
        request = self.context.get('request')
        use_full_content = bool(request and request.query_params.get('content') == 'full')
        folder_parent_map = None
        if use_full_content:
            folder_parent_map = {
                str(row['id']): {
                    'id': row['id'],
                    'name': row['name'],
                    'parent_id': row['parent_id'],
                }
                for row in obj.folders.values('id', 'name', 'parent_id')
            }
        serializer_context = {**self.context}
        if folder_parent_map is not None:
            serializer_context['dataroom_folder_parent_map'] = folder_parent_map

        if request and request.query_params.get('content') == 'full':
            folders = obj.folders.all().order_by('created_at', 'id')
            documents = obj.documents.all().select_related('document', 'document__created_by').annotate(
                dataroom_view_count=Count('dataroomvisit', distinct=True)
            ).order_by('created_at', 'id')
        else:
            folders = obj.folders.filter(parent__isnull=True).order_by('created_at', 'id')
            documents = obj.documents.filter(folder__isnull=True).select_related('document', 'document__created_by').annotate(
                dataroom_view_count=Count('dataroomvisit', distinct=True)
            ).order_by('created_at', 'id')
        folders_list = list(folders)
        documents_list = list(documents)

        if obj.show_file_index and not use_full_content:
            scope_rows = list(
                DataroomItemOrder.objects.filter(dataroom=obj, parent_folder__isnull=True)
                .order_by("position", "created_at", "id")
            )
            if scope_rows and len(scope_rows) == (len(folders_list) + len(documents_list)):
                folder_data_map = {
                    str(folder.id): DataroomFolderSerializer(folder, context=serializer_context).data
                    for folder in folders_list
                }
                document_data_map = {
                    str(document.id): DataroomDocumentSerializer(document, context=serializer_context).data
                    for document in documents_list
                }
                ordered_items = []
                for row in scope_rows:
                    if row.item_type == DataroomItemOrder.ITEM_TYPE_FOLDER and row.folder_id and str(row.folder_id) in folder_data_map:
                        ordered_items.append({"type": "folder", **folder_data_map[str(row.folder_id)], "position": row.position})
                    elif row.item_type == DataroomItemOrder.ITEM_TYPE_DOCUMENT and row.dataroom_document_id and str(row.dataroom_document_id) in document_data_map:
                        ordered_items.append({"type": "document", **document_data_map[str(row.dataroom_document_id)], "position": row.position})
                return ordered_items

        merged = []
        for folder in folders_list:
            merged.append({
                'type': 'folder',
                'created_at': folder.created_at,
                'data': DataroomFolderSerializer(folder, context=serializer_context).data,
            })
        for document in documents_list:
            merged.append({
                'type': 'document',
                'created_at': document.created_at,
                'data': DataroomDocumentSerializer(document, context=serializer_context).data,
            })

        merged.sort(key=lambda i: (i['type'] != 'folder', i['created_at'], i['data']['id']))
        return [{'type': i['type'], **i['data']} for i in merged]


class AddContentSerializer(serializers.Serializer):
    document_ids = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    folder_ids = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    destination_folder_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, data):
        if not data.get('document_ids') and not data.get('folder_ids'):
            raise serializers.ValidationError("Either 'document_ids' or 'folder_ids' must be provided.")
        return data


class RemoveContentSerializer(serializers.Serializer):
    dataroom_document_ids = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    dataroom_folder_ids = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )

    def validate(self, data):
        if not data.get('dataroom_document_ids') and not data.get('dataroom_folder_ids'):
            raise serializers.ValidationError("Either 'dataroom_document_ids' or 'dataroom_folder_ids' must be provided.")
        return data


class DataroomDocumentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataroomDocument
        fields = ['name', 'is_starred']
        extra_kwargs = {
            'name': {'required': False},
            'is_starred': {'required': False}
        }


class MoveDataroomContentSerializer(serializers.Serializer):
    dataroom_document_ids = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    dataroom_folder_ids = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    destination_folder_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, data):
        if not data.get('dataroom_document_ids') and not data.get('dataroom_folder_ids'):
            raise serializers.ValidationError("Either 'dataroom_document_ids' or 'dataroom_folder_ids' must be provided.")
        return data


class ReorderDataroomItemsSerializer(serializers.Serializer):
    parent_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    ordered_items = serializers.ListField(child=serializers.DictField(), allow_empty=False)

    def validate_ordered_items(self, value):
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each ordered item must be an object.")
            item_type = item.get("type")
            item_id = item.get("id")
            if item_type not in ("folder", "document"):
                raise serializers.ValidationError("Each ordered item type must be 'folder' or 'document'.")
            if not item_id:
                raise serializers.ValidationError("Each ordered item must include a non-empty id.")
        return value


# --- Serializers for Public Dataroom View ---

class PublicDataroomDocumentSerializer(serializers.ModelSerializer):
    document_type = serializers.CharField(source='document.type', read_only=True)
    document_id = serializers.CharField(source='document.id', read_only=True)
    num_pages = serializers.IntegerField(source='document.num_pages', read_only=True)
    updated_at = serializers.DateTimeField(source='document.updated_at', read_only=True)
    file_size = serializers.IntegerField(source='document.file_size', read_only=True)
    parent = serializers.PrimaryKeyRelatedField(source='folder', read_only=True)
    # Settings are added from context
    allow_download = serializers.SerializerMethodField()
    enable_watermark = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()

    class Meta:
        model = DataroomDocument
        fields = [
            'id', 'name', 'document_id', 'document_type',
            'num_pages', 'allow_download', 'enable_watermark', 'updated_at', 'file_size',
            'parent'
        ]

    def get_name(self, obj):
        return obj.name or obj.document.name

    def get_allow_download(self, obj):
        settings = self.context.get('settings_map', {})
        # obj.id here is the DataroomDocument ID
        return settings.get(obj.id, {}).get('allow_download', False)

    def get_enable_watermark(self, obj):
        settings = self.context.get('settings_map', {})
        return settings.get(obj.id, {}).get('enable_watermark', False)


class PublicDataroomFolderSerializer(serializers.ModelSerializer):
    # Settings are added from context
    allow_download = serializers.SerializerMethodField()
    enable_watermark = serializers.SerializerMethodField()

    class Meta:
        model = DataroomFolder
        fields = ['id', 'name', 'parent', 'allow_download', 'enable_watermark', 'updated_at']

    def get_allow_download(self, obj):
        settings = self.context.get('settings_map', {})
        # obj.id here is the DataroomFolder ID
        return settings.get(obj.id, {}).get('allow_download', False)

    def get_enable_watermark(self, obj):
        settings = self.context.get('settings_map', {})
        return settings.get(obj.id, {}).get('enable_watermark', False)


def validate_safe_relative_path(value):
    """
    Validates and normalizes relative path strings representing folder/file hierarchies
    within a dataroom. The paths must be relative to the target/destination folder
    in the dataroom.
    """
    if not value:
        return value

    # Convert Windows-style backslashes to forward slashes for uniform cross-platform parsing
    normalized_separators = value.replace('\\', '/')

    # Normalize redundant separators and dot components (e.g., 'foo//bar' -> 'foo/bar') using posixpath
    normalized = posixpath.normpath(normalized_separators)

    # Reject absolute paths (e.g. '/etc/passwd'). Paths must be relative to the destination container;
    # absolute paths would break database folder hierarchy lookups and create malformed root '/' folders.
    if normalized.startswith('/'):
        raise serializers.ValidationError("Absolute paths are not allowed.")

    # Reject directory traversal components ('..') to prevent climbing out of the dataroom root
    # or creating malformed '..' folder records in the database, avoiding potential Zip Slip/traversal exploits.
    parts = normalized.split('/')
    if '..' in parts or '..' in value.split('/') or '..' in value.split('\\'):
        raise serializers.ValidationError("Directory traversal components ('..') are not allowed.")

    if normalized == '.':
        return ''

    return normalized


class EnsureDataroomFolderPathsSerializer(serializers.Serializer):
    paths = serializers.ListField(child=serializers.CharField())
    parent_folder_id = serializers.PrimaryKeyRelatedField(
        queryset=DataroomFolder.objects.all(), required=False, allow_null=True, default=None
    )

    def validate_paths(self, value):
        validated_paths = []
        for path in value:
            validated_paths.append(validate_safe_relative_path(path))
        return validated_paths


class DataroomUploadRequestSerializer(serializers.Serializer):
    file_name = serializers.CharField()
    file_size = serializers.IntegerField()
    destination_folder_id = serializers.PrimaryKeyRelatedField(
        queryset=DataroomFolder.objects.all(), required=False, allow_null=True, default=None
    )
    path = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    def validate_path(self, value):
        return validate_safe_relative_path(value)


class DataroomUploadFinalizeSerializer(serializers.Serializer):
    storage_key = serializers.CharField()
    unique_name = serializers.CharField()
    file_size = serializers.IntegerField()
    content_type = serializers.CharField(allow_blank=True)
    destination_folder_id = serializers.PrimaryKeyRelatedField(
        queryset=DataroomFolder.objects.all(), required=False, allow_null=True, default=None
    )
    path = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    def validate_path(self, value):
        return validate_safe_relative_path(value)

