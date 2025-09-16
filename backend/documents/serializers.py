from rest_framework import serializers
from core.models import Organization
from .models import Document, DocumentPage, DocumentVersion, Folder, ShareLink, ShareLinkPreset, View, Viewer


class FolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folder
        fields = ['id', 'name', 'parent', 'organization', 'created_at', 'updated_at']
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']

    def create(self, validated_data):
        # Automatically assign the default organization
        validated_data['organization'] = Organization.objects.first()
        return super().create(validated_data)


class DocumentSerializer(serializers.ModelSerializer):
    versions = DocumentVersionSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'organization', 'folder', 'name', 'description', 'status',
            'storage_key', 'original_storage_key', 'type', 'content_type',
            'num_pages', 'download_only', 'assistant_enabled', 'created_by',
            'created_at', 'updated_at', 'versions'
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


class ShareLinkPresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareLinkPreset
        fields = [
            'id', 'organization', 'name', 'is_default', 'expires_in_days',
            'requires_password', 'requires_email_verification', 'allow_download',
            'enable_watermark', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at']

    def create(self, validated_data):
        request = self.context['request']
        # Automatically assign the user's organization
        validated_data['organization'] = request.user.organization
        return super().create(validated_data)


class ShareLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareLink
        fields = [
            'id', 'document', 'created_by', 'name', 'slug', 'expires_at',
            'password_hash', 'requires_email_verification', 'allow_download',
            'enable_watermark', 'is_archived', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_by', 'slug', 'created_at', 'updated_at'
        ]
        # TODO: Slug should be auto-generated on creation

    def create(self, validated_data):
        request = self.context['request']
        # Automatically assign the creator
        validated_data['created_by'] = request.user
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


class ViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = View
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'duration_seconds',
            'completion_rate', 'viewed_at'
        ]
        read_only_fields = ['id', 'viewed_at']

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
