from django.urls import path

from . import views

urlpatterns = [
    path('providers/', views.CloudProviderListView.as_view(), name='cloud-provider-list'),
    path('connections/', views.CloudConnectionListView.as_view(), name='cloud-connection-list'),
    path('connect/dropbox/', views.DropboxConnectView.as_view(), name='dropbox-oauth-connect'),
    path('callback/dropbox/', views.DropboxCallbackView.as_view(), name='dropbox-oauth-callback'),
    path('connect/google_drive/', views.GoogleDriveConnectView.as_view(), name='google-drive-oauth-connect'),
    path('callback/google_drive/', views.GoogleDriveCallbackView.as_view(), name='google-drive-oauth-callback'),
    path('connections/<str:connection_id>/list/', views.CloudFileListView.as_view(), name='cloud-file-list'),
    path('connections/<str:connection_id>/import/', views.CloudImportView.as_view(), name='cloud-import'),
]
