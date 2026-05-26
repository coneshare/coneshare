from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .admin_views import (AdminLoginActivityViewSet, AdminSettingsViewSet,
                          AdminSecurityThreatEventViewSet, AdminUserViewSet)

router = DefaultRouter()
router.register(r'settings', AdminSettingsViewSet, basename='admin-settings')
router.register(r'users', AdminUserViewSet, basename='admin-user')
router.register(r'login-activities', AdminLoginActivityViewSet, basename='admin-login-activity')
router.register(r'security-threat-events', AdminSecurityThreatEventViewSet, basename='admin-security-threat-event')

urlpatterns = [
    path('', include(router.urls)),
]
