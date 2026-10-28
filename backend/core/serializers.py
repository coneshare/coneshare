import logging
import os
from urllib.parse import urljoin
from PIL import Image

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from django.db import transaction
from geoip2.errors import AddressNotFoundError
from rest_framework import serializers
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from drf_spectacular.utils import extend_schema_field

from core.models import APIKey, AppConfiguration, LoginActivity, Organization, UserGroup
from core.services import blacklist_all_user_tokens, get_dynamic_setting

logger = logging.getLogger(__name__)
User = get_user_model()


class OrganizationSerializer(serializers.ModelSerializer):
    """Serializer for the Organization model."""
    brand_logo_url = serializers.SerializerMethodField()
    terms_url = serializers.URLField(required=False, allow_null=True, allow_blank=True)
    privacy_policy_url = serializers.URLField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'plan', 'stripe_customer_id', 'created_at', 'updated_at',
            'brand_logo', 'brand_logo_url', 'brand_name', 'brand_website_url',
            'terms_url', 'privacy_policy_url', 'branding_extras'
        ]
        read_only_fields = ['id', 'plan', 'stripe_customer_id', 'created_at', 'updated_at', 'brand_logo_url', 'branding_extras']
        extra_kwargs = {
            'brand_logo': {'write_only': True, 'required': False}
        }

    def validate_brand_logo(self, value):
        if not value:
            return value
        max_size_bytes = 2 * 1024 * 1024
        if hasattr(value, 'size') and value.size > max_size_bytes:
            raise serializers.ValidationError("Brand logo file size cannot exceed 2 MB.")
        name = getattr(value, 'name', '') or ''
        ext = os.path.splitext(name)[1].lower().lstrip('.')
        allowed_extensions = ['png', 'jpg', 'jpeg', 'webp']
        if ext and ext not in allowed_extensions:
            raise serializers.ValidationError(
                f"Unsupported file extension '{ext}'. Allowed extensions are: {', '.join(allowed_extensions)}."
            )
        try:
            if hasattr(value, 'seek'):
                value.seek(0)
            img = Image.open(value)
            img.verify()
            if img.format not in ('PNG', 'JPEG', 'WEBP'):
                raise serializers.ValidationError(
                    f"Unsupported image format '{img.format}'. Allowed formats are PNG, JPEG, WEBP."
                )
            if hasattr(value, 'seek'):
                value.seek(0)
        except serializers.ValidationError:
            raise
        except Exception:
            raise serializers.ValidationError("Uploaded file is not a valid image.")
        return value

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_brand_logo_url(self, obj) -> str:
        if obj.brand_logo and hasattr(obj.brand_logo, 'url'):
            return urljoin(settings.SITE_DOMAIN, obj.brand_logo.url)
        return None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        config = instance.branding_extras or {}
        ret['terms_url'] = config.get('terms_url')
        ret['privacy_policy_url'] = config.get('privacy_policy_url')
        return ret

    def update(self, instance, validated_data):
        # Create a copy to ensure Django's JSONField change tracking detects the modification
        extras = dict(instance.branding_extras or {})

        # Check key presence in validated_data to support partial updates and clearing fields
        if 'terms_url' in validated_data:
            extras['terms_url'] = validated_data.pop('terms_url')
        if 'privacy_policy_url' in validated_data:
            extras['privacy_policy_url'] = validated_data.pop('privacy_policy_url')

        instance.branding_extras = extras
        return super().update(instance, validated_data)


