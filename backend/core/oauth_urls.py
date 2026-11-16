from django.urls import path
from oauth2_provider import views as oauth2_views

from core.oauth_views import (OAuthConsentView, OAuthTokenVerifyView,
                              ThrottledDynamicClientRegistrationManagementView,
                              ThrottledDynamicClientRegistrationView,
                              require_oauth_enabled)

urlpatterns = [
    path('token/', require_oauth_enabled(oauth2_views.TokenView.as_view()), name='token'),
    path('revoke_token/', require_oauth_enabled(oauth2_views.RevokeTokenView.as_view()), name='revoke-token'),
    path('introspect/', require_oauth_enabled(oauth2_views.IntrospectTokenView.as_view()), name='introspect'),
    path('register/', require_oauth_enabled(ThrottledDynamicClientRegistrationView.as_view()), name='dcr-register'),
    path(
        'register/<str:client_id>/',
        require_oauth_enabled(ThrottledDynamicClientRegistrationManagementView.as_view()),
        name='dcr-register-management',
    ),
    path('consent/', require_oauth_enabled(OAuthConsentView.as_view()), name='consent'),
    path('verify/', require_oauth_enabled(OAuthTokenVerifyView.as_view()), name='verify'),
]
