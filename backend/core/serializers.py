from urllib.parse import urljoin

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from geoip2.errors import AddressNotFoundError
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from core.models import AppConfiguration, LoginActivity, Organization, UserGroup
from core.services import get_dynamic_setting

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
            'id', 'email', 'name', 'role', 'organization', 'password',
            'avatar', 'avatar_url', 'date_joined', 'updated_at',
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

    def create(self, validated_data):
        """
        Create and return a new user with an encrypted password.
        """
        organization = Organization.objects.first()
        if not organization:
            raise serializers.ValidationError("Server is not configured with a default organization.")
        validated_data['organization'] = organization
        validated_data['username'] = validated_data.get('email')
        return User.objects.create_user(**validated_data)

    def update(self, instance, validated_data):
        """
        Update user, setting the password correctly if provided.
        The user's email address cannot be changed.
        """
        validated_data.pop('email', None)  # Prevent email from being updated
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)

        if password:
            user.set_password(password)
            user.save()

        return user


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
