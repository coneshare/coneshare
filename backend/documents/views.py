import logging
import os
import secrets
from datetime import timedelta
from pathlib import Path
from urllib.parse import urljoin

from django.conf import settings
from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Document, Folder, ShareLink, ShareLinkPreset, View, Viewer, PreviewSession
from .serializers import (
    DocumentSerializer,
    FolderFromPathSerializer,
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


logger = logging.getLogger(__name__)


def _get_folder_from_path(organization, folder_path: str) -> Folder | None:
    """
    Finds a folder based on a path string, starting from the organization's
    invisible root folder. Returns the final Folder instance or None if not found.
    """
    try:
        parent = Folder.objects.get(
            organization=organization, name='__root__', parent=None
        )
    except Folder.DoesNotExist:
        logger.error(f"Invisible root folder not found for organization {organization.id}")
        return None

    path = Path(folder_path)
    target_folder = parent
    for part in path.parts:
        try:
            target_folder = Folder.objects.get(
                organization=organization,
                name=part,
                parent=parent
            )
            parent = target_folder
        except Folder.DoesNotExist:
            return None
    return target_folder


def _get_or_create_folders_from_path(requesting_user, folder_path: str) -> Folder:
    """
    Recursively finds or creates folders from a path string, starting from the
    organization's invisible root folder. Returns the final Folder instance.
    """
    try:
        parent = Folder.objects.get(
            organization=requesting_user.organization, name='__root__', parent=None
        )
    except Folder.DoesNotExist:
        logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
        # This is a critical failure, as the root folder should always exist.
        # We will let this fail hard, which will result in a 500 error.
        raise

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
                parent_folder = _get_folder_from_path(
                    request.user.organization, folder_path
                )
                if parent_folder is None:
                    return Response(
                        {"detail": f"Folder path '{folder_path}' does not exist. Please ensure path is created first."},
                        status=status.HTTP_400_BAD_REQUEST
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


class FolderFromPathView(APIView):
    """
    A view to ensure a folder path exists, creating it if necessary.
    This is designed to be called once before a batch of uploads to a new folder.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = FolderFromPathSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        folder_path = serializer.validated_data['path']
        requesting_user = request.user

        # --- Permission Check ---
        try:
            parent = Folder.objects.get(
                organization=requesting_user.organization, name='__root__', parent=None
            )
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for user {requesting_user.id}'s organization")
            return Response(
                {"detail": "An unexpected error occurred: root folder missing."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        path = Path(folder_path)
        for part in path.parts:
            try:
                folder = Folder.objects.get(
                    organization=requesting_user.organization,
                    name=part,
                    parent=parent
                )
                if folder.created_by != requesting_user:
                    return Response(
                        {"detail": f"You do not have permission to access or create subfolders in '{part}'."},
                        status=status.HTTP_403_FORBIDDEN
                    )
                parent = folder
            except Folder.DoesNotExist:
                # This part of the path doesn't exist, so we can stop checking.
                # The rest of the path will be created.
                break

        try:
            folder = _get_or_create_folders_from_path(
                requesting_user=requesting_user,
                folder_path=folder_path
            )
            folder_serializer = FolderSerializer(folder, context={'request': request})
            return Response(folder_serializer.data, status=status.HTTP_201_CREATED)
        except Exception:
            logger.exception("Failed to ensure folder path exists for path: %s", folder_path)
            return Response(
                {"detail": "An unexpected error occurred while creating the folder structure."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


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
                organization=request.user.organization,
                created_by=request.user
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
                organization=request.user.organization,
                created_by=request.user
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
                page_url = default_storage.url(page.storage_key)
                pages_data.append({
                    "page_number": page.page_number,
                    "url": urljoin(settings.SITE_DOMAIN, page_url),
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

    def _get_root_folder(self):
        """Helper to get the organization's invisible root folder."""
        try:
            return Folder.objects.get(
                organization=self.request.user.organization,
                name='__root__',
                parent=None
            )
        except Folder.DoesNotExist:
            logger.error(f"Invisible root folder not found for organization {self.request.user.organization.id}")
            raise APIException("An unexpected error occurred: root folder missing.",
                               code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_folder_contents(self, folder, request):
        """Helper to fetch and serialize sub-folders and documents for a given folder."""
        sub_folders = folder.children.filter(created_by=request.user)
        documents = folder.documents.filter(created_by=request.user).prefetch_related(
            'versions', 'share_links', 'share_links__views'
        )

        sub_folders_serializer = self.get_serializer(sub_folders, many=True)
        documents_serializer = DocumentSerializer(documents, many=True, context={'request': request})

        return {
            'sub_folders': sub_folders_serializer.data,
            'documents': documents_serializer.data,
        }

    def list(self, request, *args, **kwargs):
        """
        Returns the contents of the user's root folder, including its
        subfolders and documents.
        """
        root_folder = self._get_root_folder()
        contents = self._get_folder_contents(root_folder, request)
        return Response({
            'current_folder': None,
            **contents,
        })

    def retrieve(self, request, *args, **kwargs):
        """
        Returns the contents of a specific folder, including its subfolders and documents.
        """
        instance = self.get_object()
        contents = self._get_folder_contents(instance, request)
        current_folder_serializer = self.get_serializer(instance)
        return Response({
            'current_folder': current_folder_serializer.data,
            **contents,
        })

    def get_queryset(self):
        """
        This queryset is used by get_object() to ensure users can only
        access folders they have created within their organization.
        """
        return self.queryset.filter(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    def perform_create(self, serializer):
        parent = serializer.validated_data.get('parent')
        if not parent:
            parent = self._get_root_folder()
        serializer.save(
            created_by=self.request.user,
            organization=self.request.user.organization,
            parent=parent
        )


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.all()
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This view should return a list of documents for the currently
        authenticated user, optionally filtered by a parent folder.
        """
        organization = self.request.user.organization
        folder_id = self.request.query_params.get('folder')

        if folder_id:
            # Ensure the requested folder belongs to the user's org for security
            target_folder = get_object_or_404(Folder, id=folder_id, organization=organization)
        else:
            # Default to listing documents in the root folder
            target_folder = get_object_or_404(Folder, organization=organization, name='__root__', parent=None)

        return self.queryset.filter(
            organization=organization,
            created_by=self.request.user,
            folder=target_folder
        ).prefetch_related('versions', 'share_links', 'share_links__views')

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

    @action(detail=True, methods=['post'], url_path='preview')
    def create_preview_session(self, request, pk=None):
        """
        Creates a short-lived, single-use preview session for the share link owner.
        """
        share_link = self.get_object()  # This correctly uses the scoped get_queryset

        # Clean up any old, expired sessions for this link to prevent clutter
        share_link.preview_sessions.filter(expires_at__lt=timezone.now()).delete()

        session = share_link.preview_sessions.create(
            user=request.user,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(minutes=5)
        )
        return Response({'previewToken': session.token}, status=status.HTTP_201_CREATED)


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
        is_preview = False
        preview_token = request.query_params.get('previewToken')

        if preview_token:
            try:
                session = PreviewSession.objects.select_related('user', 'share_link__document__organization').get(token=preview_token)
                if not session.is_expired() and session.share_link.slug == slug:
                    # Security check: Ensure the user who created the preview session
                    # belongs to the same organization that owns the document.
                    if session.user.organization_id == session.share_link.document.organization_id:
                        is_preview = True
                        session.delete()  # Invalidate token after use
            except PreviewSession.DoesNotExist:
                # Token is invalid, proceed with normal access checks.
                pass

        try:
            link = ShareLink.objects.get(slug=slug, is_archived=False)
        except ShareLink.DoesNotExist:
            return Response({"message": "Link not found or has been archived."}, status=status.HTTP_404_NOT_FOUND)

        # --- SERVER-SIDE ACCESS CONTROL ---
        # 1. Check for expiration
        if not is_preview and link.expires_at and link.expires_at < timezone.now():
            return Response({"message": "This link has expired."}, status=status.HTTP_410_GONE)

        # 2. Check for password protection (placeholder for now)
        if not is_preview and link.password_hash:
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
                page_url = default_storage.url(page.storage_key)
                pages_data.append({
                    "page_number": page.page_number,
                    "url": urljoin(settings.SITE_DOMAIN, page_url),
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
