from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from documents.views import StandardResultsSetPagination

from .models import (AutomationAssignment, AutomationDelivery, AutomationDestination,
                     AutomationRule)
from .serializers import (AutomationAssignmentSerializer,
                          AutomationDeliverySerializer,
                          AutomationDestinationSerializer,
                          AutomationRuleSerializer)
from .tasks import deliver_automation_delivery_task


@extend_schema(tags=['automations'])
class AutomationDestinationViewSet(viewsets.ModelViewSet):
    # Dummy queryset for OpenAPI schema generation to infer lookup field type without executing get_queryset().
    queryset = AutomationDestination.objects.none()
    serializer_class = AutomationDestinationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AutomationDestination.objects.filter(
            organization=self.request.user.organization,
            created_by=self.request.user,
        )

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization, created_by=self.request.user)


@extend_schema(tags=['automations'])
class AutomationRuleViewSet(viewsets.ModelViewSet):
    # Dummy queryset for OpenAPI schema generation to infer lookup field type without executing get_queryset().
    queryset = AutomationRule.objects.none()
    serializer_class = AutomationRuleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AutomationRule.objects.filter(
            organization=self.request.user.organization,
            created_by=self.request.user,
        ).prefetch_related('destinations')

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization, created_by=self.request.user)


@extend_schema(tags=['automations'])
class AutomationDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    # Dummy queryset for OpenAPI schema generation to infer lookup field type without executing get_queryset().
    queryset = AutomationDelivery.objects.none()
    serializer_class = AutomationDeliverySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = AutomationDelivery.objects.filter(
            organization=self.request.user.organization,
            rule__created_by=self.request.user,
        ).select_related('rule', 'destination')
        rule_id = self.request.query_params.get('rule_id')
        destination_id = self.request.query_params.get('destination_id')
        if rule_id:
            queryset = queryset.filter(rule_id=rule_id)
        if destination_id:
            queryset = queryset.filter(destination_id=destination_id)
        return queryset

    @action(detail=True, methods=['post'], url_path='replay')
    def replay(self, request, pk=None):
        delivery = self.get_object()
        delivery.status = AutomationDelivery.Status.PENDING
        delivery.response_code = None
        delivery.response_body_excerpt = ''
        delivery.next_retry_at = None
        delivery.delivered_at = None
        delivery.attempt_count = 0
        delivery.save(
            update_fields=[
                'status',
                'response_code',
                'response_body_excerpt',
                'next_retry_at',
                'delivered_at',
                'attempt_count',
                'updated_at',
            ]
        )
        deliver_automation_delivery_task.delay(str(delivery.id))
        return Response({'detail': 'Delivery replay queued.'}, status=status.HTTP_202_ACCEPTED)


@extend_schema(tags=['automations'])
class AutomationAssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    # Dummy queryset for OpenAPI schema generation to infer lookup field type without executing get_queryset().
    queryset = AutomationAssignment.objects.none()
    serializer_class = AutomationAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return AutomationAssignment.objects.filter(
            organization=self.request.user.organization,
            assigned_by_rule__created_by=self.request.user,
        ).select_related('delivery', 'assigned_user', 'assigned_by_rule')
