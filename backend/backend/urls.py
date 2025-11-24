"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView
from rest_framework_simplejwt.views import (TokenObtainPairView,
                                            TokenRefreshView)

from core.views import LogoutView, RegisterView, SetPasswordView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api-auth/', include('rest_framework.urls')),
    path('api/v1/register/', RegisterView.as_view(), name='register'),
    path('api/v1/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/logout/', LogoutView.as_view(), name='logout'),
    path('api/v1/users/set-password/', SetPasswordView.as_view(), name='set_password'),
    path('api/v1/', include('core.urls')),
    path('api/v1/', include('documents.urls')),
    path('api/v1/', include('sharelinks.urls')),
    path('api/v1/', include('datarooms.urls')),
    path('api/v1/', include('analytics.urls')),
    path('api/v1/cloud/', include('cloudfiles.urls')),
    path('api/v1/admin/', include('core.admin_urls')),

]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# This catch-all route serves the React app for any non-API path.
# It must be the last URL pattern in the list.
urlpatterns.append(re_path(r'^(?:.*)/?$', TemplateView.as_view(template_name="index.html")))
