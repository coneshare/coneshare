from django.contrib.auth import get_user_model, logout
from django.contrib.auth.signals import user_logged_in
from django.core.exceptions import ValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.conf import settings
from django.core.cache import cache
from django.db import connections
from django.db import transaction
from django.db import IntegrityError
from django.db.utils import OperationalError
from django.utils.encoding import force_bytes
from django.utils import timezone
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from core.models import Organization, UserGroup
from core.services import get_dynamic_setting
from core.serializers import (ChangePasswordSerializer, OrganizationSerializer,
                              SignupRequestAcceptedSerializer,
                              SignupRequestSerializer, SignupVerifyResponseSerializer,
                              SignupVerifySerializer, UserGroupSerializer, UserSerializer)
from core.tasks import send_signup_verification_email_task
from core.tokens import signup_activation_token_generator

User = get_user_model()


class IsSelf(permissions.BasePermission):
    """
    Object-level permission to only allow users to edit their own profile.
    """
    def has_object_permission(self, request, view, obj):
        # Any user can access their own profile.
        return obj == request.user


@extend_schema(tags=['core'])
class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows organizations to be viewed or edited.
    """
    queryset = Organization.objects.all().order_by('-created_at')
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]


@extend_schema(tags=['core'])
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


@extend_schema(tags=['core'])
class UserGroupViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows user groups to be viewed or edited.
    """
    queryset = UserGroup.objects.all().order_by('name')
    serializer_class = UserGroupSerializer
    permission_classes = [IsAuthenticated]


@extend_schema(tags=['core'])
class CustomTokenObtainPairView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        user_logged_in.send(sender=serializer.user.__class__, request=request, user=serializer.user)

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


# @extend_schema(tags=['core'])
# class RegisterView(APIView):
#     permission_classes = [permissions.AllowAny]

#     @extend_schema(
#         request=UserSerializer,
#         responses={201: UserSerializer, 400: dict},
#     )
#     def post(self, request):
#         serializer = UserSerializer(data=request.data)
#         if serializer.is_valid():
#             serializer.save()
#             return Response(serializer.data, status=status.HTTP_201_CREATED)
#         return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(tags=['core'])
class SignupRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'signup'

    @extend_schema(
        request=SignupRequestSerializer,
        responses={202: SignupRequestAcceptedSerializer, 400: dict, 403: dict},
    )
    def post(self, request):
        if not get_dynamic_setting('ENABLE_PUBLIC_SIGNUP'):
            return Response({"detail": "Public signup is disabled."}, status=status.HTTP_403_FORBIDDEN)

        serializer = SignupRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        # Always return an accepted response to avoid account enumeration.
        accepted_response = Response(
            {"detail": "If this email is valid, a verification email has been sent."},
            status=status.HTTP_202_ACCEPTED
        )

        try:
            with transaction.atomic():
                user = User.objects.select_for_update().filter(email=email).first()
                if not user:
                    organization = Organization.objects.first()
                    if not organization:
                        return Response(
                            {"detail": "Server is not configured with a default organization."},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR
                        )
                    user = User.objects.create_user(
                        username=email,
                        email=email,
                        password=serializer.validated_data['password'],
                        name=serializer.validated_data.get('name', ''),
                        organization=organization,
                        is_active=False,
                    )
                elif not user.is_active:
                    user.set_password(serializer.validated_data['password'])
                    user.name = serializer.validated_data.get('name', '')
                    user.updated_at = timezone.now()
                    user.save(update_fields=['password', 'name', 'updated_at'])
                else:
                    return accepted_response

                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = signup_activation_token_generator.make_token(user)
                verify_url = f"{settings.SITE_DOMAIN.rstrip('/')}/signup/verify?uid={uid}&token={token}"
                transaction.on_commit(
                    lambda: send_signup_verification_email_task.delay(email=email, verify_url=verify_url)
                )
        except IntegrityError:
            # Concurrent request may create the same email first.
            return accepted_response

        return accepted_response


@extend_schema(tags=['core'])
class SignupVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'signup'

    @extend_schema(
        request=SignupVerifySerializer,
        responses={200: SignupVerifyResponseSerializer, 400: dict, 403: dict},
    )
    def post(self, request):
        if not get_dynamic_setting('ENABLE_PUBLIC_SIGNUP'):
            return Response({"detail": "Public signup is disabled."}, status=status.HTTP_403_FORBIDDEN)

        serializer = SignupVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uid = serializer.validated_data['uid']
        token = serializer.validated_data['token']

        with transaction.atomic():
            try:
                user_id = force_str(urlsafe_base64_decode(uid))
                user = User.objects.select_for_update().get(pk=user_id)
            except (TypeError, ValueError, OverflowError, ValidationError, User.DoesNotExist):
                return Response({"detail": "Invalid verification link."}, status=status.HTTP_400_BAD_REQUEST)

            if user.is_active:
                return Response({"detail": "Account is already verified."}, status=status.HTTP_400_BAD_REQUEST)
            if not signup_activation_token_generator.check_token(user, token):
                return Response({"detail": "Invalid verification link."}, status=status.HTTP_400_BAD_REQUEST)

            user.is_active = True
            user.updated_at = timezone.now()
            user.save(update_fields=['is_active', 'updated_at'])

        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user, context={'request': request}).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=status.HTTP_200_OK)


@extend_schema(tags=['core'])
class SetPasswordView(APIView):
    """View to set a user's password."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={204: None, 400: dict},
    )
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


@extend_schema(tags=['core'])
class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    class LogoutRequestSerializer(serializers.Serializer):
        refresh = serializers.CharField()

    @extend_schema(
        request=LogoutRequestSerializer,
        responses={205: None, 400: dict},
    )
    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            logout(request)
            return Response(status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response(status=status.HTTP_400_BAD_REQUEST)




@extend_schema(tags=['core'])
class PublicSettingsView(APIView):
    permission_classes = [permissions.AllowAny]

    class PublicSettingsResponseSerializer(serializers.Serializer):
        enable_public_signup = serializers.BooleanField()

    @extend_schema(responses={200: PublicSettingsResponseSerializer})
    def get(self, request):
        return Response({
            'enable_public_signup': get_dynamic_setting('ENABLE_PUBLIC_SIGNUP')
        }, status=status.HTTP_200_OK)


@extend_schema(tags=['core'])
class HealthCheckView(APIView):
    """
    Checks the health of the database and Redis cache.
    Used by Docker for health checks.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'health_check'

    class HealthResponseSerializer(serializers.Serializer):
        database = serializers.CharField()
        redis = serializers.CharField()

    @extend_schema(
        responses={200: HealthResponseSerializer, 503: HealthResponseSerializer},
    )
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
