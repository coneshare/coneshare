Yes, this is a feasible feature. It can be achieved by creating a new API endpoint to log the download event and then updating the frontend to call that endpoint and display the result.

Here is my implementation plan.

Backend Plan

 1 Update the ViewSession Model:
    • In backend/documents/models.py, add a new nullable DateTimeField named downloaded_at to the ViewSession model. This field will store the timestamp of the first download for a given session.
 2 Create a Download Tracking Endpoint:
    • In backend/documents/views.py, add a new custom action named record_download to the ViewSessionViewSet.
    • This action will handle POST requests to /api/v1/view-sessions/{id}/record-download/.
    • Its logic will find the specified ViewSession and set its downloaded_at field to the current time, but only if the field is currently null. This ensures only the first download is recorded.
 3 Update the API Serializer:
    • In backend/documents/serializers.py, add the new downloaded_at field to the ViewSessionSerializer so it is included in the data sent to the frontend's visitor table.

Frontend Plan

 1 Create a New API Service Function:
    • In frontend/src/services/api.js, add a new function recordDownload(viewSessionId) that sends a POST request to the new /record-download/ endpoint.
 2 Integrate Download Tracking:
    • The ShareLinkViewerPage.jsx component is responsible for creating a view session when a document is viewed. It will pass the viewSessionId down to the ViewerToolbar.jsx component.
    • In ViewerToolbar.jsx, the "Download" button's onClick handler will be updated. In addition to triggering the file download, it will now also call the new recordDownload API function.
 3 Update the VisitorsTable Component:
    • In frontend/src/components/documents/VisitorsTable.jsx, add a new "Downloaded At" column to the table header.
    • In the table body, for each visitor row, check if the downloaded_at field exists. If it does, display the formatted timestamp. Otherwise, display "—".

---

I will now implement the download tracking feature as we planned.

This will involve updating the backend to store and serve the download timestamp, creating a new API endpoint to record downloads, and updating the frontend to call this endpoint and display the new
information in the visitors table.

Here are the required code changes:

Backend Changes

First, I'll update the ViewSession model to include a downloaded_at field.


backend/documents/models.py
<<<<<<< SEARCH
    duration_seconds = models.IntegerField(default=0)
    completion_rate = models.FloatField(default=0.0)
    viewed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
=======
    duration_seconds = models.IntegerField(default=0)
    completion_rate = models.FloatField(default=0.0)
    downloaded_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
>>>>>>> REPLACE


Next, I'll expose this new field in the API serializer.


backend/documents/serializers.py
<<<<<<< SEARCH
    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name', 'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude', 'duration_seconds',
            'completion_rate', 'viewed_at', 'page_views', 'is_owner_view'
        ]
        read_only_fields = ['id', 'viewed_at', 'ip_address', 'user_agent', 'share_link_name', 'country', 'city', 'latitude', 'longitude', 'page_views', 'is_owner_view']
=======
    class Meta:
        model = ViewSession
        fields = [
            'id', 'share_link', 'viewer', 'viewer_email', 'share_link_name', 'ip_address', 'user_agent', 'country', 'city', 'latitude', 'longitude', 'duration_seconds',
            'completion_rate', 'viewed_at', 'page_views', 'is_owner_view', 'downloaded_at'
        ]
        read_only_fields = ['id', 'viewed_at', 'ip_address', 'user_agent', 'share_link_name', 'country', 'city', 'latitude', 'longitude', 'page_views', 'is_owner_view', 'downloaded_at']
>>>>>>> REPLACE


Then, I'll create the new endpoint to record downloads and also ensure the public view data includes a downloadUrl.


backend/documents/views.py
<<<<<<< SEARCH
class ViewSessionViewSet(viewsets.ModelViewSet):
    queryset = ViewSession.objects.all()
    serializer_class = ViewSessionSerializer
=======
class ViewSessionViewSet(viewsets.ModelViewSet):
    queryset = ViewSession.objects.all()
    serializer_class = ViewSessionSerializer
>>>>>>> REPLACE



backend/documents/views.py
<<<<<<< SEARCH
    def get_permissions(self):
        """
        Allow anonymous users to create view sessions, but restrict
        all other actions to authenticated users.
        """
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
=======
    def get_permissions(self):
        """
        Allow anonymous users to create view sessions, but restrict
        all other actions to authenticated users.
        """
        if self.action in ['create', 'record_download']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['post'], url_path='record-download')
    def record_download(self, request, pk=None):
        """Records that a document was downloaded during this view session."""
        try:
            view_session = ViewSession.objects.get(pk=pk)
            # Only record the first download
            if view_session.downloaded_at is None:
                view_session.downloaded_at = timezone.now()
                view_session.save(update_fields=['downloaded_at'])
            return Response(status=status.HTTP_200_OK)
        except ViewSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    def get_queryset(self):
