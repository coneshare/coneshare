import os
from pathlib import Path

from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Document, Folder, ShareLink, ShareLinkPreset, View, Viewer
from .serializers import (
    DocumentSerializer,
    FolderSerializer,
    ShareLinkPresetSerializer,
    ShareLinkSerializer,
    ViewerSerializer,
    ViewSerializer,
)
from .services import (
    create_document_from_upload,
    create_new_document_version,
    delete_document_and_files,
)


def _get_or_create_folders_from_path(requesting_user, folder_path: str) -> Folder:
    """
    Recursively finds or creates folders based on a path string.
    Returns the final (deepest) Folder instance.
    """
    parent = None
    path = Path(folder_path)
    for part in path.parts:
        folder, _ = Folder.objects.get_or_create(
            organization=requesting_user.organization,
            name=part,
            parent=parent,
            defaults={'created_by': requesting_user}
        )
        parent = folder
    return parent


class DocumentUploadView(APIView):
    """
    A dedicated view for handling file uploads and creating Document records.
    """
    parser_classes = (MultiPartParser,)
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {"detail": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Handle folder creation and filename override from path
        relative_path = request.POST.get('path')
        parent_folder = None

        if relative_path:
            folder_path, file_name_from_path = os.path.split(relative_path)
            if folder_path:
                parent_folder = _get_or_create_folders_from_path(
                    request.user, folder_path
                )
            if file_name_from_path:
                # Override the uploaded file's name if a name is provided in path
                file_obj.name = file_name_from_path

        try:
            document = create_document_from_upload(
                requesting_user=request.user,
                uploaded_file=file_obj,
                folder=parent_folder
            )
        except Exception as e:
            # In a real app, log this exception
            return Response(
                {"detail": f"Failed to start document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        serializer = DocumentSerializer(document, context={'request': request})
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class DocumentVersionUploadView(APIView):
    """
    A dedicated view for uploading a new version of an existing document.
    """
    parser_classes = (MultiPartParser,)
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, document_id, *args, **kwargs):
        # 1. Authorize the user
        try:
            document = Document.objects.get(
                id=document_id,
                organization=request.user.organization
            )
        except Document.DoesNotExist:
            return Response(
                {"detail": "Access denied or document not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        uploaded_file = request.data.get('file')
        if not uploaded_file:
            return Response(
                {"detail": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Delegate to the service layer
        try:
            create_new_document_version(
                document=document,
                uploaded_file=uploaded_file,
                requesting_user=request.user
            )
        except Exception as e:
            # In a real app, log this exception
            return Response(
                {"detail": f"Failed to start document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        serializer = DocumentSerializer(document, context={'request': request})
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


class DocumentPreviewDataView(APIView):
    """
    Provides data for rendering an internal document preview.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, document_id, *args, **kwargs):
        # Authentication & Authorization is handled by DRF + this query
        try:
            document = Document.objects.get(
                id=document_id,
                organization=request.user.organization
            )
        except Document.DoesNotExist:
            return Response(
                {"detail": "Access denied or document not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Handle documents that are not ready for preview
        if document.status == 'processing':
            return Response(
                {"detail": "Document is still processing. Please wait and try again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        elif document.status != 'ready':
             return Response(
                {"detail": "Document is not ready for preview."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Data Fetching
        primary_version = document.versions.filter(is_primary=True).first()
        if not primary_version:
            return Response(
                {"detail": "Document version not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Content Processing and Response Shaping
        pages_data = []
        if primary_version.has_pages:
            pages = primary_version.pages.order_by('page_number')
            for page in pages:
                pages_data.append({
                    "page_number": page.page_number,
                    "url": default_storage.url(page.storage_key),
                    "metadata": page.metadata,
                })

        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "numPages": primary_version.num_pages,
            "pages": pages_data,
        }

        return Response(response_data, status=status.HTTP_200_OK)


class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Folder.objects.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            organization=self.request.user.organization
        )


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Document.objects.filter(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        delete_document_and_files(document)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        return ShareLink.objects.filter(created_by=self.request.user)


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


class ShareLinkViewDataView(APIView):
    """
    Provides the data needed for a public viewer to render a document from a share link.
    This view includes all necessary security checks.
    """
    # No permission_classes, as this is a public endpoint with internal checks.

    def get(self, request, slug, *args, **kwargs):
        try:
            link = ShareLink.objects.get(slug=slug, is_archived=False)
        except ShareLink.DoesNotExist:
            return Response({"message": "Link not found or has been archived."}, status=status.HTTP_404_NOT_FOUND)

        # --- SERVER-SIDE ACCESS CONTROL ---
        # 1. Check for expiration
        if link.expires_at and link.expires_at < timezone.now():
            return Response({"message": "This link has expired."}, status=status.HTTP_410_GONE)

        # 2. Check for password protection (placeholder for now)
        if link.password_hash:
            # In a real implementation, we would check for a valid session token
            # that proves the user has already entered the password.
            # For now, we will deny access if a password is set.
            # is_viewer_authorized(request, link) # Placeholder for future logic
            return Response(
                {"message": "Password required", "protectionType": "password"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # If all checks pass, proceed to fetch and return data.
        document = link.document
        primary_version = document.versions.filter(is_primary=True).first()

        if not primary_version or document.status != 'ready':
            return Response(
                {"message": "Document is not yet ready for viewing."},
                status=status.HTTP_400_BAD_REQUEST
            )

        pages_data = []
        if primary_version.has_pages:
            # Note: In a production system, a service would generate pre-signed URLs.
            # Here, we mirror DocumentPreviewDataView but use the key directly for simplicity.
            pages = primary_version.pages.order_by('page_number')
            for page in pages:
                pages_data.append({
                    "page_number": page.page_number,
                    "url": default_storage.url(page.storage_key),
                    "metadata": page.metadata,
                })

        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "numPages": primary_version.num_pages,
            "pages": pages_data,
            "linkSettings": {
                "allowDownload": link.allow_download,
                "enableWatermark": link.enable_watermark,
            }
        }
        return Response(response_data, status=status.HTTP_200_OK)
