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


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to admin users.
    """
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsSelf(permissions.BasePermission):
    """
    Object-level permission to only allow users to edit their own profile.
    """
    def has_object_permission(self, request, view, obj):
        # Any user can access their own profile.
        return obj == request.user


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows organizations to be viewed or edited.
    """
    queryset = Organization.objects.all().order_by('-created_at')
    serializer_class = OrganizationSerializer


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    API endpoint for admins to manage users in their organization.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

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

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance == request.user:
            return Response({"detail": "Admins cannot delete their own account."}, status=status.HTTP_400_BAD_REQUEST)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin,
                  viewsets.GenericViewSet):
    """
    API endpoint that allows a user to view and edit their own profile.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsSelf]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        """
        Users can only see/edit themselves.
        """
        return User.objects.filter(pk=self.request.user.pk)


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
