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
    path('folders/from_path/', views.FolderFromPathView.as_view(), name='folder-from-path'),
    path('uploads/document/', views.DocumentUploadView.as_view(), name='document-upload'),
    path('documents/<str:document_id>/versions/', views.DocumentVersionUploadView.as_view(), name='document-version-upload'),
    path('documents/<str:document_id>/preview-data/', views.DocumentPreviewDataView.as_view(), name='document-preview-data'),
    path('links/<slug:slug>/verify-password/', views.ShareLinkVerifyPasswordView.as_view(), name='share-link-verify-password'),
    path('links/<slug:slug>/view-data/', views.ShareLinkViewDataView.as_view(), name='share-link-view-data'),
    path('page-views/record/', views.RecordPageView.as_view(), name='record-page-view'),

    path('', include(router.urls)),
]
