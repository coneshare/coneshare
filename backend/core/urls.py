from django.urls import include, path
from rest_framework.routers import DefaultRouter

from core import views

router = DefaultRouter()
router.register(r'organizations', views.OrganizationViewSet)
router.register(r'users', views.UserViewSet)
router.register(r'groups', views.UserGroupViewSet)

urlpatterns = [
    path('_health/', views.HealthCheckView.as_view(), name='health-check'),
    path('', include(router.urls)),
]
