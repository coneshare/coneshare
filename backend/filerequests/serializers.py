from rest_framework import serializers

from documents.models import Folder
from .models import FileRequest, UploadedFile


class UploadedFileSerializer(serializers.ModelSerializer):
    document_name = serializers.CharField(source='document.name', read_only=True)
    document_id = serializers.CharField(source='document.id', read_only=True)
    folder_name = serializers.CharField(source='document.folder.name', read_only=True)
    folder_id = serializers.CharField(source='document.folder.id', read_only=True)

    class Meta:
        model = UploadedFile
        fields = ['id', 'document_id', 'document_name', 'folder_id', 'folder_name', 'uploader_name', 'uploader_email', 'created_at']


class FileRequestSerializer(serializers.ModelSerializer):
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    uploaded_files_count = serializers.IntegerField(read_only=True)
    folder = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(),
    )

    class Meta:
        model = FileRequest
        fields = [
            'id', 'name', 'folder', 'folder_name', 'slug', 'is_active',
            'expires_at', 'max_file_size', 'allowed_file_types', 'uploaded_files_count',
            'created_at', 'updated_at', 'message'
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at', 'uploaded_files_count']

    def validate_folder(self, value):
        """
        Check that the folder belongs to the user making the request.
        The invisible __root__ folder (created_by=None) is allowed.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("Request context is missing.")

        if value.created_by is not None and value.created_by != request.user:
            raise serializers.ValidationError("You can only create file requests for your own folders.")
        return value


class FileRequestDetailSerializer(FileRequestSerializer):
    uploaded_files = UploadedFileSerializer(many=True, read_only=True)

    class Meta(FileRequestSerializer.Meta):
        fields = list(FileRequestSerializer.Meta.fields) + ['uploaded_files']


class PublicFileRequestSerializer(serializers.ModelSerializer):
    """
    Serializer for exposing public-facing details of a file request.
    """
    class Meta:
        model = FileRequest
        fields = [
            'name', 'max_file_size', 'allowed_file_types', 'message'
        ]


class FileRequestUploadFinalizeSerializer(serializers.Serializer):
    """
    Serializer for finalizing an upload made via a file request.
    """
    storage_key = serializers.CharField()
    unique_name = serializers.CharField()
    file_size = serializers.IntegerField()
    content_type = serializers.CharField(allow_blank=True)
    uploader_name = serializers.CharField(required=True, allow_blank=False, max_length=255)
    uploader_email = serializers.EmailField(required=True, allow_blank=False)
