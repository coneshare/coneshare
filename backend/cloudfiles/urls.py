from django.urls import path

from . import views

urlpatterns = [
    path('providers/', views.CloudProviderListView.as_view(), name='cloud-provider-list'),
    path('connections/', views.CloudConnectionListView.as_view(), name='cloud-connection-list'),
    path('connect/<str:provider_name>/', views.CloudConnectView.as_view(), name='cloud-oauth-connect'),
    path('callback/<str:provider_name>/', views.CloudCallbackView.as_view(), name='cloud-oauth-callback'),
    path('connections/<str:connection_id>/list/', views.CloudFileListView.as_view(), name='cloud-file-list'),
    path('connections/<str:connection_id>/import/', views.CloudImportView.as_view(), name='cloud-import'),
]
