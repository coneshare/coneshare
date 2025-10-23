import logging

from django.conf import settings
from django.core.cache import cache
from django.shortcuts import redirect
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from documents.serializers import DocumentSerializer
from .models import CloudConnection
from .providers import CloudProviderError, get_cloud_provider
from .serializers import (CloudConnectionSerializer, CloudImportSerializer,
                            DropboxCallbackSerializer,
                            GoogleDriveCallbackSerializer)
from .services import create_document_for_import

logger = logging.getLogger(__name__)


class CloudProviderListView(APIView):
    """
    Returns a list of cloud providers enabled in the system configuration.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        providers = settings.ENABLED_CLOUD_PROVIDERS

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


class CloudConnectionListView(APIView):
    """
    Lists the user's active cloud connections.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        connections = CloudConnection.objects.filter(user=request.user)
        serializer = CloudConnectionSerializer(connections, many=True)
        return Response(serializer.data)


class DropboxConnectView(APIView):
    """
    Generates a Dropbox authorization URL and returns it to the frontend.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            provider = get_cloud_provider('dropbox')
            auth_url, state = provider.get_authorization_url(request)
            if not state:
                raise CloudProviderError("Failed to generate CSRF state token.")

            # Cache the state token for 10 minutes, keyed by user ID for security.
            cache.set(f"dropbox_oauth_state_{request.user.id}", state, timeout=600)

            return Response({'authorization_url': auth_url})
        except CloudProviderError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DropboxCallbackView(APIView):
    """
    Handles the final step of the OAuth2 flow, receiving the code and state
    from the frontend.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = DropboxCallbackSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data['code']
        state = serializer.validated_data['state']
        user_id = request.user.id

        # 1. Verify CSRF token (state)
        cache_key = f"dropbox_oauth_state_{user_id}"
        cached_state = cache.get(cache_key)

        if not cached_state or cached_state != state:
            logger.warning(f"Dropbox CSRF token mismatch for user {user_id}.")
            return Response({"detail": "Invalid state parameter. Please try connecting again."}, status=status.HTTP_400_BAD_REQUEST)

        cache.delete(cache_key)

        try:
            # 2. Exchange code for token
            provider = get_cloud_provider('dropbox')
            token_data = provider.handle_callback(code)

            # 3. Save connection
            connection, created = CloudConnection.objects.update_or_create(
                user=request.user,
                provider='dropbox',
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

            return Response({"detail": "Successfully connected to Dropbox."})

        except CloudProviderError as e:
            logger.error(f"Dropbox callback failed for user {user_id}: {e}")
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.exception(f"Unexpected error in Dropbox callback for user {user_id}: {e}")
            return Response({"detail": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GoogleDriveConnectView(APIView):
    """
    Generates a Google Drive authorization URL and returns it to the frontend.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            provider = get_cloud_provider('google_drive')
            auth_url, state = provider.get_authorization_url(request)
            if not state:
                raise CloudProviderError("Failed to generate CSRF state token.")

            # Cache the state token for 10 minutes, keyed by user ID for security.
            cache.set(f"google_drive_oauth_state_{request.user.id}", state, timeout=600)

            return Response({'authorization_url': auth_url})
        except CloudProviderError as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GoogleDriveCallbackView(APIView):
    """
    Handles the final step of the OAuth2 flow for Google Drive, receiving the code
    and state from the frontend.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = GoogleDriveCallbackSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data['code']
        state = serializer.validated_data['state']
        user_id = request.user.id

        # 1. Verify CSRF token (state)
        cache_key = f"google_drive_oauth_state_{user_id}"
        cached_state = cache.get(cache_key)

        if not cached_state or cached_state != state:
            logger.warning(f"Google Drive CSRF token mismatch for user {user_id}.")
            return Response({"detail": "Invalid state parameter. Please try connecting again."}, status=status.HTTP_400_BAD_REQUEST)

        cache.delete(cache_key)

        try:
            # 2. Exchange code for token
            provider = get_cloud_provider('google_drive')
            token_data = provider.handle_callback(code)

            # 3. Save connection
            connection, created = CloudConnection.objects.update_or_create(
                user=request.user,
                provider='google_drive',
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

            return Response({"detail": "Successfully connected to Google Drive."})

        except CloudProviderError as e:
            logger.error(f"Google Drive callback failed for user {user_id}: {e}")
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.exception(f"Unexpected error in Google Drive callback for user {user_id}: {e}")
            return Response({"detail": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CloudFileListView(APIView):
    """
    Lists files from a specific cloud connection.
    """
    permission_classes = [permissions.IsAuthenticated]

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


class CloudImportView(APIView):
    """
    Initiates a file import from a cloud service.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, connection_id, *args, **kwargs):
        serializer = CloudImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        file_id = validated_data['file_id']
        file_name = validated_data['file_name']
        file_size = validated_data['file_size']

        if file_size > 100 * 1024 * 1024:
            return Response({"detail": "File size cannot exceed 100MB for import."}, status=status.HTTP_400_BAD_REQUEST)

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
