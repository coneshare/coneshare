import logging

from geoip2.errors import AddressNotFoundError
from django.conf import settings
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers
from drf_spectacular.utils import extend_schema

from backend.utils import get_client_ip
from documents.views import StandardResultsSetPagination
from documents.services import (
    QuotaExceededError,
    check_user_quota_on_upload,
    create_document_from_upload,
    _get_unique_document_name,
    generate_storage_key,
)
from documents.fileserver import fileserver_client
from documents.malware_scan import (
    MalwareDetectedError,
    MalwareScannerUnavailableError,
    scan_storage_key_or_raise,
)
from automations.tasks import dispatch_automation_event_task
from .models import FileRequest, SecurityThreatEvent, UploadedFile
from .serializers import (
    FileRequestSerializer,
    FileRequestDetailSerializer,
    PublicFileRequestSerializer,
    FileRequestUploadFinalizeSerializer,
    build_custom_field_snapshot,
    validate_custom_field_values,
)

logger = logging.getLogger(__name__)


def _normalize_allowed_extension(value):
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    if not normalized.startswith('.'):
        normalized = f'.{normalized}'
    return normalized


def _validate_allowed_file_types(file_request, file_name):
    if not file_request.allowed_file_types:
        return None

    allowed = {
        normalized for normalized in
        (_normalize_allowed_extension(item) for item in file_request.allowed_file_types)
        if normalized
    }
    if not allowed:
        return None

    normalized_file_name = str(file_name or "").strip().lower()
    if any(normalized_file_name.endswith(allowed_extension) for allowed_extension in allowed):
        return None

    allowed_text = ", ".join(sorted(allowed))
    return (
        f"File type not allowed. Allowed file types: {allowed_text}. "
        "Matching is case-insensitive and accepts values with or without a leading dot."
    )


