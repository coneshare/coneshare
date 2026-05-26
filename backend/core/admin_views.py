import json

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import permissions, status, viewsets, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from documents.views import StandardResultsSetPagination
from filerequests.models import SecurityThreatEvent
from .models import AppConfiguration, LoginActivity
from .settings_registry import (DEFAULT_SETTINGS, coerce_to_typed_value,
                                deserialize_db_value, serialize_typed_to_db_value)
from .serializers import (AppConfigurationSerializer, LoginActivitySerializer,
                          UserSerializer)

User = get_user_model()


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to admin users.
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class AdminSettingUpdateSerializer(serializers.Serializer):
    value = serializers.JSONField()


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
            setting_type = config['type']
            default_value = getattr(settings, key)
            if key in existing_settings:
                obj = existing_settings[key]
                value = deserialize_db_value(setting_type, obj.value, default_value)
                raw_value = obj.value
                description = obj.description
            else:
                value = default_value
                raw_value = serialize_typed_to_db_value(setting_type, default_value)
                description = config['description']

            results.append({
                'key': key,
                'value': value,
                'raw_value': raw_value,
                'value_type': setting_type,
                'description': description
            })

        # results.sort(key=lambda x: x['key'])
        return Response(results)

    def update(self, request, *args, **kwargs):
        key = self.kwargs.get(self.lookup_field)
        if key not in DEFAULT_SETTINGS:
            return Response({'detail': 'Setting not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        serializer = AdminSettingUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = serializer.validated_data.get('value')

        config = DEFAULT_SETTINGS[key]
        description = config['description']
        setting_type = config['type']
        try:
            coerced_value = coerce_to_typed_value(setting_type, value)
        except (ValueError, TypeError):
            raise serializers.ValidationError({'value': f'Invalid value for type {setting_type}.'})
        stored_value = serialize_typed_to_db_value(setting_type, coerced_value)

        obj, created = AppConfiguration.objects.update_or_create(
            key=key,
            defaults={'value': stored_value, 'description': description}
        )

        return Response({
            'key': key,
            'value': deserialize_db_value(setting_type, obj.value, getattr(settings, key)),
            'raw_value': obj.value,
            'value_type': setting_type,
            'description': description,
        })


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


class AdminLoginActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for admins to view user login activities.
    """
    queryset = LoginActivity.objects.all()
    serializer_class = LoginActivitySerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        """
        Admins can see all login activities for users in their organization.
        Can be filtered by `user_id`.
        """
        user = self.request.user
        queryset = LoginActivity.objects.filter(
            user__organization=user.organization
        ).select_related('user').order_by('-created_at')

        user_id = self.request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        return queryset


class SecurityThreatEventSerializer(serializers.ModelSerializer):
    file_request_slug = serializers.CharField(source='file_request.slug', read_only=True)

    class Meta:
        model = SecurityThreatEvent
        fields = [
            'id',
            'event_type',
            'severity',
            'status',
            'file_request',
            'file_request_slug',
            'storage_key',
            'file_name',
            'file_size',
            'content_type',
            'uploader_name',
            'uploader_email',
            'scanner_engine',
            'scanner_message',
            'storage_cleanup_status',
            'storage_cleanup_at',
            'storage_cleanup_error',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class AdminSecurityThreatEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for admins to view security threat events for file requests.
    """
    serializer_class = SecurityThreatEventSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        user = self.request.user
        queryset = SecurityThreatEvent.objects.filter(
            organization=user.organization
        ).select_related('file_request').order_by('-created_at')

        status_value = self.request.query_params.get('status')
        if status_value:
            queryset = queryset.filter(status=status_value)

        severity = self.request.query_params.get('severity')
        if severity:
            queryset = queryset.filter(severity=severity)

        event_type = self.request.query_params.get('event_type')
        if event_type:
            queryset = queryset.filter(event_type=event_type)

        return queryset