class UserGroupSerializer(serializers.ModelSerializer):
    """Serializer for the UserGroup model."""

    class Meta:
        model = UserGroup
        fields = ['id', 'name', 'organization']
        read_only_fields = ['organization']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for the User model."""
    avatar_url = serializers.SerializerMethodField()
    file_size_quota_mb = serializers.SerializerMethodField()
    max_files_per_upload = serializers.SerializerMethodField()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._global_quota_mb = None
        self._max_files_per_upload = None

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name', 'role', 'organization',
            'avatar', 'avatar_url', 'language', 'date_joined', 'updated_at',
            'total_document_size', 'file_size_quota_mb', 'custom_file_size_quota_mb', 'max_files_per_upload',
            'is_superuser', 'is_active'
        ]
        read_only_fields = [
            'id', 'email', 'role', 'organization', 'date_joined', 'updated_at', 'avatar_url',
            'total_document_size', 'file_size_quota_mb', 'custom_file_size_quota_mb', 'max_files_per_upload',
            'is_superuser', 'is_active'
        ]
        extra_kwargs = {
            'avatar': {'write_only': True, 'required': False}
        }

    def validate_avatar(self, value):
        if not value:
            return value
        max_size_bytes = 2 * 1024 * 1024
        if hasattr(value, 'size') and value.size > max_size_bytes:
            raise serializers.ValidationError("Avatar file size cannot exceed 2 MB.")
        name = getattr(value, 'name', '') or ''
        ext = os.path.splitext(name)[1].lower().lstrip('.')
        allowed_extensions = ['png', 'jpg', 'jpeg', 'webp']
        if ext and ext not in allowed_extensions:
            raise serializers.ValidationError(
                f"Unsupported file extension '{ext}'. Allowed extensions are: {', '.join(allowed_extensions)}."
            )
        try:
            if hasattr(value, 'seek'):
                value.seek(0)
            img = Image.open(value)
            img.verify()
            if img.format not in ('PNG', 'JPEG', 'WEBP'):
                raise serializers.ValidationError(
                    f"Unsupported image format '{img.format}'. Allowed formats are PNG, JPEG, WEBP."
                )
            if hasattr(value, 'seek'):
                value.seek(0)
        except serializers.ValidationError:
            raise
        except Exception:
            raise serializers.ValidationError("Uploaded file is not a valid image.")
        return value


    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_avatar_url(self, obj) -> str:
        if obj.avatar and hasattr(obj.avatar, 'url'):
            return urljoin(settings.SITE_DOMAIN, obj.avatar.url)
        return None

    @extend_schema_field(serializers.IntegerField())
    def get_file_size_quota_mb(self, obj) -> int:
        if obj.custom_file_size_quota_mb is not None:
            return obj.custom_file_size_quota_mb
        if self._global_quota_mb is None:
            self._global_quota_mb = get_dynamic_setting('FILE_SIZE_QUOTA_MB')
        return self._global_quota_mb

    @extend_schema_field(serializers.IntegerField())
    def get_max_files_per_upload(self, obj) -> int:
        if self._max_files_per_upload is None:
            self._max_files_per_upload = get_dynamic_setting('MAX_FILES_PER_UPLOAD')
        return self._max_files_per_upload

    def create(self, validated_data):
        """
        Create and return a new user.
        """
        organization = validated_data.get('organization') or Organization.objects.first()
        if not organization:
            raise serializers.ValidationError("Server is not configured with a default organization.")
        validated_data['organization'] = organization
        if 'username' not in validated_data and 'email' in validated_data:
            validated_data['username'] = validated_data['email']
        return User.objects.create_user(**validated_data)

    def update(self, instance, validated_data):
        """
        Update user profile.
        Restricted administrative fields and passwords cannot be updated via self-service.
        """
        validated_data.pop('email', None)
        validated_data.pop('password', None)
        validated_data.pop('role', None)
        validated_data.pop('is_active', None)
        validated_data.pop('custom_file_size_quota_mb', None)
        return super().update(instance, validated_data)


class AdminUserSerializer(UserSerializer):
    """Serializer for admin management of organization users."""
    password = serializers.CharField(write_only=True, required=False)

    class Meta(UserSerializer.Meta):
        fields = [
            'id', 'email', 'name', 'role', 'organization', 'password',
            'avatar', 'avatar_url', 'language', 'date_joined', 'updated_at',
            'total_document_size', 'file_size_quota_mb', 'custom_file_size_quota_mb', 'max_files_per_upload',
            'is_superuser', 'is_active'
        ]
        read_only_fields = [
            'id', 'organization', 'date_joined', 'updated_at', 'avatar_url',
            'total_document_size', 'file_size_quota_mb', 'max_files_per_upload',
            'is_superuser'
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'avatar': {'write_only': True, 'required': False}
        }

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
        elif isinstance(data, dict):
            data = dict(data)
        if isinstance(data, dict) and 'custom_file_size_quota_mb' in data:
            val = data.get('custom_file_size_quota_mb')
            if val == '' or val is None or (isinstance(val, str) and not val.strip()):
                data['custom_file_size_quota_mb'] = None
        return super().to_internal_value(data)

    def validate_custom_file_size_quota_mb(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Custom file size quota cannot be negative.")
        return value

    def validate_password(self, value):
        try:
            password_validation.validate_password(value, self.instance)
        except ValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get('password'):
            raise serializers.ValidationError({'password': ['This field is required.']})
        return super().validate(attrs)

    def update(self, instance, validated_data):
        """
        Update user by admin. Password resets must use the dedicated reset-password action.
        """
        validated_data.pop('email', None)
        validated_data.pop('password', None)
        return super(UserSerializer, self).update(instance, validated_data)




class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change endpoint."""
    old_password = serializers.CharField(required=True)
    new_password1 = serializers.CharField(required=True)
    new_password2 = serializers.CharField(required=True)

    def validate(self, data):
        if data['new_password1'] != data['new_password2']:
            raise serializers.ValidationError({"new_password2": "The two password fields didn't match."})
        return data

    def validate_new_password1(self, value):
        try:
            password_validation.validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value


