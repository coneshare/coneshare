from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    FileRequestViewSet,
    PublicFileRequestView,
    FileRequestUploadRequestView,
    FileRequestUploadFinalizeView,
)

router = DefaultRouter()
router.register(r'file-requests', FileRequestViewSet, basename='file-request')

urlpatterns = [
    path('', include(router.urls)),
    path('public/file-requests/<slug:slug>/', PublicFileRequestView.as_view(), name='public-file-request-detail'),
    path('public/file-requests/<slug:slug>/request-upload/', FileRequestUploadRequestView.as_view(), name='public-file-request-upload-request'),
    path('public/file-requests/<slug:slug>/finalize-upload/', FileRequestUploadFinalizeView.as_view(), name='public-file-request-finalize-upload'),
]
