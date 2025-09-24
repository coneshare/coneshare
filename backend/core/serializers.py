from django.contrib.auth import get_user_model
from rest_framework import serializers

from core.models import Organization, UserGroup

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

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name', 'role', 'organization', 'password',
            'avatar', 'avatar_url', 'date_joined', 'updated_at'
        ]
        read_only_fields = ['id', 'organization', 'date_joined', 'updated_at', 'avatar_url']
        extra_kwargs = {
            'password': {'write_only': True, 'min_length': 8, 'required': False},
            'avatar': {'write_only': True, 'required': False}
        }

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if obj.avatar and hasattr(obj.avatar, 'url') and request:
            return request.build_absolute_uri(obj.avatar.url)
        return None

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
