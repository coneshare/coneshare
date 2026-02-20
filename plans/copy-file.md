# Copy File Feature Implementation Plan

This document outlines the implementation plan for adding a "Copy" feature for documents.

## Backend Implementation Plan

### 1. Go File Server (`core/main.go`)

-   **New Handler**: Add a `copyFileHandler` function. This function will read a JSON body with `source_storage_key` and `destination_storage_key`, perform security checks, and use `io.Copy` to duplicate the file within the storage volume.
-   **New Endpoint**: Register the `copyFileHandler` on a new internal endpoint: `POST /internal/v1/copy-file`.

### 2. File Server Client (`backend/documents/fileserver.py`)

-   **New Method**: In the `FileServerClient` class, add a new method: `copy_file(self, source_storage_key: str, destination_storage_key: str)`.
-   **Functionality**: This method will make a POST request to the new `/internal/v1/copy-file` endpoint on the Go server.

### 3. Document Services (`backend/documents/services.py`)

-   **New Function**: Create a new function `copy_document(original_doc, user)`.
-   **Logic**:
    -   Wrap the entire operation in a database transaction for atomicity.
    -   Call `_get_unique_document_name` to generate a name for the copy (e.g., "Copy of report.pdf").
    -   Call `generate_storage_key` to create a new unique path for the copied file.
    -   Use the new `fileserver_client.copy_file()` method to duplicate the file in storage.
    -   Create new `Document` and `DocumentVersion` records in the database, copying relevant attributes from the original.
    -   Update the user's `total_document_size`.

### 4. Document Views (`backend/documents/views.py`)

-   **New Action**: Add a new `copy` action to the `DocumentViewSet` using the `@action` decorator.
-   **Endpoint**: This will create the endpoint `POST /api/v1/documents/{id}/copy/`.
-   **Logic**: This view will retrieve the document, call the new `copy_document` service, serialize the resulting new document, and return it with a `201 Created` status.

## Frontend Implementation Plan

### 1. API Service (`frontend/src/services/api.js`)

-   **New Function**: Add a `copyDocument(id)` function that sends a `POST` request to `/api/v1/documents/{id}/copy/`.

### 2. Documents Page (`frontend/src/pages/DocumentsPage.jsx`)

-   **New Handler**: Create a `handleCopy` function that takes a document item, calls the `copyDocument` API service, displays a toast notification, and refreshes the data list on success.
-   **Prop Passing**: Pass this function as an `onCopy` prop to the `<DocumentsList />` component.

### 3. Component Prop-Drilling

-   Pass the `onCopy` prop from `<DocumentsList />` to `<DraggableItem />`, and then to `<ActionsDropdown />`.

### 4. Actions Dropdown (`frontend/src/components/documents/ActionsDropdown.jsx`)

-   **New Menu Item**: Add a "Copy" `DropdownMenu.Item` with a `Copy` icon.
-   **Conditional Rendering**: This item will only be visible for items where `type` is 'document'.
-   **Action**: On click, it will call the `onCopy` function.
