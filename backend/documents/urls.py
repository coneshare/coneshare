from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'folders', views.FolderViewSet)
router.register(r'documents', views.DocumentViewSet)
router.register(r'trash', views.TrashViewSet, basename='trash')

urlpatterns = [
    path('folders/ensure-paths/', views.EnsureFolderPathsView.as_view(), name='folder-ensure-paths'),
    path('uploads/document/request/', views.DocumentUploadRequestView.as_view(), name='document-upload-request'),
    path('uploads/document/finalize/', views.DocumentUploadFinalizeView.as_view(), name='document-upload-finalize'),
    path('uploads/document/<str:document_id>/versions/request/', views.DocumentVersionUploadRequestView.as_view(), name='document-version-upload-request'),
    path('uploads/document/<str:document_id>/versions/finalize/', views.DocumentVersionUploadFinalizeView.as_view(), name='document-version-upload-finalize'),
    path('documents/<str:document_id>/preview-data/', views.DocumentPreviewDataView.as_view(), name='document-preview-data'),
    path('documents/<str:document_id>/download/', views.DocumentDownloadView.as_view(), name='document-download'),
    path('actions/move/', views.MoveItemsView.as_view(), name='move-items'),
    path('folders/root/', views.RootFolderView.as_view(), name='root-folder-detail'),

    path('', include(router.urls)),
]
