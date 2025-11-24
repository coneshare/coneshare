from django.contrib.auth import get_user_model, logout
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import Organization, UserGroup
from core.serializers import (ChangePasswordSerializer, OrganizationSerializer,
                              UserGroupSerializer, UserSerializer)

User = get_user_model()


class IsSelfOrAdmin(permissions.BasePermission):
    """
    Permission to allow:
    - Admins to perform any action on users within their organization.
    - Non-admin users to view/edit their own profile.
    """
    def has_permission(self, request, view):
        # This check ensures the user is authenticated for any action.
        if not request.user.is_authenticated:
            return False
        # Only admins can create users.
        if view.action == 'create':
            return request.user.role == 'admin'
        return True

    def has_object_permission(self, request, view, obj):
        # Admins can do anything to users in their org, except delete themselves.
        if request.user.role == 'admin':
            if view.action == 'destroy' and obj == request.user:
                return False  # Admin cannot delete self.
            return obj.organization == request.user.organization

        # Non-admins can only view/edit their own profile.
        if view.action in ['retrieve', 'update', 'partial_update']:
            return obj == request.user
        return False


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows organizations to be viewed or edited.
    """
    queryset = Organization.objects.all().order_by('-created_at')
    serializer_class = OrganizationSerializer


class UserViewSet(mixins.CreateModelMixin,
                  mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin,
                  mixins.DestroyModelMixin,
                  mixins.ListModelMixin,
                  viewsets.GenericViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    - Admins can perform all CRUD operations on users in their organization.
    - Regular users can only view and edit their own profile.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsSelfOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        """
        Admins can see all users in their organization.
        Regular users can only see themselves.
        """
        user = self.request.user
        if user.role == 'admin':
            return User.objects.filter(organization=user.organization).order_by('-date_joined')
        return User.objects.filter(pk=user.pk)

    def perform_create(self, serializer):
        """
        When an admin creates a user, associate the user with the admin's organization.
        """
        serializer.save(organization=self.request.user.organization)


class UserGroupViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows user groups to be viewed or edited.
    """
    queryset = UserGroup.objects.all().order_by('name')
    serializer_class = UserGroupSerializer


class RegisterView(APIView):
    def post(self, request):
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SetPasswordView(APIView):
    """View to set a user's password."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            old_password = serializer.validated_data['old_password']

            if not user.check_password(old_password):
                return Response({"old_password": ["Wrong password."]}, status=status.HTTP_400_BAD_REQUEST)

            user.set_password(serializer.validated_data['new_password1'])
            user.save()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            logout(request)
            return Response(status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response(status=status.HTTP_400_BAD_REQUEST)
