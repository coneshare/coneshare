To display page views for each document visit within a dataroom, you would need to establish a link between the document visit event and the subsequent page view events.

Here is my plan to implement this feature:

Backend Plan

 1 Update the PageView Model:
    • In backend/sharelinks/models.py, I would modify the PageView model to include a nullable foreign key to DataroomVisit. This directly ties a specific page view to the document visit event
      it belongs to.
 2 Update the record_visit Endpoint:
    • The POST /api/v1/view-sessions/{pk}/record-visit/ endpoint in backend/sharelinks/views.py would be changed to return the newly created DataroomVisit object, including its ID.
 3 Update the recordPageView Endpoint:
    • The POST /api/v1/page-views/record/ endpoint and its serializer would be updated to accept an optional dataroom_visit_id. When this ID is provided, the new PageView record will be
      associated with the corresponding DataroomVisit.
 4 Update API Serializers:
    • In backend/sharelinks/serializers.py, I would add a nested PageViewSerializer to the DataroomVisitSerializer. This would cause the dataroom_visits array in the ViewSession response to
      include a list of page views for each document visit.

Frontend Plan

 1 Update recordDataroomVisit Service:
    • In frontend/src/services/api.js, the recordDataroomVisit function would be updated to return the response data, which now contains the ID of the created visit.
 2 Track the DataroomVisit ID:
    • In frontend/src/components/viewer/DataroomViewer.jsx, when a user clicks a document, the component would call recordDataroomVisit and store the returned visit ID in a state variable.
 3 Pass the ID to the Viewer:
    • This new visit ID would be passed as a prop to the DataroomDocumentPreview component, and then further down to the PreviewViewer.
 4 Update Page View Tracking:
    • The PreviewViewer component (and its underlying tracking logic) would be modified. When sending page view data via the recordPageView function, it would include the dataroom_visit_id if one was provided.
