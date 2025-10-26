from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets, serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from documents.models import Document, Folder

from .models import Dataroom, DataroomDocument, DataroomFolder
from .serializers import (AddContentSerializer, DataroomDetailSerializer,
                          DataroomFolderSerializer, DataroomSerializer,
                          RemoveContentSerializer)


class DataroomViewSet(viewsets.ModelViewSet):
    queryset = Dataroom.objects.all()
    serializer_class = DataroomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DataroomDetailSerializer
        return DataroomSerializer

    def get_queryset(self):
        """
        This queryset ensures that users can only access datarooms
        within their organization.
        """
        return self.queryset.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        """
        Automatically assign the organization and creator from the request user.
        """
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    def _replicate_folder_structure(self, dataroom, source_folder, parent_dataroom_folder):
        """
        Recursively replicates a source folder structure and its documents
        into a dataroom.
        """
        # Create a new DataroomFolder for the source folder.
        new_dataroom_folder = DataroomFolder.objects.create(
            dataroom=dataroom,
            name=source_folder.name,
            parent=parent_dataroom_folder
        )

        # Add documents from the source folder to the new dataroom folder.
        # If a document is already in the dataroom, its folder will be updated.
        for doc in source_folder.documents.all():
            DataroomDocument.objects.update_or_create(
                dataroom=dataroom,
                document=doc,
                defaults={'folder': new_dataroom_folder}
            )

        # Recurse for subfolders.
        for subfolder in source_folder.children.all():
            self._replicate_folder_structure(dataroom, subfolder, new_dataroom_folder)

    @action(detail=True, methods=['post'], url_path='add-content')
    def add_content(self, request, pk=None):
        dataroom = self.get_object()
        serializer = AddContentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        doc_ids = data.get('document_ids', [])
        folder_ids = data.get('folder_ids', [])
        dest_folder_id = data.get('destination_folder_id')

        destination_folder = None
        if dest_folder_id:
            destination_folder = get_object_or_404(DataroomFolder, id=dest_folder_id, dataroom=dataroom)

        try:
            with transaction.atomic():
                # Add individual documents.
                docs_to_add = Document.objects.filter(id__in=doc_ids, organization=request.user.organization)
                for doc in docs_to_add:
                    DataroomDocument.objects.update_or_create(
                        dataroom=dataroom,
                        document=doc,
                        defaults={'folder': destination_folder}
                    )

                # Add folders and their contents recursively.
                folders_to_add = Folder.objects.filter(id__in=folder_ids, organization=request.user.organization)
                for folder in folders_to_add:
                    self._replicate_folder_structure(dataroom, folder, destination_folder)

            return Response({"detail": "Content added successfully."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='remove-content')
    def remove_content(self, request, pk=None):
        dataroom = self.get_object()
        serializer = RemoveContentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        dataroom_doc_ids = data.get('dataroom_document_ids', [])
        dataroom_folder_ids = data.get('dataroom_folder_ids', [])

        with transaction.atomic():
            DataroomDocument.objects.filter(id__in=dataroom_doc_ids, dataroom=dataroom).delete()
            # Deleting a folder will cascade and delete its children and document references.
            DataroomFolder.objects.filter(id__in=dataroom_folder_ids, dataroom=dataroom).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class DataroomFolderViewSet(viewsets.ModelViewSet):
    queryset = DataroomFolder.objects.all()
    serializer_class = DataroomFolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This queryset ensures that users can only access dataroom folders
        within their organization. It also allows filtering by a specific dataroom.
        """
        queryset = self.queryset.filter(dataroom__organization=self.request.user.organization)
        dataroom_id = self.request.query_params.get('dataroom_id')
        if dataroom_id:
            queryset = queryset.filter(dataroom_id=dataroom_id)
        return queryset

    def perform_create(self, serializer):
        """
        Automatically assign the dataroom from the request data, after
        verifying the user has permission to access it.
        """
        dataroom = serializer.validated_data.get('dataroom')
        if not dataroom:
            raise serializers.ValidationError({'dataroom': 'This field is required.'})

        if dataroom.organization != self.request.user.organization:
            raise PermissionDenied("You do not have permission to add folders to this dataroom.")

        serializer.save()
