Yes, this is feasible. The necessary data (per-page view durations) is already being collected by the backend; it just needs to be exposed through the API. The frontend can then be updated to display it
in an expandable row with a bar chart.

Here is my implementation plan.

Backend Plan

The goal is to enhance the API endpoint that serves visitor data to include the granular page-by-page view details.

 1 Create a PageView Serializer In backend/documents/serializers.py, create a new serializer for the PageView model to represent the page view data.

   class PageViewSerializer(serializers.ModelSerializer):
       class Meta:
           model = PageView
           fields = ['page_number', 'duration_seconds']

 2 Update the ViewSessionSerializer Still in backend/documents/serializers.py, modify ViewSessionSerializer to nest the new PageViewSerializer. This will include each page view's data within its parent
   visitor session.
   Briefly: Add a page_views field to ViewSessionSerializer using the new PageViewSerializer.
 3 Optimize the Database Query In backend/documents/views.py, update the view_sessions action within the DocumentViewSet to prefetch the related page_views data. This avoids numerous extra database
   queries and improves performance.
   Briefly: Add prefetch_related('page_views') to the queryset in the view_sessions method.

Frontend Plan

The goal is to modify the VisitorsTable to be interactive, allowing users to expand a row to see the page-by-page analytics.

 1 Create a Bar Chart Component Create a new component file: frontend/src/components/documents/PageViewsChart.jsx.
    • This component will receive the page_views array as a prop.
    • It will render a simple horizontal bar chart using div elements, where each bar's width is proportional to the time spent on that page.
 2 Modify the VisitorsTable Component In frontend/src/components/documents/VisitorsTable.jsx, make the following changes:
    • Add State: Introduce state to track which row is currently expanded.
    • Add Expand/Collapse UI: Add a clickable icon (e.g., a chevron) to each table row.
    • Conditional Rendering: Modify the component's render logic to check if a row is expanded. If it is, render an additional <TableRow> immediately below it. This new row will contain the PageViewsChart
      component, which will receive the page_views data for that specific visitor.