from django.urls import path

from . import views

urlpatterns = [
    path('providers/', views.CloudProviderListView.as_view(), name='cloud-provider-list'),
    path('connections/', views.CloudConnectionListView.as_view(), name='cloud-connection-list'),
    path('connections/<str:connection_id>/', views.CloudConnectionDetailView.as_view(), name='cloud-connection-detail'),
    path('connect/<str:provider_name>/', views.CloudConnectView.as_view(), name='cloud-oauth-connect'),
    path('callback/<str:provider_name>/', views.CloudCallbackView.as_view(), name='cloud-oauth-callback'),
    path('connections/<str:connection_id>/list/', views.CloudFileListView.as_view(), name='cloud-file-list'),
    path('connections/<str:connection_id>/folders/', views.CloudFolderListView.as_view(), name='cloud-folder-list'),
    path('connections/<str:connection_id>/import/', views.CloudImportView.as_view(), name='cloud-import'),
    path('documents/<str:document_id>/refresh/', views.CloudRefreshView.as_view(), name='cloud-document-refresh'),
    path('documents/<str:document_id>/import_version/', views.CloudImportVersionView.as_view(), name='cloud-document-import-version'),
]
