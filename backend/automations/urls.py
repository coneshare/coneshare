from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (AutomationAssignmentViewSet, AutomationDeliveryViewSet,
                    AutomationDestinationViewSet, AutomationRuleViewSet)

router = DefaultRouter()
router.register(r'automations', AutomationRuleViewSet, basename='automation-rule')
router.register(r'automation-destinations', AutomationDestinationViewSet, basename='automation-destination')
router.register(r'automation-deliveries', AutomationDeliveryViewSet, basename='automation-delivery')
router.register(r'automation-assignments', AutomationAssignmentViewSet, basename='automation-assignment')

urlpatterns = [
    path('', include(router.urls)),
]
