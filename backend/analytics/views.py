import logging
from datetime import timedelta

from django.db.models import Count, OuterRef, Subquery
from django.utils import timezone
from rest_framework import generics, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from core.pagination import StandardResultsSetPagination
from sharelinks.models import ShareLink, ViewSession
from sharelinks.serializers import ShareLinkSerializer, ViewSessionSerializer


logger = logging.getLogger(__name__)


@extend_schema(tags=['analytics'])
class DashboardSummaryView(APIView):
    """
    Provides a summary of recent activity for the main dashboard.
    """
    permission_classes = [permissions.IsAuthenticated]

    class DashboardSummaryResponseSerializer(serializers.Serializer):
        recent_views = ViewSessionSerializer(many=True)
        recent_links = ShareLinkSerializer(many=True)

    @extend_schema(responses={200: DashboardSummaryResponseSerializer})
    def get(self, request, *args, **kwargs):
        # 1. Get the 10 most recent view sessions
        recent_views = ViewSession.objects.filter(
            share_link__created_by=request.user
        ).select_related('share_link', 'share_link__document').order_by('-viewed_at')[:10]
        recent_views_serializer = ViewSessionSerializer(recent_views, many=True, context={'request': request})

        # 2. Get the 10 most recently active share links
        # A link is active if it has been viewed. We find the last view time for each link.
        latest_view_subquery = ViewSession.objects.filter(
            share_link=OuterRef('pk')
        ).order_by('-viewed_at').values('viewed_at')[:1]

        recent_links = ShareLink.objects.filter(
            created_by=request.user
        ).select_related('document').annotate(
            last_viewed_at=Subquery(latest_view_subquery)
        ).filter(
            last_viewed_at__isnull=False
        ).order_by('-last_viewed_at')[:10]
        recent_links_serializer = ShareLinkSerializer(recent_links, many=True, context={'request': request})

        return Response({
            'recent_views': recent_views_serializer.data,
            'recent_links': recent_links_serializer.data,
        })


@extend_schema(tags=['analytics'])
class DailyVisitsView(APIView):
    """
    Provides aggregated daily view counts for the last 30 days.
    """
    permission_classes = [permissions.IsAuthenticated]

    class DailyVisitsItemSerializer(serializers.Serializer):
        date = serializers.CharField()
        visits = serializers.IntegerField()

    @extend_schema(responses={200: DailyVisitsItemSerializer(many=True)})
    def get(self, request, *args, **kwargs):
        organization = request.user.organization
        thirty_days_ago = timezone.now().date() - timedelta(days=30)

        # Aggregate view counts by date
        daily_counts = ViewSession.objects.filter(
            share_link__created_by=request.user,
            viewed_at__date__gte=thirty_days_ago
        ).values('viewed_at__date').annotate(
            count=Count('id')
        ).order_by('viewed_at__date')

        # Format for charting library
        # Create a dictionary of all dates in the last 30 days initialized to 0
        date_range = [thirty_days_ago + timedelta(days=i) for i in range(31)]
        results_map = {item['viewed_at__date']: item['count'] for item in daily_counts}

        chart_data = [
            {
                'date': day.strftime('%Y-%m-%d'),
                'visits': results_map.get(day, 0)
            }
            for day in date_range
        ]

        return Response(chart_data)


@extend_schema(tags=['analytics'])
class AllLinksView(generics.ListAPIView):
    """
    Provides a paginated list of all share links for the organization,
    ordered by the most recently active.
    """
    serializer_class = ShareLinkSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        latest_view_subquery = ViewSession.objects.filter(
            share_link=OuterRef('pk')
        ).order_by('-viewed_at').values('viewed_at')[:1]

        return ShareLink.objects.filter(
            created_by=self.request.user
        ).annotate(
            last_viewed_at=Subquery(latest_view_subquery)
        ).filter(
            last_viewed_at__isnull=False
        ).order_by('-last_viewed_at')


@extend_schema(tags=['analytics'])
class AllViewSessionsView(generics.ListAPIView):
    """
    Provides a paginated list of all view sessions for the organization.
    """
    serializer_class = ViewSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return ViewSession.objects.filter(
            share_link__created_by=self.request.user
        ).select_related('share_link', 'share_link__document').order_by('-viewed_at')
