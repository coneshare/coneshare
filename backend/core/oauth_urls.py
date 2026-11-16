from django.urls import path
from oauth2_provider import views as oauth2_views

from core.oauth_views import (OAuthConsentView, OAuthTokenVerifyView,
                              ThrottledDynamicClientRegistrationManagementView,
                              ThrottledDynamicClientRegistrationView)

urlpatterns = [
    path('token/', oauth2_views.TokenView.as_view(), name='token'),
    path('revoke_token/', oauth2_views.RevokeTokenView.as_view(), name='revoke-token'),
    path('introspect/', oauth2_views.IntrospectTokenView.as_view(), name='introspect'),
    path('register/', ThrottledDynamicClientRegistrationView.as_view(), name='dcr-register'),
    path(
        'register/<str:client_id>/',
        ThrottledDynamicClientRegistrationManagementView.as_view(),
        name='dcr-register-management',
    ),
    path('consent/', OAuthConsentView.as_view(), name='consent'),
    path('verify/', OAuthTokenVerifyView.as_view(), name='verify'),
]
