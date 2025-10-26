from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'datarooms', views.DataroomViewSet)

urlpatterns = router.urls