class AdminResetPasswordSerializer(serializers.Serializer):
    """Serializer for admin resetting a user's password."""
    password = serializers.CharField(write_only=True, required=True)

    def validate_password(self, value):
        user = self.context.get('user')
        try:
            password_validation.validate_password(value, user)
        except ValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def save(self):
        user = self.context['user']
        password = self.validated_data['password']
        with transaction.atomic():
            user.set_password(password)
            user.save(update_fields=['password', 'updated_at'])
            blacklist_all_user_tokens(user)

        return user


class SignupRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    name = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        try:
            password_validation.validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value


class SignupVerifySerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class SignupRequestAcceptedSerializer(serializers.Serializer):
    detail = serializers.CharField()


class SignupVerifyResponseSerializer(serializers.Serializer):
    user = UserSerializer()
    access = serializers.CharField()
    refresh = serializers.CharField()


class LoginActivitySerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    country = serializers.SerializerMethodField()
    city = serializers.SerializerMethodField()

    class Meta:
        model = LoginActivity
        fields = ['id', 'user_id', 'user_email', 'user_name', 'created_at', 'ip_address', 'user_agent', 'country', 'city']

    def _get_geoip_data(self, obj):
        if not hasattr(obj, '_geoip_data_cache'):
            data = {}
            if obj.ip_address and settings.GEOIP:
                try:
                    data = settings.GEOIP.city(obj.ip_address)
                except AddressNotFoundError:
                    pass
            setattr(obj, '_geoip_data_cache', data)
        return obj._geoip_data_cache

    @extend_schema_field(serializers.CharField())
    def get_country(self, obj) -> str:
        return self._get_geoip_data(obj).get('country_name', '')

    @extend_schema_field(serializers.CharField())
    def get_city(self, obj) -> str:
        return self._get_geoip_data(obj).get('city', '')


class AppConfigurationSerializer(serializers.ModelSerializer):
    """Serializer for the AppConfiguration model for admin use."""
    class Meta:
        model = AppConfiguration
        fields = ['key', 'value', 'description']
        read_only_fields = ['key', 'description']


class APIKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = APIKey
        fields = ['id', 'name', 'prefix', 'tier', 'created_at', 'expires_at', 'last_used_at']
        read_only_fields = ['id', 'prefix', 'created_at', 'last_used_at']


class APIKeyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    tier = serializers.ChoiceField(
        choices=[('read_only', 'Read Only'), ('read_write', 'Read & Write'), ('full_access', 'Full Access')],
        default='read_only'
    )
    expires_in_days = serializers.IntegerField(required=False, allow_null=True, min_value=1)

