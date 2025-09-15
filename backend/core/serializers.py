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

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name', 'role', 'organization', 'password',
            'avatar_url', 'date_joined', 'updated_at'
        ]
        read_only_fields = ['id', 'date_joined', 'updated_at']
        extra_kwargs = {'password': {'write_only': True, 'min_length': 8}}

    def create(self, validated_data):
        """
        Create and return a new user with an encrypted password.
        """
        validated_data['username'] = validated_data['email']
        return User.objects.create_user(**validated_data)

    def update(self, instance, validated_data):
        """
        Update user, setting the password correctly if provided.
        """
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)

        if password:
            user.set_password(password)
            user.save()

        return user
