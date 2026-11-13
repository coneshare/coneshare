from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'requests', views.SignatureRequestViewSet, basename='signature-request')

urlpatterns = [
    path('sign/<str:request_id>/exchange-token/', views.SignerExchangeTokenView.as_view(), name='esign-exchange-token'),
    path('sign/<str:request_id>/', views.SignerSessionDetailView.as_view(), name='esign-signer-session'),
    path('sign/<str:request_id>/pdf/', views.SignerDocumentPdfView.as_view(), name='esign-signer-pdf'),
    path('sign/<str:request_id>/submit/', views.SignerSubmitView.as_view(), name='esign-signer-submit'),
    path('sign/<str:request_id>/decline/', views.SignerDeclineView.as_view(), name='esign-signer-decline'),
    path('sign/<str:request_id>/page-views/', views.SignerPageViewRecordView.as_view(), name='esign-signer-page-views'),
    path('sign/<str:request_id>/download/', views.SignerExecutedDownloadView.as_view(), name='esign-signer-download'),
    path('', include(router.urls)),
]
