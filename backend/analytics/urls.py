from django.urls import path

from .views import (AllLinksView, AllViewSessionsView, DailyVisitsView,
                    DashboardSummaryView)

urlpatterns = [
    path('analytics/dashboard/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('analytics/daily-visits/', DailyVisitsView.as_view(), name='daily-visits'),
    path('analytics/links/', AllLinksView.as_view(), name='all-links'),
    path('analytics/view-sessions/', AllViewSessionsView.as_view(), name='all-view-sessions'),
]
