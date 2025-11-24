from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .admin_views import AdminSettingsViewSet, AdminUserViewSet

router = DefaultRouter()
router.register(r'settings', AdminSettingsViewSet, basename='admin-settings')
router.register(r'users', AdminUserViewSet, basename='admin-user')

urlpatterns = [
    path('', include(router.urls)),
]
