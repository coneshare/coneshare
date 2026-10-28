import os
import posixpath
import re
from urllib.parse import urljoin

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from PIL import Image
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from core.models import User
from .models import (
    Dataroom,
    DataroomBannerImage,
    DataroomCollaborator,
    DataroomDocument,
    DataroomFolder,
    DataroomItemOrder,
    BANNER_MODE_CHOICES,
    LOGO_MODE_CHOICES,
)
from .utils import build_ordered_dataroom_items, is_dataroom_owner_or_admin
from .services import get_dataroom_storage_used_bytes

HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
MAX_STORAGE_QUOTA_MB = 1048576  # 1 TB (1,048,576 MB)
MAX_BANNER_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_BRAND_LOGO_SIZE_BYTES = 2 * 1024 * 1024    # 2 MB
MAX_BANNER_IMAGES_PER_DATAROOM = 10


class DataroomBannerImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    position = serializers.IntegerField(min_value=0, max_value=1000, required=False)

    class Meta:
        model = DataroomBannerImage
        fields = [
            'id', 'dataroom', 'image', 'image_url', 'caption', 'position',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'dataroom', 'image_url', 'created_at', 'updated_at']

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_image_url(self, obj) -> str:
        if not obj.image:
            return None
        return urljoin(settings.SITE_DOMAIN, obj.image.url)

    def validate_image(self, value):
        if not value:
            return value
        if hasattr(value, 'size') and value.size > MAX_BANNER_IMAGE_SIZE_BYTES:
            raise serializers.ValidationError("Banner image file size cannot exceed 5 MB.")
        try:
            if hasattr(value, 'seek'):
                value.seek(0)
            img = Image.open(value)
            img.verify()
            if img.format not in ('PNG', 'JPEG', 'WEBP'):
                raise serializers.ValidationError(
                    f"Unsupported image format '{img.format}'. Allowed formats are PNG, JPEG, WEBP."
                )
            if hasattr(value, 'seek'):
                value.seek(0)
        except serializers.ValidationError:
            raise
        except Exception:
            raise serializers.ValidationError("Uploaded file is not a valid image.")
        return value

    def validate_position(self, value):
        if value is not None and (value < 0 or value > 1000):
            raise serializers.ValidationError("Position must be between 0 and 1000.")
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['image'] = self.get_image_url(instance)
        return data


class DataroomBannerImageReorderItemSerializer(serializers.Serializer):
    id = serializers.CharField(required=True)
    position = serializers.IntegerField(min_value=0, max_value=1000, required=True)



class DataroomCollaboratorUserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'avatar_url']
        read_only_fields = fields

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_avatar_url(self, obj) -> str:
        if obj.avatar and hasattr(obj.avatar, 'url'):
            return urljoin(settings.SITE_DOMAIN, obj.avatar.url)
        return None


class DataroomCollaboratorSerializer(serializers.ModelSerializer):
    user = DataroomCollaboratorUserSerializer(read_only=True)
    invited_by = DataroomCollaboratorUserSerializer(read_only=True)

    class Meta:
        model = DataroomCollaborator
        fields = ['id', 'dataroom', 'user', 'role', 'invited_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'dataroom', 'user', 'role', 'invited_by', 'created_at', 'updated_at']


class DataroomAddCollaboratorSerializer(serializers.Serializer):
    user_ids = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
        help_text="List of User ULID strings to add as collaborators."
    )
    email = serializers.EmailField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Single user email to add as a collaborator."
    )

    def validate(self, data):
        user_ids = data.get('user_ids', [])
        email = (data.get('email') or '').strip()
        if not user_ids and not email:
            raise serializers.ValidationError("Either 'user_ids' or 'email' must be provided.")
        return data


class DataroomTransferOwnershipSerializer(serializers.Serializer):
    new_owner_id = serializers.CharField(
        required=True,
        help_text="User ULID of the new owner in the organization."
    )


