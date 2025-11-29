from django.contrib.auth import get_user_model, logout
from django.core.cache import cache
from django.db import connections
from django.db.utils import OperationalError
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


class UserViewSet(mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin,
                  mixins.ListModelMixin,
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


class HealthCheckView(APIView):
    """
    Checks the health of the database and Redis cache.
    Used by Docker for health checks.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        db_ok = False
        try:
            connections['default'].cursor()
            db_ok = True
        except OperationalError:
            pass

        redis_ok = False
        try:
            cache.set('__health_check__', '1', 1)
            redis_ok = cache.get('__health_check__') == '1'
        except Exception:
            pass

        health_status = {
            'database': 'ok' if db_ok else 'error',
            'redis': 'ok' if redis_ok else 'error'
        }

        if db_ok and redis_ok:
            return Response(health_status, status=status.HTTP_200_OK)

        return Response(health_status, status=status.HTTP_503_SERVICE_UNAVAILABLE)
