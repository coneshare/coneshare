import logging

from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView

from documents.fileserver import fileserver_client
from documents.services import (
    QuotaExceededError,
    check_user_quota_on_upload,
    create_document_from_upload,
    _get_unique_document_name,
    generate_storage_key,
)
from .models import FileRequest, UploadedFile
from .serializers import (
    FileRequestSerializer,
    FileRequestDetailSerializer,
    PublicFileRequestSerializer,
    FileRequestUploadFinalizeSerializer,
)

logger = logging.getLogger(__name__)


class FileRequestViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing File Requests.
    """
    serializer_class = FileRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return FileRequestDetailSerializer
        return FileRequestSerializer

    def get_queryset(self):
        """
        This view should return a list of all the file requests
        for the currently authenticated user.
        """
        queryset = FileRequest.objects.filter(
            created_by=self.request.user
        ).select_related('folder').annotate(
            uploaded_files_count=Count('uploaded_files')
        )
        if self.action == 'retrieve':
            queryset = queryset.prefetch_related('uploaded_files', 'uploaded_files__document')
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class PublicFileRequestView(APIView):
    """
    Provides public details about a file request link.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug, *args, **kwargs):
        try:
            file_request = FileRequest.objects.get(slug=slug, is_active=True)
        except FileRequest.DoesNotExist:
            return Response({"detail": "File request not found or has been disabled."}, status=status.HTTP_404_NOT_FOUND)

        if file_request.expires_at and file_request.expires_at < timezone.now():
            return Response({"detail": "This file request has expired."}, status=status.HTTP_410_GONE)

        serializer = PublicFileRequestSerializer(file_request)
        return Response(serializer.data, status=status.HTTP_200_OK)


class FileRequestUploadRequestView(APIView):
    """
    Handles the first step of a public upload: requesting a pre-signed URL.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, slug, *args, **kwargs):
        try:
            file_request = FileRequest.objects.get(slug=slug, is_active=True)
        except FileRequest.DoesNotExist:
            return Response({"detail": "File request not found or has been disabled."}, status=status.HTTP_404_NOT_FOUND)

        if file_request.expires_at and file_request.expires_at < timezone.now():
            return Response({"detail": "This file request has expired."}, status=status.HTTP_410_GONE)

        file_name = request.data.get('file_name')
        file_size = request.data.get('file_size')

        if not file_name or file_size is None:
            return Response({"detail": "file_name and file_size are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            file_size = int(file_size)
        except (ValueError, TypeError):
            return Response({"detail": "file_size must be a valid integer."}, status=status.HTTP_400_BAD_REQUEST)


        # Validate against link constraints
        if file_request.max_file_size and file_size > file_request.max_file_size:
            return Response({"detail": "File size exceeds the maximum allowed for this link."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate against owner's quota
        try:
            check_user_quota_on_upload(user=file_request.created_by, new_file_size=file_size)
        except QuotaExceededError as e:
            # We return a generic error to avoid leaking information.
            return Response({'detail': "Upload failed due to a server-side storage limit."}, status=status.HTTP_400_BAD_REQUEST)

        unique_name = _get_unique_document_name(
            requesting_user=file_request.created_by,
            folder=file_request.folder,
            original_name=file_name
        )
        storage_key = generate_storage_key(file_request.created_by.organization.id, unique_name)

        try:
            upload_url = fileserver_client.generate_upload_url(storage_key, is_internal=False)
        except APIException as e:
            logger.error(f"Failed to get upload URL from file server for file request {slug}: {e}")
            return Response({"detail": str(e.detail)}, status=e.status_code)

        return Response({
            'upload_url': upload_url,
            'storage_key': storage_key,
            'unique_name': unique_name,
        }, status=status.HTTP_200_OK)


class FileRequestUploadFinalizeView(APIView):
    """
    Finalizes a document upload made via a file request link.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, slug, *args, **kwargs):
        try:
            file_request = FileRequest.objects.get(slug=slug, is_active=True)
        except FileRequest.DoesNotExist:
            return Response({"detail": "File request not found or has been disabled."}, status=status.HTTP_404_NOT_FOUND)

        if file_request.expires_at and file_request.expires_at < timezone.now():
            return Response({"detail": "This file request has expired."}, status=status.HTTP_410_GONE)

        serializer = FileRequestUploadFinalizeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        validated_data = serializer.validated_data

        try:
            document = create_document_from_upload(
                requesting_user=file_request.created_by,
                folder=file_request.folder,
                storage_key=validated_data['storage_key'],
                unique_name=validated_data['unique_name'],
                file_size=validated_data['file_size'],
                content_type=validated_data['content_type'],
            )
            # Create the link record
            UploadedFile.objects.create(
                file_request=file_request,
                document=document,
                uploader_name=validated_data['uploader_name'],
                uploader_email=validated_data['uploader_email']
            )
        except Exception as e:
            logger.error(f"Failed to finalize document upload for file request {slug}: {e}")
            return Response(
                {"detail": f"Failed to finalize document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"detail": "Upload successful."}, status=status.HTTP_202_ACCEPTED)
