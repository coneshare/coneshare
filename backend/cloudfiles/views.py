import logging

from django.core.cache import cache
from django.db import transaction
from django.shortcuts import redirect
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.services import get_dynamic_setting
from documents.models import Document, DocumentVersion
from documents.serializers import DocumentSerializer
from documents.services import QuotaExceededError, check_user_quota_on_upload
from .models import CloudConnection
from .providers import CloudProviderError, get_cloud_provider
from .serializers import (CloudConnectionSerializer, CloudImportSerializer,
                          OAuthCallbackSerializer)
from .services import create_document_for_import
from .tasks import import_from_cloud_task

logger = logging.getLogger(__name__)


@extend_schema(tags=['cloudfiles'])
class CloudProviderListView(APIView):
    """
    Returns a list of cloud providers enabled in the system configuration.
    """

    class CloudProviderSerializer(serializers.Serializer):
        name = serializers.CharField()
        display_name = serializers.CharField()
        is_connected = serializers.BooleanField()

    @extend_schema(responses={200: CloudProviderSerializer(many=True)})
    def get(self, request, *args, **kwargs):
        providers = get_dynamic_setting('ENABLED_CLOUD_PROVIDERS')

        user_connections = CloudConnection.objects.filter(
            user=request.user,
            provider__in=providers
        ).values_list('provider', flat=True)

        provider_data = [
            {
                'name': provider,
                'display_name': provider.replace('_', ' ').title(),
                'is_connected': provider in user_connections
            }
            for provider in providers
        ]
        return Response(provider_data)


@extend_schema(tags=['cloudfiles'])
class CloudConnectionListView(APIView):
    """
    Lists the user's active cloud connections.
    """

    @extend_schema(responses={200: CloudConnectionSerializer(many=True)})
    def get(self, request, *args, **kwargs):
        connections = CloudConnection.objects.filter(user=request.user)
        serializer = CloudConnectionSerializer(connections, many=True)
        return Response(serializer.data)


