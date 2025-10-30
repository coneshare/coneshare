from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'datarooms', views.DataroomViewSet)
router.register(r'dataroom-folders', views.DataroomFolderViewSet)

urlpatterns = router.urls

urlpatterns += [
    path(
        'public/datarooms/view/<slug:slug>/',
        views.PublicDataroomDataView.as_view(),
        name='public-dataroom-data'
    ),
]
