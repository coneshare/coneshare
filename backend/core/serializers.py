from urllib.parse import urljoin

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from geoip2.errors import AddressNotFoundError
from rest_framework import serializers

from core.models import AppConfiguration, LoginActivity, Organization, UserGroup
from core.services import get_dynamic_setting

User = get_user_model()


class OrganizationSerializer(serializers.ModelSerializer):
    """Serializer for the Organization model."""

    class Meta:
        model = Organization
        fields = ['id', 'name', 'plan', 'stripe_customer_id', 'created_at', 'updated_at']
        read_only_fields = ['id', 'plan', 'stripe_customer_id', 'created_at', 'updated_at']


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

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name', 'role', 'organization', 'password',
            'avatar', 'avatar_url', 'date_joined', 'updated_at',
            'total_document_size', 'file_size_quota_mb', 'max_files_per_upload',
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

    def get_avatar_url(self, obj):
        if obj.avatar and hasattr(obj.avatar, 'url'):
            return urljoin(settings.SITE_DOMAIN, obj.avatar.url)
        return None

    def get_file_size_quota_mb(self, obj):
        return get_dynamic_setting('FILE_SIZE_QUOTA_MB')

    def get_max_files_per_upload(self, obj):
        return get_dynamic_setting('MAX_FILES_PER_UPLOAD')

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


class LoginActivitySerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)
    country = serializers.SerializerMethodField()
    city = serializers.SerializerMethodField()

    class Meta:
        model = LoginActivity
        fields = ['id', 'user_email', 'user_name', 'created_at', 'ip_address', 'user_agent', 'country', 'city']

    def get_country(self, obj):
        if obj.ip_address and settings.GEOIP:
            try:
                return settings.GEOIP.city(obj.ip_address).get('country_name', '')
            except AddressNotFoundError:
                pass
        return ''

    def get_city(self, obj):
        if obj.ip_address and settings.GEOIP:
            try:
                return settings.GEOIP.city(obj.ip_address).get('city', '')
            except AddressNotFoundError:
                pass
        return ''


class AppConfigurationSerializer(serializers.ModelSerializer):
    """Serializer for the AppConfiguration model for admin use."""
    class Meta:
        model = AppConfiguration
        fields = ['key', 'value', 'description']
        read_only_fields = ['key', 'description']
