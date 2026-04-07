from rest_framework import permissions, viewsets

from .models import (AutomationAssignment, AutomationDelivery, AutomationDestination,
                     AutomationRule)
from .serializers import (AutomationAssignmentSerializer,
                          AutomationDeliverySerializer,
                          AutomationDestinationSerializer,
                          AutomationRuleSerializer)


class AutomationDestinationViewSet(viewsets.ModelViewSet):
    serializer_class = AutomationDestinationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AutomationDestination.objects.filter(organization=self.request.user.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization, created_by=self.request.user)


class AutomationRuleViewSet(viewsets.ModelViewSet):
    serializer_class = AutomationRuleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AutomationRule.objects.filter(organization=self.request.user.organization).prefetch_related('destinations')

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization, created_by=self.request.user)


class AutomationDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AutomationDeliverySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = AutomationDelivery.objects.filter(organization=self.request.user.organization).select_related(
            'rule', 'destination'
        )
        rule_id = self.request.query_params.get('rule_id')
        if rule_id:
            queryset = queryset.filter(rule_id=rule_id)
        return queryset


class AutomationAssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AutomationAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AutomationAssignment.objects.filter(organization=self.request.user.organization).select_related(
            'delivery', 'assigned_user', 'assigned_by_rule'
        )
