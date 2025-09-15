from django.contrib.auth import get_user_model
from rest_framework import viewsets

from core.models import Organization, UserGroup
from core.serializers import (OrganizationSerializer, UserGroupSerializer,
                              UserSerializer)

User = get_user_model()


class OrganizationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows organizations to be viewed or edited.
    """
    queryset = Organization.objects.all().order_by('-created_at')
    serializer_class = OrganizationSerializer


class UserViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer


class UserGroupViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows user groups to be viewed or edited.
    """
    queryset = UserGroup.objects.all().order_by('name')
    serializer_class = UserGroupSerializer