def _get_visitor_context(request):
    location_data = {}
    visitor_ip = get_client_ip(request)

    if visitor_ip and settings.GEOIP:
        try:
            location_data = settings.GEOIP.city(visitor_ip)
        except AddressNotFoundError:
            pass
        except Exception as e:
            logger.error("GeoIP2 lookup failed for file request upload: %s", e)

    return {
        'visitor_ip': visitor_ip or None,
        'visitor_country': location_data.get('country_name') or None,
        'visitor_city': location_data.get('city') or None,
        'visitor_latitude': location_data.get('latitude'),
        'visitor_longitude': location_data.get('longitude'),
    }


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

    class FileRequestUploadRequestSerializer(serializers.Serializer):
        file_name = serializers.CharField()
        file_size = serializers.IntegerField()

    class FileRequestUploadResponseSerializer(serializers.Serializer):
        upload_url = serializers.CharField()
        storage_key = serializers.CharField()
        unique_name = serializers.CharField()

    @extend_schema(
        request=FileRequestUploadRequestSerializer,
        responses={200: FileRequestUploadResponseSerializer, 400: dict, 404: dict},
    )
    def post(self, request, slug, *args, **kwargs):
        try:
            file_request = FileRequest.objects.get(slug=slug, is_active=True)
        except FileRequest.DoesNotExist:
            return Response({"detail": "File request not found or has been disabled."}, status=status.HTTP_404_NOT_FOUND)

        if file_request.expires_at and file_request.expires_at < timezone.now():
            return Response({"detail": "This file request has expired."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.FileRequestUploadRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        file_name = serializer.validated_data['file_name']
        file_size = serializer.validated_data['file_size']

        # Validate against link constraints
        if file_request.max_file_size and file_size > file_request.max_file_size:
            return Response({"detail": "File size exceeds the maximum allowed for this link."}, status=status.HTTP_400_BAD_REQUEST)
        file_type_error = _validate_allowed_file_types(file_request=file_request, file_name=file_name)
        if file_type_error:
            return Response({"detail": file_type_error}, status=status.HTTP_400_BAD_REQUEST)

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
            custom_field_values = validate_custom_field_values(
                file_request.custom_fields,
                validated_data.get('custom_field_values') or {},
            )
            custom_field_snapshot = build_custom_field_snapshot(
                file_request.custom_fields,
                custom_field_values,
            )
        except serializers.ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)

        visitor_context = _get_visitor_context(request)
        security_event_payload = {
            'organization_id': str(file_request.created_by.organization_id),
            'owner_user_id': str(file_request.created_by_id),
            'file_request_id': str(file_request.id),
            'file_request_slug': file_request.slug,
            'folder_id': str(file_request.folder_id),
            'uploaded_by_name': validated_data['uploader_name'],
            'uploaded_by_email': validated_data['uploader_email'],
            'uploaded_file_name': validated_data['unique_name'],
            'uploaded_file_size': validated_data['file_size'],
            'event_datetime': timezone.now().isoformat(),
            **visitor_context,
        }
        file_type_error = _validate_allowed_file_types(
            file_request=file_request,
            file_name=validated_data['unique_name'],
        )
        if file_type_error:
            return Response({"detail": file_type_error}, status=status.HTTP_400_BAD_REQUEST)

        try:
            scan_storage_key_or_raise(validated_data['storage_key'])
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
                    },
                    'file_request_fields': custom_field_snapshot,
                }
                document.save(update_fields=['metadata'])
                # Create the link record
                UploadedFile.objects.create(
                    file_request=file_request,
                    document=document,
                    uploader_name=validated_data['uploader_name'],
                    uploader_email=validated_data['uploader_email'],
                    submitted_fields=custom_field_snapshot,
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
                    'custom_field_values': custom_field_values,
                    'event_datetime': timezone.now().isoformat(),
                    **visitor_context,
                }
                transaction.on_commit(
                    lambda: dispatch_automation_event_task.delay('file_request_uploaded', payload)
                )
        except MalwareDetectedError as e:
            threat_event = SecurityThreatEvent.objects.create(
                organization=file_request.created_by.organization,
                owner_user=file_request.created_by,
                file_request=file_request,
                event_type=SecurityThreatEvent.EventType.MALWARE_DETECTED,
                severity=SecurityThreatEvent.Severity.HIGH,
                storage_key=validated_data['storage_key'],
                file_name=validated_data['unique_name'],
                file_size=validated_data['file_size'],
                content_type=validated_data['content_type'],
                uploader_name=validated_data['uploader_name'],
                uploader_email=validated_data['uploader_email'],
                scanner_message=str(e),
            )
            try:
                fileserver_client.delete_file(validated_data['storage_key'])
                threat_event.storage_cleanup_status = SecurityThreatEvent.StorageCleanupStatus.DELETED
                threat_event.storage_cleanup_at = timezone.now()
                threat_event.save(update_fields=['storage_cleanup_status', 'storage_cleanup_at'])
            except Exception as cleanup_error:
                logger.error(
                    "Failed to delete malicious uploaded object for file request %s storage_key=%s: %s",
                    file_request.slug,
                    validated_data['storage_key'],
                    cleanup_error,
                )
                threat_event.storage_cleanup_status = SecurityThreatEvent.StorageCleanupStatus.FAILED
                threat_event.storage_cleanup_error = str(cleanup_error)
                threat_event.save(update_fields=['storage_cleanup_status', 'storage_cleanup_error'])
            malware_payload = {
                **security_event_payload,
                'threat_event_id': str(threat_event.id),
                'scan_error': str(e),
            }
            dispatch_automation_event_task.delay('file_request_malware_detected', malware_payload)
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except MalwareScannerUnavailableError as e:
            threat_event = SecurityThreatEvent.objects.create(
                organization=file_request.created_by.organization,
                owner_user=file_request.created_by,
                file_request=file_request,
                event_type=SecurityThreatEvent.EventType.SCAN_FAILED,
                severity=SecurityThreatEvent.Severity.MEDIUM,
                storage_key=validated_data['storage_key'],
                file_name=validated_data['unique_name'],
                file_size=validated_data['file_size'],
                content_type=validated_data['content_type'],
                uploader_name=validated_data['uploader_name'],
                uploader_email=validated_data['uploader_email'],
                scanner_message=str(e),
            )
            try:
                fileserver_client.delete_file(validated_data['storage_key'])
                threat_event.storage_cleanup_status = SecurityThreatEvent.StorageCleanupStatus.DELETED
                threat_event.storage_cleanup_at = timezone.now()
                threat_event.save(update_fields=['storage_cleanup_status', 'storage_cleanup_at'])
            except Exception as cleanup_error:
                logger.error(
                    "Failed to delete unscanned uploaded object for file request %s storage_key=%s: %s",
                    file_request.slug,
                    validated_data['storage_key'],
                    cleanup_error,
                )
                threat_event.storage_cleanup_status = SecurityThreatEvent.StorageCleanupStatus.FAILED
                threat_event.storage_cleanup_error = str(cleanup_error)
                threat_event.save(update_fields=['storage_cleanup_status', 'storage_cleanup_error'])
            scanner_failed_payload = {
                **security_event_payload,
                'threat_event_id': str(threat_event.id),
                'scan_error': str(e),
            }
            dispatch_automation_event_task.delay('file_request_scan_failed', scanner_failed_payload)
            return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            logger.error(f"Failed to finalize document upload for file request {slug}: {e}")
            return Response(
                {"detail": f"Failed to finalize document processing: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"detail": "Upload successful."}, status=status.HTTP_202_ACCEPTED)
