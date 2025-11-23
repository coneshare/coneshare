from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .admin_views import AdminSettingsViewSet

router = DefaultRouter()
router.register(r'settings', AdminSettingsViewSet, basename='admin-settings')

urlpatterns = [
    path('', include(router.urls)),
]
