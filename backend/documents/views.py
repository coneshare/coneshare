import os
from pathlib import Path

from django.core.files.storage import default_storage
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from ulid import ULID

from .models import Document, Folder, ShareLink, ShareLinkPreset, View, Viewer
from .serializers import (
    DocumentSerializer,
    FolderSerializer,
    ShareLinkPresetSerializer,
    ShareLinkSerializer,
    ViewerSerializer,
    ViewSerializer,
)


def _get_or_create_folders_from_path(organization, folder_path: str) -> Folder:
    """
    Recursively finds or creates folders based on a path string.
    Returns the final (deepest) Folder instance.
    """
    parent = None
    path = Path(folder_path)
    for part in path.parts:
        folder, _ = Folder.objects.get_or_create(
            organization=organization,
            name=part,
            parent=parent
        )
        parent = folder
    return parent


class DocumentUploadView(APIView):
    """
    A dedicated view for handling file uploads and creating Document records.
    """
    parser_classes = (MultiPartParser,)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {"detail": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Handle folder structure from path
        relative_path = request.POST.get('path')
        parent_folder = None
        file_name = file_obj.name

        if relative_path:
            folder_path, file_name_from_path = os.path.split(relative_path)
            if folder_path:
                parent_folder = _get_or_create_folders_from_path(
                    request.user.organization, folder_path
                )
            if file_name_from_path:
                file_name = file_name_from_path

        # Generate a unique path for the file to prevent collisions
        organization_id = request.user.organization.id
        file_extension = os.path.splitext(file_obj.name)[1]
        file_id = str(ULID())
        file_path = f"documents/{organization_id}/{file_id}{file_extension}"

        # Save the file to the configured storage backend (fs or minio)
        try:
            storage_key = default_storage.save(file_path, file_obj)
        except Exception as e:
            # Log the exception e in a real-world scenario
            return Response(
                {"detail": f"Failed to save file to storage: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Create the Document database record
        document = Document.objects.create(
            organization=request.user.organization,
            created_by=request.user,
            name=file_name,
            folder=parent_folder,
            storage_key=storage_key,
            original_storage_key=storage_key,  # Same for initial upload
            content_type=file_obj.content_type,
            status='ready',  # Simplified: set to ready after upload
            type=file_extension.lstrip('.').lower()
        )

        serializer = DocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Folder.objects.filter(organization=self.request.user.organization)


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Document.objects.filter(organization=self.request.user.organization)


class ShareLinkPresetViewSet(viewsets.ModelViewSet):
    queryset = ShareLinkPreset.objects.all()
    serializer_class = ShareLinkPresetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ShareLinkPreset.objects.filter(organization=self.request.user.organization)


class ShareLinkViewSet(viewsets.ModelViewSet):
    queryset = ShareLink.objects.all()
    serializer_class = ShareLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ShareLink.objects.filter(document__organization=self.request.user.organization)


class ViewerViewSet(viewsets.ModelViewSet):
    queryset = Viewer.objects.all()
    serializer_class = ViewerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Viewer.objects.filter(organization=self.request.user.organization)


class ViewViewSet(viewsets.ModelViewSet):
    queryset = View.objects.all()
    serializer_class = ViewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return View.objects.filter(share_link__document__organization=self.request.user.organization)
