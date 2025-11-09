from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'folders', views.FolderViewSet)
router.register(r'documents', views.DocumentViewSet)

urlpatterns = [
    path('folders/ensure-paths/', views.EnsureFolderPathsView.as_view(), name='folder-ensure-paths'),
    path('uploads/document/', views.DocumentUploadView.as_view(), name='document-upload'),
    path('documents/<str:document_id>/versions/', views.DocumentVersionUploadView.as_view(), name='document-version-upload'),
    path('documents/<str:document_id>/preview-data/', views.DocumentPreviewDataView.as_view(), name='document-preview-data'),
    path('actions/move/', views.MoveItemsView.as_view(), name='move-items'),

    path('', include(router.urls)),
]