>>>>>>> REPLACE



backend/documents/views.py
<<<<<<< SEARCH
        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "numPages": document.num_pages,
            "pages": pages_data,
            "linkSettings": {
                "id": link.id,
                "allowDownload": link.allow_download,
                "enableWatermark": link.enable_watermark,
            }
        }
        return Response(response_data, status=status.HTTP_200_OK)
=======
        download_url = None
        if primary_version and primary_version.original_storage_key:
            file_url = default_storage.url(primary_version.original_storage_key)
            download_url = urljoin(settings.SITE_DOMAIN, file_url)

        response_data = {
            "id": document.id,
            "name": document.name,
            "type": document.type,
            "numPages": document.num_pages,
            "pages": pages_data,
            "downloadUrl": download_url,
            "linkSettings": {
                "id": link.id,
                "allowDownload": link.allow_download,
                "enableWatermark": link.enable_watermark,
            }
        }
        return Response(response_data, status=status.HTTP_200_OK)
>>>>>>> REPLACE


Frontend Changes

I'll add the new API service function.


frontend/src/services/api.js
<<<<<<< SEARCH
export const createViewSession = (data) => api.post('/view-sessions/', data);

export const recordPageView = (data, useBeacon = false) => {
=======
export const createViewSession = (data) => api.post('/view-sessions/', data);

export const recordDownload = (viewSessionId) => api.post(`/view-sessions/${viewSessionId}/record-download/`);

export const recordPageView = (data, useBeacon = false) => {
>>>>>>> REPLACE


Next, I'll update the viewer page to pass the necessary data to the toolbar.


frontend/src/pages/ShareLinkViewerPage.jsx
<<<<<<< SEARCH
          <ViewerToolbar
            allowDownload={documentData.linkSettings.allowDownload}
            onFullScreen={handleFullScreen}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            currentPage={currentPage}
            totalPages={documentData.numPages}
          />
=======
          <ViewerToolbar
            allowDownload={documentData.linkSettings.allowDownload}
            downloadUrl={documentData.downloadUrl}
            onFullScreen={handleFullScreen}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            currentPage={currentPage}
            totalPages={documentData.numPages}
            viewId={viewId}
          />
>>>>>>> REPLACE


I'll then modify the toolbar to handle the download tracking.


frontend/src/components/viewer/ViewerToolbar.jsx
<<<<<<< SEARCH
import { Download, Maximize, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/Button';

export function ViewerToolbar({
  allowDownload,
  onFullScreen,
  onZoomIn,
  onZoomOut,
  currentPage,
  totalPages,
}) {
  // Placeholder functions for actions
  const handleDownload = () => alert('Download not implemented');
  const handlePrint = () => alert('Print not implemented');

  return (
=======
import { Download, Maximize, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { recordDownload } from '../../services/api';
import { Button } from '../ui/Button';

export function ViewerToolbar({
  allowDownload,
  downloadUrl,
  onFullScreen,
  onZoomIn,
  onZoomOut,
  currentPage,
  totalPages,
  viewId,
}) {
  const handleDownload = () => {
    if (viewId && downloadUrl) {
      // Log the download event in the background
      recordDownload(viewId).catch(err => console.error("Failed to record download", err));
      // Trigger the download for the user
      window.open(downloadUrl, '_blank');
    }
  };
  const handlePrint = () => alert('Print not implemented');

  return (
>>>>>>> REPLACE


Finally, I'll update the VisitorsTable to display the download timestamp.


frontend/src/components/documents/VisitorsTable.jsx
<<<<<<< SEARCH
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Visitor</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Viewed At</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Completion</TableHead>
              </TableRow>
=======
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Visitor</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Viewed At</TableHead>
                <TableHead>Downloaded At</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Completion</TableHead>
              </TableRow>
>>>>>>> REPLACE



frontend/src/components/documents/VisitorsTable.jsx
<<<<<<< SEARCH
                      <TableCell>
                        {new Date(view.viewed_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </TableCell>
=======
                      <TableCell>
                        {new Date(view.viewed_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell>
                        {view.downloaded_at
                          ? new Date(view.downloaded_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </TableCell>
>>>>>>> REPLACE



frontend/src/components/documents/VisitorsTable.jsx
<<<<<<< SEARCH
                    {isExpanded && hasPageViews && (
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableCell colSpan={6} className="p-4">
                          <PageViewsChart pageViews={view.page_views} />
                        </TableCell>
                      </TableRow>
                    )}
=======
                    {isExpanded && hasPageViews && (
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableCell colSpan={7} className="p-4">
                          <PageViewsChart pageViews={view.page_views} />
                        </TableCell>
                      </TableRow>
                    )}
>>>>>>> REPLACE
