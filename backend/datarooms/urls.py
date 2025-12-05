from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'datarooms', views.DataroomViewSet)
router.register(r'dataroom-folders', views.DataroomFolderViewSet)
router.register(r'dataroom-documents', views.DataroomDocumentViewSet)

urlpatterns = router.urls
