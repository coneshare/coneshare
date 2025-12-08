import json

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import permissions, status, viewsets, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from documents.views import StandardResultsSetPagination
from .models import AppConfiguration
from .serializers import AppConfigurationSerializer, UserSerializer

User = get_user_model()


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to admin users.
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


# This list should be kept in sync with the defaults in settings.py
DEFAULT_SETTINGS = {
    'MAX_PREVIEW_FILE_SIZE_MB': {'description': 'Max file size in MB for preview generation. Files larger than this will be marked as download-only.', 'is_json': False},
    'MAX_PREVIEW_PAGES': {'description': 'Maximum number of pages for document preview. Documents with more pages will be available for download only.', 'is_json': False},
    'FILE_SIZE_QUOTA_MB': {'description': 'Per-user file size quota in MB. 0 means unlimited.', 'is_json': False},
    'MAX_FILES_PER_UPLOAD': {'description': 'Maximum number of files allowed in a single upload operation.', 'is_json': False},
    'ENABLED_CLOUD_PROVIDERS': {'description': 'JSON list of enabled cloud providers (e.g., ["dropbox"]).', 'is_json': True},
    'CLOUD_IMPORT_FOLDER_MAPPING': {'description': 'JSON mapping of provider IDs to default folder names.', 'is_json': True},
    'CLOUD_IMPORT_MAX_SIZE_MB': {'description': 'Max file size in MB for cloud imports.', 'is_json': False},
    'DROPBOX_APP_KEY': {'description': 'API Key for Dropbox integration.', 'is_json': False},
    'DROPBOX_APP_SECRET': {'description': 'API Secret for Dropbox integration.', 'is_json': False},
    'GOOGLE_DRIVE_CLIENT_ID': {'description': 'Client ID for Google Drive integration.', 'is_json': False},
    'GOOGLE_DRIVE_CLIENT_SECRET': {'description': 'Client Secret for Google Drive integration.', 'is_json': False},
    'NEXT_CLOUD_HOST': {'description': 'Host URL for Nextcloud (e.g., https://cloud.example.com).', 'is_json': False},
    'NEXT_CLOUD_CLIENT_ID': {'description': 'Client ID for Nextcloud integration.', 'is_json': False},
    'NEXT_CLOUD_CLIENT_SECRET': {'description': 'Client Secret for Nextcloud integration.', 'is_json': False},
}


class AdminSettingsViewSet(viewsets.ModelViewSet):
    """
    API endpoint for superusers to manage application settings.
    This view dynamically merges settings from the database with defaults from settings.py.
    """
    queryset = AppConfiguration.objects.all()
    serializer_class = AppConfigurationSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    lookup_field = 'key'

    def list(self, request, *args, **kwargs):
        existing_settings = {s.key: s for s in self.get_queryset()}
        
        results = []
        for key, config in DEFAULT_SETTINGS.items():
            if key in existing_settings:
                obj = existing_settings[key]
                value = obj.value
                description = obj.description
            else:
                default_value = getattr(settings, key)
                value = json.dumps(default_value) if config.get('is_json') else str(default_value)
                description = config['description']
            
            results.append({
                'key': key,
                'value': value,
                'description': description
            })

        # results.sort(key=lambda x: x['key'])
        return Response(results)

    def update(self, request, *args, **kwargs):
        key = self.kwargs.get(self.lookup_field)
        if key not in DEFAULT_SETTINGS:
            return Response({'detail': 'Setting not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        serializer = self.get_serializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        value = serializer.validated_data.get('value')
        
        config = DEFAULT_SETTINGS[key]
        description = config['description']

        obj, created = AppConfiguration.objects.update_or_create(
            key=key,
            defaults={'value': value, 'description': description}
        )
        
        response_serializer = self.get_serializer(obj)
        return Response(response_serializer.data)


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    API endpoint for admins to manage users in their organization.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        """
        Admins can see all users in their organization.
        """
        user = self.request.user
        return User.objects.filter(organization=user.organization).order_by('-date_joined')

    def perform_create(self, serializer):
        """
        When an admin creates a user, associate the user with the admin's organization.
        """
        serializer.save(organization=self.request.user.organization)

    def perform_update(self, serializer):
        """
        When an admin updates a user, prevent them from removing the last active admin.
        """
        instance = self.get_object()

        new_role = serializer.validated_data.get('role', instance.role)
        new_is_active = serializer.validated_data.get('is_active', instance.is_active)

        # These checks only apply when an active admin is being demoted or deactivated.
        if instance.role == 'admin':
            is_demoting = new_role != 'admin'
            is_deactivating = instance.is_active and new_is_active is False

            if is_demoting or is_deactivating:
                active_admins = User.objects.filter(
                    organization=instance.organization,
                    role='admin',
                    is_active=True
                )
                if active_admins.count() == 1 and active_admins.first() == instance:
                    raise serializers.ValidationError({
                        "detail": "Cannot demote or deactivate the last active admin of the organization."
                    })
                if instance == self.request.user:
                    raise serializers.ValidationError({
                        "detail": "Admins cannot demote or deactivate their own account."
                    })

        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # These checks only apply when an active admin is being deleted.
        if instance.role == 'admin':
            active_admins = User.objects.filter(
                organization=instance.organization,
                role='admin',
                is_active=True
            )
            if active_admins.count() == 1 and active_admins.first() == instance:
                return Response({"detail": "Cannot delete the last active admin of the organization."},
                                status=status.HTTP_400_BAD_REQUEST)
            if instance == request.user:
                return Response({"detail": "Admins cannot delete their own account."},
                                status=status.HTTP_400_BAD_REQUEST)

        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)
