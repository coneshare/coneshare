import json

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import permissions, status, viewsets, serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from drf_spectacular.utils import extend_schema, extend_schema_field

from core.pagination import StandardResultsSetPagination
from core.permissions import APIKeyTierPermission
from filerequests.models import SecurityThreatEvent
from .models import AppConfiguration, LoginActivity, Organization
from .settings_registry import (DEFAULT_SETTINGS, coerce_to_typed_value,
                                deserialize_db_value, serialize_typed_to_db_value)
from .serializers import (AppConfigurationSerializer, LoginActivitySerializer,
                          UserSerializer, OrganizationSerializer)

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
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyTierPermission]
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


class AdminUserDetailSerializer(UserSerializer):
    total_links = serializers.SerializerMethodField()
    total_datarooms = serializers.SerializerMethodField()
    total_views = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['total_links', 'total_datarooms', 'total_views']

    @extend_schema_field(serializers.IntegerField())
    def get_total_links(self, obj) -> int:
        from sharelinks.models import ShareLink
        return ShareLink.objects.filter(created_by=obj).count()

    @extend_schema_field(serializers.IntegerField())
    def get_total_datarooms(self, obj) -> int:
        from datarooms.models import Dataroom
        return Dataroom.objects.filter(created_by=obj).count()

    @extend_schema_field(serializers.IntegerField())
    def get_total_views(self, obj) -> int:
        from sharelinks.models import ViewSession
        return ViewSession.objects.filter(share_link__created_by=obj).count()


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    API endpoint for admins to manage users in their organization.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyTierPermission]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AdminUserDetailSerializer
        return UserSerializer

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

    @action(detail=True, methods=['get'], url_path='share-links')
    def share_links(self, request, pk=None):
        from sharelinks.models import ShareLink
        from sharelinks.serializers import ShareLinkSerializer
        user = self.get_object()
        queryset = ShareLink.objects.filter(created_by=user).order_by('-created_at')
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = ShareLinkSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)

        serializer = ShareLinkSerializer(queryset, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='datarooms')
    def datarooms(self, request, pk=None):
        from datarooms.models import Dataroom
        from datarooms.serializers import DataroomSerializer
        user = self.get_object()
        queryset = Dataroom.objects.filter(created_by=user).order_by('-created_at')
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = DataroomSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)

        serializer = DataroomSerializer(queryset, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='recalculate-quota')
    def recalculate_quota(self, request, pk=None):
        from documents.services import recalculate_user_document_size
        user = self.get_object()
        recalculate_user_document_size(user)
        serializer = AdminUserDetailSerializer(user, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminLoginActivityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for admins to view user login activities.
    """
    queryset = LoginActivity.objects.all()
    serializer_class = LoginActivitySerializer
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyTierPermission]
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
    # Dummy queryset for OpenAPI schema generation to infer lookup field type without executing get_queryset().
    queryset = SecurityThreatEvent.objects.none()
    serializer_class = SecurityThreatEventSerializer
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyTierPermission]
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


class AdminOrganizationView(APIView):
    """
    View for admins to retrieve or update their organization's branding/settings.
    """
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyTierPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(
        request=OrganizationSerializer,
        responses={200: OrganizationSerializer},
    )
    def get(self, request):
        serializer = OrganizationSerializer(request.user.organization, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        request=OrganizationSerializer,
        responses={200: OrganizationSerializer},
    )
    def patch(self, request):
        serializer = OrganizationSerializer(
            request.user.organization,
            data=request.data,
            partial=True,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
