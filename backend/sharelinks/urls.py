from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'share-link-presets', views.ShareLinkPresetViewSet)
router.register(r'share-links', views.ShareLinkViewSet)
router.register(r'viewers', views.ViewerViewSet)
router.register(r'view-sessions', views.ViewSessionViewSet, basename='viewsession')

urlpatterns = [
    path('links/<slug:slug>/verify-password/', views.ShareLinkVerifyPasswordView.as_view(), name='share-link-verify-password'),
    path('links/<slug:slug>/request-access/', views.ShareLinkRequestAccessView.as_view(), name='share-link-request-access'),
    path('links/<slug:slug>/view-data/', views.ShareLinkViewDataView.as_view(), name='share-link-view-data'),
    path('links/<slug:slug>/page/<int:page_number>/', views.ShareLinkPageView.as_view(), name='sharelink-page'),
    path('links/<slug:slug>/render-page/<int:page_number>/', views.WatermarkedPageRenderView.as_view(), name='watermarked-page-render'),
    path('links/<slug:slug>/download/', views.WatermarkedFileDownloadView.as_view(), name='watermarked-file-download'),
    path('links/<slug:slug>/download-folder/<str:folder_id>/', views.DataroomFolderDownloadView.as_view(), name='dataroom-folder-download'),
    path('page-views/record/', views.RecordPageView.as_view(), name='record-page-view'),

    path('', include(router.urls)),
]
