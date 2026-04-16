import logging

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers
from drf_spectacular.utils import extend_schema

from documents.fileserver import fileserver_client
from documents.views import StandardResultsSetPagination
from documents.services import (
    QuotaExceededError,
    check_user_quota_on_upload,
    create_document_from_upload,
    _get_unique_document_name,
    generate_storage_key,
)
from automations.tasks import dispatch_automation_event_task
from .models import FileRequest, UploadedFile
from .serializers import (
    FileRequestSerializer,
    FileRequestDetailSerializer,
    PublicFileRequestSerializer,
    FileRequestUploadFinalizeSerializer,
)

logger = logging.getLogger(__name__)


@extend_schema(tags=['filerequests'])
class FileRequestViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing File Requests.
    """
    serializer_class = FileRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

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
        ).order_by('-created_at')
        if self.action == 'retrieve':
            queryset = queryset.prefetch_related('uploaded_files', 'uploaded_files__document__folder')
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['filerequests'])
class PublicFileRequestView(APIView):
    """
    Provides public details about a file request link.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        responses={200: PublicFileRequestSerializer, 400: dict, 404: dict},
    )
    def get(self, request, slug, *args, **kwargs):
        try:
            file_request = FileRequest.objects.select_related('created_by').get(slug=slug, is_active=True)
        except FileRequest.DoesNotExist:
            return Response({"detail": "File request not found or has been disabled."}, status=status.HTTP_404_NOT_FOUND)

        if file_request.expires_at and file_request.expires_at < timezone.now():
            return Response({"detail": "This file request has expired."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PublicFileRequestSerializer(file_request)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=['filerequests'])
class FileRequestUploadRequestView(APIView):
    """
    Handles the first step of a public upload: requesting a pre-signed URL.
    """
    permission_classes = [permissions.AllowAny]

    class RequestSerializer(serializers.Serializer):
        file_name = serializers.CharField()
        file_size = serializers.IntegerField()

    class ResponseSerializer(serializers.Serializer):
        upload_url = serializers.CharField()
        storage_key = serializers.CharField()
        unique_name = serializers.CharField()

    @extend_schema(
        request=RequestSerializer,
        responses={200: ResponseSerializer, 400: dict, 404: dict},
    )
    def post(self, request, slug, *args, **kwargs):
        try:
            file_request = FileRequest.objects.get(slug=slug, is_active=True)
        except FileRequest.DoesNotExist:
            return Response({"detail": "File request not found or has been disabled."}, status=status.HTTP_404_NOT_FOUND)

        if file_request.expires_at and file_request.expires_at < timezone.now():
            return Response({"detail": "This file request has expired."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.RequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        file_name = serializer.validated_data['file_name']
        file_size = serializer.validated_data['file_size']

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


@extend_schema(tags=['filerequests'])
class FileRequestUploadFinalizeView(APIView):
    """
    Finalizes a document upload made via a file request link.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        request=FileRequestUploadFinalizeSerializer,
        responses={202: dict, 400: dict, 404: dict, 500: dict},
    )
    def post(self, request, slug, *args, **kwargs):
        try:
            file_request = FileRequest.objects.get(slug=slug, is_active=True)
        except FileRequest.DoesNotExist:
            return Response({"detail": "File request not found or has been disabled."}, status=status.HTTP_404_NOT_FOUND)

        if file_request.expires_at and file_request.expires_at < timezone.now():
            return Response({"detail": "This file request has expired."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = FileRequestUploadFinalizeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        validated_data = serializer.validated_data

        try:
            with transaction.atomic():
                document = create_document_from_upload(
                    requesting_user=file_request.created_by,
                    folder=file_request.folder,
                    storage_key=validated_data['storage_key'],
                    unique_name=validated_data['unique_name'],
                    file_size=validated_data['file_size'],
                    content_type=validated_data['content_type'],
                )
                # Store uploader info in the document's metadata
                document.metadata = {
                    'uploader_info': {
                        'name': validated_data['uploader_name'],
                        'email': validated_data['uploader_email'],
                    }
                }
                document.save(update_fields=['metadata'])
                # Create the link record
                UploadedFile.objects.create(
                    file_request=file_request,
                    document=document,
                    uploader_name=validated_data['uploader_name'],
                    uploader_email=validated_data['uploader_email']
                )
                payload = {
                    'organization_id': str(file_request.created_by.organization_id),
                    'owner_user_id': str(file_request.created_by_id),
                    'file_request_id': str(file_request.id),
                    'file_request_slug': file_request.slug,
                    'folder_id': str(file_request.folder_id),
                    'document_id': str(document.id),
                    'uploaded_by_name': validated_data['uploader_name'],
                    'uploaded_by_email': validated_data['uploader_email'],
                    'uploaded_file_name': document.name,
                    'uploaded_file_size': validated_data['file_size'],
                    'event_datetime': timezone.now().isoformat(),
                    'visitor_ip': None,
                    'visitor_country': None,
                    'visitor_city': None,
                    'visitor_latitude': None,
                    'visitor_longitude': None,
                }
                transaction.on_commit(
                    lambda: dispatch_automation_event_task.delay('file_request_uploaded', payload)
                )
        except Exception as e:
            logger.error(f"Failed to finalize document upload for file request {slug}: {e}")
            return Response(
                {"detail": f"Failed to finalize document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"detail": "Upload successful."}, status=status.HTTP_202_ACCEPTED)
