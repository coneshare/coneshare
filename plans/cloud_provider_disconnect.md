# Feature Plan: Cloud Provider Disconnect & Integrations Settings

## Overview
Users need a settings page to view all supported cloud providers (Google Drive, Dropbox, Nextcloud), check their current connection status, and securely disconnect providers they no longer wish to use.

## 1. Backend API Changes
We already have `CloudProviderListView` (lists available providers) and `CloudConnectionListView` (lists the user's active connections). We will extend this:

*   **New Endpoint (`DELETE /api/v1/cloudfiles/connections/<connection_id>/`)**: 
    Create a `CloudConnectionDetailView` at `DELETE /api/v1/cloudfiles/connections/<connection_id>/`.
    *   Strictly enforce that the connection belongs to the requesting user (`connection.user == request.user`).
*   **Best-Effort OAuth Revocation**: 
    Before deleting the local `CloudConnection` database record, the backend will attempt to revoke the token with the respective provider (e.g., calling Google's or Dropbox's token revocation URL) using the `BaseCloudProvider` interface. 
    *Note: If the remote revocation fails (due to network timeout, expired token, or invalid response), the backend will catch the exception, log a warning, and still proceed with deleting the local DB record so the user never gets locked/stuck.*
*   **Serializer Enhancements**: 
    Update `CloudConnectionSerializer` to expose the `created_at` (Connected date) and `updated_at` (Last accessed/refreshed date) fields.

## 2. Frontend UI / UX
*   **Settings Tabs Layout**: 
    Create a settings navigation header (tabs) at the top of `/settings`, `/settings/password`, and `/settings/integrations` to allow easy navigation.
    *   **Tabs**: Profile, Password, Integrations
*   **Integrations Page (`/settings/integrations`)**:
    Renders a grid of "Integration Cards" fetching from both `GET /api/v1/cloudfiles/providers/` and `GET /api/v1/cloudfiles/connections/`.
    *   *Disconnected*: Shows the provider logo and a "Connect" button that triggers our existing OAuth flow.
    *   *Connected*: Shows a green "Connected" badge, the connected email/account name, the connection dates, and a "Disconnect" button.
*   **Confirmation Modal**: 
    Clicking "Disconnect" will open a warning modal:
    > *"Are you sure you want to disconnect [Provider]? Documents imported from this provider will remain in Coneshare but can no longer be refreshed/synced."*
    
    Upon confirmation, it fires a `DELETE` request to `/api/v1/cloudfiles/connections/<id>/` and refreshes the integrations list.

## 3. Post-Disconnection Behavior
*   **Sync Logic**: 
    Any future attempts by the user to use the "Refresh/Sync Latest Version" feature on a document whose source connection has been deleted will gracefully fail, displaying a message: *"Cloud connection not found. Please reconnect your cloud account."* (This view logic is already handled, we just need to ensure the response is clear).
