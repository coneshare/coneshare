from rest_framework import serializers

from documents.models import Folder
from .models import FileRequest


class FileRequestSerializer(serializers.ModelSerializer):
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(),
        write_only=True
    )

    class Meta:
        model = FileRequest
        fields = [
            'id', 'name', 'folder', 'folder_name', 'slug', 'is_active',
            'expires_at', 'max_file_size', 'allowed_file_types',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at']

    def validate_folder(self, value):
        """
        Check that the folder belongs to the user making the request.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("Request context is missing.")

        if value.created_by != request.user:
            raise serializers.ValidationError("You can only create file requests for your own folders.")
        return value


class PublicFileRequestSerializer(serializers.ModelSerializer):
    """
    Serializer for exposing public-facing details of a file request.
    """
    class Meta:
        model = FileRequest
        fields = [
            'name', 'max_file_size', 'allowed_file_types'
        ]


class FileRequestUploadFinalizeSerializer(serializers.Serializer):
    """
    Serializer for finalizing an upload made via a file request.
    """
    storage_key = serializers.CharField()
    unique_name = serializers.CharField()
    file_size = serializers.IntegerField()
    content_type = serializers.CharField(allow_blank=True)
    uploader_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    uploader_email = serializers.EmailField(required=False, allow_blank=True)
