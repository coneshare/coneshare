# Coneshare Document Page Implementation Plan

To implement a document page in Coneshare similar to Papermark's, you should start by creating the backend API endpoint to supply the data, and then build the frontend page to display it. Here is a step-by-step guide to get started.

### 1. Backend: Create the Document Detail API Endpoint (Django)

First, create a Django REST Framework endpoint that serves all the necessary data for a single document.

1.  **Define the API View**:
    In `coneshare/documents/views.py`, create a new `APIView` that retrieves a document by its ID, along with its related share links and views.

2.  **Add the URL Route**:
    In your Django `urls.py` file for the documents app, add a new path for the view, for example: `path('api/documents/<document_id>/', DocumentDetailView.as_view(), name='document-detail')`.

The JSON response from this endpoint should include the document's metadata and two lists: one for its `share_links` and one for its `views` (visitor sessions).

### 2. Frontend: Build the Document Page (React)

With the backend API in place, you can build the React components to consume and display the data.

1.  **Set Up Routing**:
    Using `react-router-dom`, create a new route for the document page, such as `/documents/:id`.

2.  **Create the Main Page Component**:
    Create a new file, `src/pages/DocumentPage.jsx`. This component will:
    *   Use the `useParams` hook to get the document ID from the URL.
    *   Use a `useEffect` hook to fetch data from the `/api/documents/<document_id>/` endpoint you created.
    *   Manage loading and error states while the data is being fetched.

3.  **Structure the UI with Sub-components**:
    Break down the UI into smaller, reusable components, similar to Papermark's structure. Create initial placeholder files for:
    *   `DocumentHeader.jsx`: To display the document's name and action buttons. The "Create Link" button will open the `LinkSheet` modal.
    *   `LinksTable.jsx`: To receive the `share_links` array from the API and render a table of all share links.
    *   `VisitorsTable.jsx`: To receive the `views` array and render a table of all visitor sessions.
    *   `StatsComponent.jsx`: To display high-level analytics like total views.

Start by fetching the data in `DocumentPage.jsx` and passing it down as props to these new, initially simple, sub-components.

### 3. Share Link Creation & Editing (`LinkSheet` Component)

To handle the creation and editing of share links, you will implement a `LinkSheet` component, which will be a modal or slide-over panel.

#### Backend: Create and Update Link Endpoints (Django)

1.  **Create API Views**:
    In `coneshare/documents/views.py`, create two new `APIView` classes for handling links:
    *   `LinkCreateView`: Handles `POST /api/links/`. It will receive link settings and a `document_id` in the request body, validate the data, and create a new `ShareLink` record.
    *   `LinkUpdateView`: Handles `PUT /api/links/<link_id>/`. It will update an existing `ShareLink` record.

2.  **Add URL Routes**:
    In your `urls.py`, add routes for these new views.

#### Frontend: `LinkSheet.jsx` Component (React)

1.  **Create the Component File**:
    Create a new file at `src/components/links/LinkSheet.jsx`.

2.  **UI and State**:
    *   This component will render a form inside a modal. The form will include inputs for link settings like `name`, `password`, `expires_at`, and `allow_download`.
    *   It will manage the form data in its local state.
    *   It will accept props such as `isOpen`, `setIsOpen`, `documentId`, and an optional `currentLink` object (for editing).

3.  **Submission Logic**:
    *   On submit, it will determine the correct API endpoint and method (`POST` for creating, `PUT` for editing).
    *   After a successful submission, it will close the modal and trigger a data refresh on the `DocumentPage` to show the new/updated link in the `LinksTable`.

#### Integrating `LinkSheet` into the `DocumentPage`

In `src/pages/DocumentPage.jsx`, you will manage the state for the `LinkSheet`.

1.  **Add State**:
    ```jsx
    const [isLinkSheetOpen, setIsLinkSheetOpen] = useState(false);
    const [editingLink, setEditingLink] = useState(null); // To hold the link being edited
    ```

2.  **Connect Actions**:
    *   The "Create Link" button in `DocumentHeader.jsx` will call `setEditingLink(null)` and `setIsLinkSheetOpen(true)`.
    *   Add an "Edit" button to each row in `LinksTable.jsx` that calls `setEditingLink(linkObject)` and `setIsLinkSheetOpen(true)`.

3.  **Render the Component**:
    Conditionally render the `LinkSheet` in `DocumentPage.jsx`:
    ```jsx
    {isLinkSheetOpen && (
      <LinkSheet
        isOpen={isLinkSheetOpen}
        setIsOpen={setIsLinkSheetOpen}
        documentId={documentId}
        currentLink={editingLink}
      />
    )}
    ```
