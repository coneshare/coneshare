from rest_framework import serializers
from .models import Dataroom, DataroomDocument, DataroomFolder


class DataroomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dataroom
        fields = ['id', 'name', 'organization', 'created_at', 'updated_at', 'created_by']
        read_only_fields = ['id', 'organization', 'created_at', 'updated_at', 'created_by']


class DataroomFolderSerializer(serializers.ModelSerializer):
    ancestors = serializers.SerializerMethodField()

    class Meta:
        model = DataroomFolder
        fields = ['id', 'name', 'dataroom', 'parent', 'created_at', 'updated_at', 'ancestors']
        read_only_fields = ['id', 'created_at', 'updated_at', 'ancestors']

    def get_ancestors(self, obj):
        """
        Returns a list of ancestor folders, from the root down to the
        immediate parent.
        """
        ancestors = []
        parent = obj.parent
        while parent:
            ancestors.append({'id': parent.id, 'name': parent.name})
            parent = parent.parent
        return list(reversed(ancestors))


class DataroomDocumentSerializer(serializers.ModelSerializer):
    document_name = serializers.CharField(source='document.name', read_only=True)
    document_type = serializers.CharField(source='document.type', read_only=True)
    document_id = serializers.CharField(source='document.id', read_only=True)
    file_size = serializers.IntegerField(source='document.file_size', read_only=True)
    updated_at = serializers.DateTimeField(source='document.updated_at', read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(source='document.created_by', read_only=True)

    class Meta:
        model = DataroomDocument
        fields = [
            'id', 'document_id', 'document_name', 'document_type', 'created_at',
            'file_size', 'updated_at', 'created_by'
        ]


class DataroomDetailSerializer(serializers.ModelSerializer):
    folders = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()

    class Meta:
        model = Dataroom
        fields = ['id', 'name', 'organization', 'created_at', 'updated_at', 'created_by', 'folders', 'documents']
        read_only_fields = fields

    def get_folders(self, obj):
        # Only list folders at the root of the dataroom
        root_folders = obj.folders.filter(parent__isnull=True)
        return DataroomFolderSerializer(root_folders, many=True, context=self.context).data

    def get_documents(self, obj):
        # Only list documents at the root of the dataroom
        root_documents = obj.documents.filter(folder__isnull=True).select_related('document', 'document__created_by')
        return DataroomDocumentSerializer(root_documents, many=True, context=self.context).data


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
