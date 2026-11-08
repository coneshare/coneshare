from django.db.models import Count, F, Max, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema

from core.pagination import AdminPagination
from core.permissions import APIKeyTierPermission, IsAdmin
from .models import ShareLink
from .admin_serializers import (
    AdminShareLinkListSerializer,
    AdminShareLinkDetailSerializer,
    AdminShareLinkUpdateSerializer,
)


@extend_schema(tags=['admin-links'])
class AdminShareLinkViewSet(
    viewsets.GenericViewSet,
    viewsets.mixins.ListModelMixin,
    viewsets.mixins.RetrieveModelMixin,
    viewsets.mixins.UpdateModelMixin,
    viewsets.mixins.DestroyModelMixin,
):
    """
    Administrative endpoint for organization-wide share link auditing and compliance.
    Allows org admins to monitor all links, inspect view sessions, toggle activation (revoke),
    and delete links across the tenant.
    """
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyTierPermission]
    pagination_class = AdminPagination

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AdminShareLinkDetailSerializer
        if self.action in ['update', 'partial_update']:
            return AdminShareLinkUpdateSerializer
        return AdminShareLinkListSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated or not getattr(user, 'organization_id', None):
            return ShareLink.objects.none()

        org = user.organization
        now = timezone.now()

        qs = ShareLink.objects.filter(
            Q(document__organization=org) | Q(dataroom__organization=org)
        ).select_related(
            'document', 'dataroom', 'created_by'
        ).annotate(
            view_count=Count('view_sessions', distinct=True),
            last_viewed_at=Max('view_sessions__viewed_at')
        )

        # Filters
        query = self.request.query_params.get('search') or self.request.query_params.get('q')
        if query:
            query = query.strip()
            qs = qs.filter(
                Q(name__icontains=query) |
                Q(slug__icontains=query) |
                Q(document__name__icontains=query) |
                Q(dataroom__name__icontains=query) |
                Q(created_by__name__icontains=query) |
                Q(created_by__email__icontains=query)
            )

        target_type = self.request.query_params.get('target_type')
        if target_type == 'document':
            qs = qs.filter(document__isnull=False)
        elif target_type == 'dataroom':
            qs = qs.filter(dataroom__isnull=False)

        created_by = self.request.query_params.get('created_by')
        if created_by:
            qs = qs.filter(created_by_id=created_by)

        status_param = self.request.query_params.get('status')
        if status_param == 'active':
            qs = qs.filter(is_active=True).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        elif status_param == 'revoked':
            qs = qs.filter(is_active=False)
        elif status_param == 'expired':
            qs = qs.filter(is_active=True, expires_at__lte=now)

        # Sorting
        sort_field = self.request.query_params.get('sort_by') or self.request.query_params.get('sort') or 'created_at'
        sort_direction = self.request.query_params.get('order') or self.request.query_params.get('direction') or 'desc'

        sort_map = {
            'created_at': 'created_at',
            'created': 'created_at',
            'updated_at': 'updated_at',
            'name': 'name',
            'view_count': 'view_count',
            'last_viewed_at': 'last_viewed_at',
            'expires_at': 'expires_at',
        }
        order_key = sort_map.get(sort_field, 'created_at')
        is_desc = sort_direction.lower() == 'desc'
        order_expr = F(order_key).desc(nulls_last=True) if is_desc else F(order_key).asc(nulls_last=True)

        return qs.order_by(order_expr, '-id')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)

        # Compute tenant metrics for the AdminPagination header
        now = timezone.now()
        org = request.user.organization
        org_links = ShareLink.objects.filter(
            Q(document__organization=org) | Q(dataroom__organization=org)
        )
        metrics = org_links.aggregate(
            total_links=Count('id'),
            active_links=Count('id', filter=Q(is_active=True) & (Q(expires_at__isnull=True) | Q(expires_at__gt=now))),
            dataroom_links=Count('id', filter=Q(dataroom__isnull=False)),
            document_links=Count('id', filter=Q(document__isnull=False)),
            revoked_links=Count('id', filter=Q(is_active=False)),
            expired_links=Count('id', filter=Q(is_active=True, expires_at__lte=now)),
        )

        if self.paginator:
            self.paginator.metrics = metrics

        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)