class DataroomSerializer(serializers.ModelSerializer):
    remove_branding_banner = serializers.BooleanField(write_only=True, required=False, default=False)
    remove_brand_logo_override = serializers.BooleanField(write_only=True, required=False, default=False)
    owner = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()
    collaborator_count = serializers.SerializerMethodField()

    def _get_branding_banner_url(self, obj):
        if not obj.branding_banner:
            return None
        return urljoin(settings.SITE_DOMAIN, obj.branding_banner.url)

    def _get_brand_logo_override_url(self, obj):
        if not obj.brand_logo_override:
            return None
        return urljoin(settings.SITE_DOMAIN, obj.brand_logo_override.url)

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

    def validate_brand_logo_override(self, value):
        if not value:
            return value
        if hasattr(value, 'size') and value.size > MAX_BRAND_LOGO_SIZE_BYTES:
            raise serializers.ValidationError("Brand logo override file size cannot exceed 2 MB.")
        name = getattr(value, 'name', '') or ''
        ext = os.path.splitext(name)[1].lower().lstrip('.')
        allowed_extensions = ['png', 'jpg', 'jpeg', 'webp']
        if ext and ext not in allowed_extensions:
            raise serializers.ValidationError(
                f"Unsupported file extension '{ext}'. Allowed extensions are: {', '.join(allowed_extensions)}."
            )
        try:
            if hasattr(value, 'seek'):
                value.seek(0)
            img = Image.open(value)
            img.verify()
            if img.format not in ('PNG', 'JPEG', 'WEBP'):
                raise serializers.ValidationError(
                    f"Unsupported image format '{img.format}'. Allowed formats are PNG, JPEG, WEBP."
                )
            if hasattr(value, 'seek'):
                value.seek(0)
        except serializers.ValidationError:
            raise
        except Exception:
            raise serializers.ValidationError("Uploaded file is not a valid image.")
        return value

    def validate_branding_banner(self, value):
        if not value:
            return value
        max_size_bytes = 5 * 1024 * 1024
        if hasattr(value, 'size') and value.size > max_size_bytes:
            raise serializers.ValidationError("Branding banner file size cannot exceed 5 MB.")
        name = getattr(value, 'name', '') or ''
        ext = os.path.splitext(name)[1].lower().lstrip('.')
        allowed_extensions = ['png', 'jpg', 'jpeg', 'webp']
        if ext and ext not in allowed_extensions:
            raise serializers.ValidationError(
                f"Unsupported file extension '{ext}'. Allowed extensions are: {', '.join(allowed_extensions)}."
            )
        try:
            if hasattr(value, 'seek'):
                value.seek(0)
            img = Image.open(value)
            img.verify()
            if img.format not in ('PNG', 'JPEG', 'WEBP'):
                raise serializers.ValidationError(
                    f"Unsupported image format '{img.format}'. Allowed formats are PNG, JPEG, WEBP."
                )
            if hasattr(value, 'seek'):
                value.seek(0)
        except serializers.ValidationError:
            raise
        except Exception:
            raise serializers.ValidationError("Uploaded file is not a valid image.")
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        if self.instance and request and hasattr(request, 'user') and request.user and request.user.is_authenticated:
            if not is_dataroom_owner_or_admin(request.user, self.instance):
                branding_fields = {
                    'branding_banner', 'remove_branding_banner',
                    'brand_primary_color', 'brand_secondary_color', 'brand_accent_color',
                    'banner_mode', 'logo_mode', 'brand_logo_override', 'remove_brand_logo_override'
                }
                changed_branding = set(attrs.keys()) & branding_fields
                if changed_branding:
                    raise PermissionDenied("Only the dataroom owner or an organization admin can modify branding settings.")
        return attrs

    @extend_schema_field(DataroomCollaboratorUserSerializer(allow_null=True))
    def get_owner(self, obj):
        if obj.created_by:
            return DataroomCollaboratorUserSerializer(obj.created_by).data
        return None

    @extend_schema_field(serializers.CharField())
    def get_current_user_role(self, obj) -> str:
        request = self.context.get('request')
        if not request or not hasattr(request, 'user') or not request.user or not request.user.is_authenticated:
            return 'none'
        user = request.user
        if obj.created_by_id == user.id:
            return 'owner'
        if getattr(user, 'role', '') == 'admin' and obj.organization_id == user.organization_id:
            return 'admin'
        if any(c.user_id == user.id for c in obj.collaborators.all()):
            return 'collaborator'
        return 'none'

    @extend_schema_field(serializers.IntegerField())
    def get_collaborator_count(self, obj) -> int:
        if hasattr(obj, 'annotated_collaborators_count'):
            return obj.annotated_collaborators_count
        return len(obj.collaborators.all())

    storage_used_bytes = serializers.SerializerMethodField()

    @extend_schema_field(serializers.IntegerField())
    def get_storage_used_bytes(self, obj) -> int:
        if hasattr(obj, 'annotated_storage_used_bytes'):
            return obj.annotated_storage_used_bytes
        return get_dataroom_storage_used_bytes(obj)

    def validate_storage_quota_mb(self, value):
        if value is not None:
            if value < 0:
                raise serializers.ValidationError("Storage quota cannot be negative.")
            if value > MAX_STORAGE_QUOTA_MB:
                raise serializers.ValidationError(f"Storage quota cannot exceed {MAX_STORAGE_QUOTA_MB} MB (1 TB).")
        request = self.context.get('request')
        if self.instance and request and hasattr(request, 'user') and request.user and request.user.is_authenticated:
            if not is_dataroom_owner_or_admin(request.user, self.instance):
                raise PermissionDenied("Only the dataroom owner or an organization admin can update the storage quota.")
        return value

    class Meta:
        model = Dataroom
        fields = [
            'id', 'name', 'organization', 'created_at', 'updated_at', 'created_by',
            'owner', 'current_user_role', 'collaborator_count',
            'storage_quota_mb', 'storage_used_bytes', 'storage_version',
            'show_file_index',
            'enable_qna',
            'branding_banner', 'brand_primary_color', 'brand_secondary_color', 'brand_accent_color',
            'remove_branding_banner',
            'banner_mode', 'logo_mode', 'brand_logo_override', 'remove_brand_logo_override',
        ]
        read_only_fields = [
            'id', 'organization', 'created_at', 'updated_at', 'created_by',
            'owner', 'current_user_role', 'collaborator_count',
            'storage_used_bytes', 'storage_version'
        ]

    def create(self, validated_data):
        # API compatibility: this write-only control flag is only meaningful for updates.
        validated_data.pop('remove_branding_banner', None)
        validated_data.pop('remove_brand_logo_override', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        files_to_delete = []
        remove_banner = validated_data.pop('remove_branding_banner', False)
        if remove_banner and instance.branding_banner:
            files_to_delete.append(instance.branding_banner)
            instance.branding_banner = None

        remove_logo = validated_data.pop('remove_brand_logo_override', False)
        if remove_logo and instance.brand_logo_override:
            files_to_delete.append(instance.brand_logo_override)
            instance.brand_logo_override = None

        if 'brand_logo_override' in validated_data and instance.brand_logo_override:
            files_to_delete.append(instance.brand_logo_override)

        updated_instance = super().update(instance, validated_data)

        if files_to_delete:
            def _cleanup():
                for f in files_to_delete:
                    try:
                        f.delete(save=False)
                    except Exception:
                        pass
            transaction.on_commit(_cleanup)

        return updated_instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['branding_banner'] = self._get_branding_banner_url(instance)
        data['brand_logo_override'] = self._get_brand_logo_override_url(instance)
        return data


class DataroomFolderSerializer(serializers.ModelSerializer):
    ancestors = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = DataroomFolder
        fields = [
            'id', 'name', 'dataroom', 'parent', 'is_starred',
            'created_at', 'updated_at', 'ancestors', 'created_by'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'ancestors', 'created_by']

    @extend_schema_field(DataroomCollaboratorUserSerializer(allow_null=True))
    def get_created_by(self, obj):
        user = obj.created_by or getattr(obj.dataroom, 'created_by', None)
        if user:
            return DataroomCollaboratorUserSerializer(user).data
        return None

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_ancestors(self, obj):
        """
        Returns a list of ancestor folders, from the root down to the
        immediate parent.
        """
        folder_parent_map = self.context.get('dataroom_folder_parent_map')
        if folder_parent_map:
            ancestors = []
            visited = set()
            node_id = str(obj.parent_id) if obj.parent_id else None
            while node_id and node_id not in visited:
                visited.add(node_id)
                parent = folder_parent_map.get(node_id)
                if not parent:
                    break
                ancestors.append({'id': parent['id'], 'name': parent['name']})
                parent_id = parent.get('parent_id')
                node_id = str(parent_id) if parent_id else None
            return list(reversed(ancestors))

        ancestors = []
        visited = set()
        parent = obj.parent
        while parent and str(parent.id) not in visited:
            visited.add(str(parent.id))
            ancestors.append({'id': parent.id, 'name': parent.name})
            parent = parent.parent
        return list(reversed(ancestors))

    def validate(self, data):
        # 1. On update: reject changing dataroom
        if self.instance and 'dataroom' in data and data['dataroom'] != self.instance.dataroom:
            raise serializers.ValidationError({
                'dataroom': "Changing the dataroom of an existing folder is not allowed."
            })

        target_dataroom = self.instance.dataroom if self.instance else data.get('dataroom')
        parent = data.get('parent') if 'parent' in data else (self.instance.parent if self.instance else None)

        # 2. Require parent folder to belong to the target dataroom
        if parent:
            if target_dataroom and parent.dataroom_id != target_dataroom.id:
                raise serializers.ValidationError({
                    'parent': "Parent folder must belong to the same dataroom."
                })

        # 3. Hierarchy cycle prevention on update
        if self.instance and 'parent' in data:
            new_parent = data.get('parent')
            if new_parent:
                if str(new_parent.id) == str(self.instance.id):
                    raise serializers.ValidationError({
                        'parent': "A folder cannot be its own parent."
                    })
                visited = {str(self.instance.id)}
                curr = new_parent
                while curr:
                    if str(curr.id) in visited:
                        raise serializers.ValidationError({
                            'parent': "Cannot move a folder into itself or one of its subfolders."
                        })
                    visited.add(str(curr.id))
                    curr = curr.parent

        return data


class DataroomDocumentSerializer(serializers.ModelSerializer):
    document_type = serializers.CharField(source='document.type', read_only=True)
    document_id = serializers.CharField(source='document.id', read_only=True)
    file_size = serializers.IntegerField(source='document.file_size', read_only=True)
    updated_at = serializers.DateTimeField(source='document.updated_at', read_only=True)
    created_by = DataroomCollaboratorUserSerializer(source='document.created_by', read_only=True)
    folder = serializers.PrimaryKeyRelatedField(read_only=True)
    name = serializers.SerializerMethodField()
    dataroom_view_count = serializers.SerializerMethodField()
    is_direct_upload = serializers.BooleanField(read_only=True)

    class Meta:
        model = DataroomDocument
        fields = [
            'id', 'name', 'document_id', 'document_type', 'created_at',
            'file_size', 'updated_at', 'created_by', 'folder', 'is_starred',
            'dataroom_view_count', 'is_direct_upload'
        ]

    @extend_schema_field(serializers.CharField())
    def get_name(self, obj) -> str:
        return obj.name or obj.document.name

    @extend_schema_field(serializers.IntegerField())
    def get_dataroom_view_count(self, obj) -> int:
        return getattr(obj, 'dataroom_view_count', 0) or 0


class DataroomDetailSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    branding_banner = serializers.SerializerMethodField()
    brand_logo_override = serializers.SerializerMethodField()
    banner_images = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()
    current_user_role = serializers.SerializerMethodField()
    collaborator_count = serializers.SerializerMethodField()
    collaborators = serializers.SerializerMethodField()
    storage_used_bytes = serializers.SerializerMethodField()

    @extend_schema_field(serializers.IntegerField())
    def get_storage_used_bytes(self, obj) -> int:
        return get_dataroom_storage_used_bytes(obj)

    class Meta:
        model = Dataroom
        fields = [
            'id', 'name', 'organization', 'created_at', 'updated_at', 'created_by',
            'owner', 'current_user_role', 'collaborator_count', 'collaborators',
            'storage_quota_mb', 'storage_used_bytes', 'storage_version',
            'show_file_index',
            'enable_qna',
            'branding_banner', 'banner_mode', 'banner_images',
            'brand_logo_override', 'logo_mode',
            'brand_primary_color', 'brand_secondary_color', 'brand_accent_color',
            'items'
        ]
        read_only_fields = fields

    @extend_schema_field(DataroomCollaboratorUserSerializer(allow_null=True))
    def get_owner(self, obj):
        if obj.created_by:
            return DataroomCollaboratorUserSerializer(obj.created_by).data
        return None

    @extend_schema_field(serializers.CharField())
    def get_current_user_role(self, obj) -> str:
        request = self.context.get('request')
        if not request or not hasattr(request, 'user') or not request.user or not request.user.is_authenticated:
            return 'none'
        user = request.user
        if obj.created_by_id == user.id:
            return 'owner'
        if getattr(user, 'role', '') == 'admin' and obj.organization_id == user.organization_id:
            return 'admin'
        if any(c.user_id == user.id for c in obj.collaborators.all()):
            return 'collaborator'
        return 'none'

    @extend_schema_field(serializers.IntegerField())
    def get_collaborator_count(self, obj) -> int:
        return len(obj.collaborators.all())

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_collaborators(self, obj):
        collaborators = obj.collaborators.select_related('user', 'invited_by').order_by('created_at')
        return DataroomCollaboratorSerializer(collaborators, many=True).data

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_branding_banner(self, obj) -> str:
        if not obj.branding_banner:
            return None
        return urljoin(settings.SITE_DOMAIN, obj.branding_banner.url)

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_brand_logo_override(self, obj) -> str:
        if not obj.brand_logo_override:
            return None
        return urljoin(settings.SITE_DOMAIN, obj.brand_logo_override.url)

    @extend_schema_field(DataroomBannerImageSerializer(many=True))
    def get_banner_images(self, obj):
        images = obj.banner_images.all().order_by('position', 'created_at')
        return DataroomBannerImageSerializer(images, many=True, context=self.context).data

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
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
            folders = obj.folders.all().select_related('created_by', 'dataroom', 'dataroom__created_by').order_by('created_at', 'id')
            documents = obj.documents.filter(document__deleted_at__isnull=True).select_related('document', 'document__created_by').annotate(
                dataroom_view_count=Count('dataroomvisit', distinct=True)
            ).order_by('created_at', 'id')
        else:
            folders = obj.folders.filter(parent__isnull=True).select_related('created_by', 'dataroom', 'dataroom__created_by').order_by('created_at', 'id')
            documents = obj.documents.filter(folder__isnull=True, document__deleted_at__isnull=True).select_related('document', 'document__created_by').annotate(
                dataroom_view_count=Count('dataroomvisit', distinct=True)
            ).order_by('created_at', 'id')
        folders_list = list(folders)
        documents_list = list(documents)

        folders_data = [
            DataroomFolderSerializer(folder, context=serializer_context).data
            for folder in folders_list
        ]
        documents_data = [
            DataroomDocumentSerializer(document, context=serializer_context).data
            for document in documents_list
        ]

        scope_rows = None
        if not use_full_content:
            scope_rows = list(
                DataroomItemOrder.objects.filter(dataroom=obj, parent_folder__isnull=True)
                .order_by("position", "created_at", "id")
            )

        return build_ordered_dataroom_items(scope_rows, folders_data, documents_data)


class AdminDataroomSerializer(DataroomSerializer):
    active_links_count = serializers.SerializerMethodField()
    last_viewed_at = serializers.SerializerMethodField()

    @extend_schema_field(serializers.IntegerField())
    def get_active_links_count(self, obj) -> int:
        if hasattr(obj, 'annotated_active_links_count'):
            return obj.annotated_active_links_count
        now = timezone.now()
        return obj.share_links.filter(
            is_active=True
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        ).count()

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_last_viewed_at(self, obj):
        if hasattr(obj, 'annotated_last_viewed_at'):
            return obj.annotated_last_viewed_at
        from sharelinks.models import ViewSession
        latest = ViewSession.objects.filter(share_link__dataroom=obj).order_by('-viewed_at').first()
        return latest.viewed_at if latest else None

    class Meta(DataroomSerializer.Meta):
        fields = DataroomSerializer.Meta.fields + ['active_links_count', 'last_viewed_at']
        read_only_fields = DataroomSerializer.Meta.read_only_fields + ['active_links_count', 'last_viewed_at']


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
            'parent', 'is_starred'
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
        fields = ['id', 'name', 'parent', 'allow_download', 'enable_watermark', 'updated_at', 'is_starred']

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
    file_size = serializers.IntegerField(min_value=1)
    destination_folder_id = serializers.PrimaryKeyRelatedField(
        queryset=DataroomFolder.objects.all(), required=False, allow_null=True, default=None
    )
    path = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    def validate_path(self, value):
        return validate_safe_relative_path(value)


class DataroomUploadFinalizeSerializer(serializers.Serializer):
    storage_key = serializers.CharField()
    unique_name = serializers.CharField()
    content_type = serializers.CharField(allow_blank=True)
    destination_folder_id = serializers.PrimaryKeyRelatedField(
        queryset=DataroomFolder.objects.all(), required=False, allow_null=True, default=None
    )
    path = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    def validate_path(self, value):
        return validate_safe_relative_path(value)

