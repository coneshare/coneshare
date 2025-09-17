from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'folders', views.FolderViewSet)
router.register(r'documents', views.DocumentViewSet)
router.register(r'share-link-presets', views.ShareLinkPresetViewSet)
router.register(r'share-links', views.ShareLinkViewSet)
router.register(r'viewers', views.ViewerViewSet)
router.register(r'views', views.ViewViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('uploads/document/', views.DocumentUploadView.as_view(), name='document-upload'),
    path('documents/<str:document_id>/versions/', views.DocumentVersionUploadView.as_view(), name='document-version-upload'),
    path('documents/<str:document_id>/preview-data/', views.DocumentPreviewDataView.as_view(), name='document-preview-data'),
    path('links/<slug:slug>/view-data/', views.ShareLinkViewDataView.as_view(), name='share-link-view-data'),
]
