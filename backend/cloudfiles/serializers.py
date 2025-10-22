from rest_framework import serializers

from .models import CloudConnection


class CloudConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CloudConnection
        fields = ['id', 'provider', 'email', 'created_at']
        read_only_fields = fields


class CloudImportSerializer(serializers.Serializer):
    file_id = serializers.CharField(max_length=1024)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField()


class DropboxCallbackSerializer(serializers.Serializer):
    """
    Validates the data sent from the frontend after Dropbox OAuth redirect.
    """
    code = serializers.CharField()
    state = serializers.CharField()