@extend_schema(tags=['cloudfiles'])
class CloudConnectionDetailView(APIView):
    """
    Handles operations on a specific cloud connection (e.g. deletion).
    """

    @extend_schema(responses={204: None, 404: dict})
    def delete(self, request, connection_id, *args, **kwargs):
        try:
            connection = CloudConnection.objects.get(id=connection_id, user=request.user)
        except CloudConnection.DoesNotExist:
            return Response({"detail": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            # Best-effort remote revocation
            provider = get_cloud_provider(connection.provider, connection=connection)
            provider.revoke_token()
        except Exception as e:
            logger.warning(f"Error during remote token revocation for connection {connection_id}: {e}")

        connection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)



@extend_schema(tags=['cloudfiles'])
class CloudConnectView(APIView):
    """
    Generates a cloud provider authorization URL and returns it to the frontend.
    """

    class CloudConnectResponseSerializer(serializers.Serializer):
        authorization_url = serializers.CharField()

    @extend_schema(responses={200: CloudConnectResponseSerializer, 500: dict})
    def get(self, request, provider_name, *args, **kwargs):
        try:
            provider = get_cloud_provider(provider_name)
            auth_url, state = provider.get_authorization_url()
            if not state:
                raise CloudProviderError("Failed to generate CSRF state token.")

            # Cache the state token for 10 minutes, keyed by user ID for security.
            cache.set(f"{provider_name}_oauth_state_{request.user.id}", state, timeout=600)

            return Response({'authorization_url': auth_url})
        except CloudProviderError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(tags=['cloudfiles'])
class CloudCallbackView(APIView):
    """
    Handles the final step of the OAuth2 flow, receiving the code and state
    from the frontend.
    """

    @extend_schema(
        request=OAuthCallbackSerializer,
        responses={200: dict, 400: dict, 500: dict},
    )
    def post(self, request, provider_name, *args, **kwargs):
        serializer = OAuthCallbackSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data['code']
        state = serializer.validated_data['state']
        user_id = request.user.id

        # 1. Verify CSRF token (state)
        cache_key = f"{provider_name}_oauth_state_{user_id}"
        cached_state = cache.get(cache_key)

        if not cached_state or cached_state != state:
            provider_display_name = provider_name.replace('_', ' ').title()
            logger.warning(f"{provider_display_name} CSRF token mismatch for user {user_id}.")
            return Response({"detail": "Invalid state parameter. Please try connecting again."}, status=status.HTTP_400_BAD_REQUEST)

        cache.delete(cache_key)

        try:
            # 2. Exchange code for token
            provider = get_cloud_provider(provider_name)
            token_data = provider.handle_callback(code)

            # 3. Save connection
            connection, created = CloudConnection.objects.update_or_create(
                user=request.user,
                provider=provider_name,
                defaults={
                    'access_token': token_data['access_token'],
                    'refresh_token': token_data.get('refresh_token'),
                    'expires_at': token_data.get('expires_at')
                }
            )

            # 4. Get user info and finalize
            provider.connection = connection
            user_info = provider.get_user_info()
            connection.email = user_info.get('email', '')
            connection.save()

            provider_display_name = provider_name.replace('_', ' ').title()
            return Response({"detail": f"Successfully connected to {provider_display_name}."})

        except CloudProviderError as e:
            provider_display_name = provider_name.replace('_', ' ').title()
            logger.error(f"{provider_display_name} callback failed for user {user_id}: {e}")
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            provider_display_name = provider_name.replace('_', ' ').title()
            logger.exception(f"Unexpected error in {provider_display_name} callback for user {user_id}: {e}")
            return Response({"detail": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(tags=['cloudfiles'])
class CloudFileListView(APIView):
    """
    Lists files from a specific cloud connection.
    """

    @extend_schema(responses={200: dict, 404: dict, 500: dict})
    def get(self, request, connection_id, *args, **kwargs):
        try:
            connection = CloudConnection.objects.get(id=connection_id, user=request.user)
            provider = get_cloud_provider(connection.provider, connection=connection)

            path = request.query_params.get('path', '/')
            files = provider.list_files(path)

            return Response(files)
        except CloudConnection.DoesNotExist:
            return Response({"detail": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)
        except CloudProviderError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(tags=['cloudfiles'])
class CloudFolderListView(APIView):
    """
    Lists only folders from a specific cloud connection.
    """

    @extend_schema(responses={200: dict, 404: dict, 500: dict})
    def get(self, request, connection_id, *args, **kwargs):
        try:
            connection = CloudConnection.objects.get(id=connection_id, user=request.user)
            provider = get_cloud_provider(connection.provider, connection=connection)

            path = request.query_params.get('path', '/')
            files = provider.list_files(path)

            folders = [f for f in files if f.get('type') == 'folder']
            return Response(folders)
        except CloudConnection.DoesNotExist:
            return Response({"detail": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)
        except CloudProviderError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(tags=['cloudfiles'])
class CloudImportView(APIView):
    """
    Initiates a file import from a cloud service.
    """

    @extend_schema(
        request=CloudImportSerializer,
        responses={202: DocumentSerializer, 400: dict, 404: dict, 500: dict},
    )
    def post(self, request, connection_id, *args, **kwargs):
        serializer = CloudImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        file_id = validated_data['file_id']
        file_name = validated_data['file_name']
        file_size = validated_data['file_size']

        try:
            check_user_quota_on_upload(
                user=request.user,
                new_file_size=file_size
            )
        except QuotaExceededError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        max_size_mb = get_dynamic_setting('CLOUD_IMPORT_MAX_SIZE_MB')
        max_size_bytes = max_size_mb * 1024 * 1024
        if file_size > max_size_bytes:
            return Response({"detail": f"File size cannot exceed {max_size_mb}MB for import."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            connection = CloudConnection.objects.get(id=connection_id, user=request.user)

            document = create_document_for_import(
                requesting_user=request.user,
                file_name=file_name,
                file_size=file_size,
                connection=connection,
                file_id_or_path=file_id
            )

            response_serializer = DocumentSerializer(document, context={'request': request})
            return Response(response_serializer.data, status=status.HTTP_202_ACCEPTED)

        except CloudConnection.DoesNotExist:
            return Response({"detail": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception(f"Failed to initiate cloud import for user {request.user.id}: {e}")
            return Response({"detail": "Failed to start import process."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(tags=['cloudfiles'])
class CloudRefreshView(APIView):
    """
    Refreshes a document that was originally imported from a cloud provider.
    """

    @extend_schema(
        request=None,
        responses={202: DocumentSerializer, 400: dict, 404: dict, 500: dict},
    )
    def post(self, request, document_id, *args, **kwargs):
        try:
            document = Document.objects.active().get(id=document_id, created_by=request.user)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        # 1. Fetch the primary version and verify it has cloud_import metadata
        primary_version = document.versions.filter(is_primary=True).first()
        if not primary_version or not isinstance(primary_version.metadata, dict) or 'cloud_import' not in primary_version.metadata:
            return Response({"detail": "This document was not imported from a cloud provider."}, status=status.HTTP_400_BAD_REQUEST)

        cloud_import_data = primary_version.metadata['cloud_import']
        connection_id = cloud_import_data.get('connection_id')
        file_id = cloud_import_data.get('file_id')
        provider_name = cloud_import_data.get('provider')

        try:
            connection = CloudConnection.objects.get(id=connection_id, user=request.user)
        except CloudConnection.DoesNotExist:
            # Fallback: If connection_id changed (e.g. user disconnected and reconnected provider),
            # attempt to resolve an active connection for the same provider.
            connection = CloudConnection.objects.filter(user=request.user, provider=provider_name).first()
            if not connection:
                return Response({"detail": "Cloud connection not found. Please reconnect your cloud account."}, status=status.HTTP_404_NOT_FOUND)

        # 2. Check quota (reuse primary version's size for pre-check).
        # Note: Since new_file_size matches the current file_size, this pre-check has a net change of 0.
        # It only fails if the user's current usage already exceeds their quota (e.g. after a quota limit reduction).
        # The true size will be checked inside the Celery task once downloaded.
        try:
            check_user_quota_on_upload(
                user=request.user,
                new_file_size=primary_version.file_size or 0,
                document_to_update=document
            )
        except QuotaExceededError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Create a new DocumentVersion eagerly in the view.
        # Note: Reserving the new version number synchronously under lock prevents race conditions
        # and double-submission download tasks. It also provides immediate visual feedback
        # to the user. If the background download task fails, the reversion logic in the
        # celery worker cleans up this version record and restores the previous primary version.
        with transaction.atomic():
            # Lock the document row to prevent concurrent updates
            locked_document = Document.objects.active().select_for_update().get(id=document_id)

            # Fetch versions inside lock
            current_primary = locked_document.versions.filter(is_primary=True).first()
            latest_version = locked_document.versions.order_by('-version_number').first()
            new_version_number = (latest_version.version_number if latest_version else 0) + 1

            if current_primary:
                current_primary.is_primary = False
                current_primary.save(update_fields=['is_primary'])

            # Clone the cloud_import metadata to the new version
            new_version = DocumentVersion.objects.create(
                document=locked_document,
                version_number=new_version_number,
                file_size=current_primary.file_size if current_primary else 0,
                is_primary=True,
                metadata={
                    "cloud_import": {
                        "provider": connection.provider,
                        "provider_display": connection.get_provider_display(),
                        "connection_id": str(connection.id),
                        "file_id": file_id
                    }
                }
            )

            locked_document.status = 'uploading'
            locked_document.status_message = 'Syncing latest version from cloud...'
            locked_document.save(update_fields=['status', 'status_message'])

        import_from_cloud_task.delay(locked_document.id, connection.id, file_id, version_id=new_version.id)

        response_serializer = DocumentSerializer(locked_document, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_202_ACCEPTED)


@extend_schema(tags=['cloudfiles'])
class CloudImportVersionView(APIView):
    """
    Imports a new version of an existing document from a cloud provider.
    """

    class ImportVersionSerializer(serializers.Serializer):
        connection_id = serializers.CharField(max_length=255)
        file_id = serializers.CharField(max_length=1024)
        file_name = serializers.CharField(max_length=255)
        file_size = serializers.IntegerField()

    @extend_schema(
        request=ImportVersionSerializer,
        responses={202: DocumentSerializer, 400: dict, 404: dict, 500: dict},
    )
    def post(self, request, document_id, *args, **kwargs):
        try:
            document = Document.objects.active().get(id=document_id, created_by=request.user)
        except Document.DoesNotExist:
            return Response({"detail": "Document not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.ImportVersionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        connection_id = validated_data['connection_id']
        file_id = validated_data['file_id']
        file_name = validated_data['file_name']
        file_size = validated_data['file_size']

        try:
            connection = CloudConnection.objects.get(id=connection_id, user=request.user)
        except CloudConnection.DoesNotExist:
            return Response({"detail": "Connection not found."}, status=status.HTTP_404_NOT_FOUND)

        # 1. Pre-flight quota check
        try:
            check_user_quota_on_upload(
                user=request.user,
                new_file_size=file_size,
                document_to_update=document
            )
        except QuotaExceededError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Check max size constraint
        max_size_mb = get_dynamic_setting('CLOUD_IMPORT_MAX_SIZE_MB')
        max_size_bytes = max_size_mb * 1024 * 1024
        if file_size > max_size_bytes:
            return Response({"detail": f"File size cannot exceed {max_size_mb}MB for import."}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Create the new version eagerly in the view.
        # Note: Reserving the new version number synchronously under lock prevents race conditions
        # and double-submission download tasks. It also provides immediate visual feedback
        # to the user. If the background download task fails, the reversion logic in the
        # celery worker cleans up this version record and restores the previous primary version.
        with transaction.atomic():
            # Lock the document row to prevent concurrent updates
            locked_document = Document.objects.active().select_for_update().get(id=document_id)

            # Fetch versions inside lock
            current_primary = locked_document.versions.filter(is_primary=True).first()
            latest_version = locked_document.versions.order_by('-version_number').first()
            new_version_number = (latest_version.version_number if latest_version else 0) + 1

            if current_primary:
                current_primary.is_primary = False
                current_primary.save(update_fields=['is_primary'])

            new_version = DocumentVersion.objects.create(
                document=locked_document,
                version_number=new_version_number,
                file_size=file_size,
                is_primary=True,
                metadata={
                    "cloud_import": {
                        "provider": connection.provider,
                        "provider_display": connection.get_provider_display(),
                        "connection_id": str(connection.id),
                        "file_id": file_id
                    }
                }
            )

            locked_document.status = 'uploading'
            locked_document.status_message = 'Importing new version from cloud...'
            locked_document.save(update_fields=['status', 'status_message'])

        import_from_cloud_task.delay(locked_document.id, connection.id, file_id, version_id=new_version.id)

        response_serializer = DocumentSerializer(locked_document, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_202_ACCEPTED)
