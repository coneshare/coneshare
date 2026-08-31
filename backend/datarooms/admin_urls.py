from rest_framework.routers import DefaultRouter
from .admin_views import AdminDataroomViewSet

router = DefaultRouter()
router.register(r'', AdminDataroomViewSet, basename='admin-dataroom')

urlpatterns = router.urls
