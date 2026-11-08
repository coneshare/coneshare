from rest_framework.routers import DefaultRouter
from .admin_views import AdminShareLinkViewSet

router = DefaultRouter()
router.register(r'', AdminShareLinkViewSet, basename='admin-sharelink')

urlpatterns = router.urls
