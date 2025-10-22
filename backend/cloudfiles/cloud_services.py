import logging
import logging
import os
from io import BytesIO
from urllib.parse import urljoin

import dropbox
import httpx
from django.conf import settings
from django.urls import reverse
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload

logger = logging.getLogger(__name__)

logger = logging.getLogger(__name__)


class CloudServiceError(Exception):
    """Custom exception for cloud service errors."""
    pass


class BaseCloudService:
    """Abstract base class for cloud service integrations."""
    def __init__(self, connection=None):
        self.connection = connection

    def get_authorization_url(self):
        """Returns the URL to redirect the user for OAuth2 authorization."""
        raise NotImplementedError

    def handle_callback(self, request):
        """Handles the OAuth2 callback, exchanges code for tokens, and saves them."""
        raise NotImplementedError

    def list_files(self, path='/'):
        """Lists files and folders from the cloud provider."""
        raise NotImplementedError

    def download_file(self, file_id):
        """Downloads a file and returns its metadata and a file-like object."""
        raise NotImplementedError

    def get_user_info(self):
        """Gets user info from the provider, like email."""
        raise NotImplementedError


class DropboxService(BaseCloudService):
    """Dropbox integration."""
    PROVIDER_NAME = 'dropbox'

    def __init__(self, connection=None):
        super().__init__(connection)
        self.app_key = getattr(settings, 'DROPBOX_APP_KEY', None)
        self.app_secret = getattr(settings, 'DROPBOX_APP_SECRET', None)
        if not self.app_key or not self.app_secret:
            raise CloudServiceError("Dropbox API credentials are not configured in settings.py.")

    def _get_redirect_uri(self):
        # The frontend handles the final redirect from Dropbox. This URI must be
        # registered in your Dropbox App's settings.
        return urljoin(
            settings.SITE_DOMAIN,
            "auth/dropbox/callback"  # This is a frontend route
        )

    def _get_oauth_flow(self, request):
        redirect_uri = self._get_redirect_uri()
        return dropbox.DropboxOAuth2Flow(
            consumer_key=self.app_key,
            consumer_secret=self.app_secret,
            redirect_uri=str(redirect_uri),
            session=request.session,
            csrf_token_session_key="dropbox-auth-csrf-token",
            token_access_type="offline",  # or 'online' if you don’t need refresh tokens
            scope=["account_info.read", "files.metadata.read", "files.content.read"],
            include_granted_scopes="user",
        )

    def get_authorization_url(self, request):
        oauth_flow = self._get_oauth_flow(request)
        auth_url = oauth_flow.start()
        state = request.session.get("dropbox-auth-csrf-token")
        return auth_url, state

    def handle_callback(self, code):
        """
        Exchanges an authorization code for an access token.
        This method performs a server-to-server request to Dropbox.
        """
        redirect_uri = self._get_redirect_uri()
        token_url = "https://api.dropboxapi.com/oauth2/token"

        data = {
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': redirect_uri,
        }

        try:
            with httpx.Client() as client:
                response = client.post(
                    token_url,
                    data=data,
                    auth=(self.app_key, self.app_secret)
                )
                response.raise_for_status()
                token_data = response.json()

                # Dropbox doesn't return an expiry timestamp for offline tokens with refresh tokens.
                # The SDK calculates it, but we can leave it null for simplicity unless needed.
                return {
                    'access_token': token_data['access_token'],
                    'refresh_token': token_data.get('refresh_token'),
                    'expires_at': None,
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Dropbox token exchange failed: {e.response.status_code} - {e.response.text}")
            raise CloudServiceError("Failed to get token from Dropbox.")
        except Exception as e:
            raise CloudServiceError(f"Dropbox OAuth callback error: {e}")

    def _get_client(self):
        if not self.connection:
            raise CloudServiceError("No connection provided for Dropbox client.")
        # TODO: Implement token refresh logic if access token is expired.
        return dropbox.Dropbox(
            oauth2_access_token=self.connection.access_token,
        )

    def get_user_info(self):
        client = self._get_client()
        try:
            account = client.users_get_current_account()
            return {'email': account.email}
        except dropbox.exceptions.AuthError as e:
            raise CloudServiceError(f"Dropbox auth error: {e}")

    def list_files(self, path='/'):
        client = self._get_client()
        try:
            result = client.files_list_folder(path if path != '/' else '')
            items = []
            for entry in result.entries:
                item_type = 'folder' if isinstance(entry, dropbox.files.FolderMetadata) else 'file'
                items.append({
                    'id': entry.path_lower,  # Use path as ID for Dropbox
                    'name': entry.name,
                    'type': item_type,
                    'path': entry.path_lower,
                    'size': entry.size if hasattr(entry, 'size') else None,
                })
            return items
        except dropbox.exceptions.ApiError as e:
            raise CloudServiceError(f"Dropbox API error: {e}")

    def download_file(self, file_path):
        client = self._get_client()
        try:
            metadata, response = client.files_download(file_path)
            file_content = BytesIO(response.content)
            return {
                'name': metadata.name,
                'size': metadata.size,
                'content': file_content
            }
        except dropbox.exceptions.ApiError as e:
            raise CloudServiceError(f"Dropbox download error: {e}")


class GoogleDriveService(BaseCloudService):
    """Google Drive integration."""
    PROVIDER_NAME = 'google_drive'
    SCOPES = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/drive.readonly',
    ]

    def __init__(self, connection=None):
        super().__init__(connection)
        self.client_id = getattr(settings, 'GOOGLE_DRIVE_CLIENT_ID', None)
        self.client_secret = getattr(settings, 'GOOGLE_DRIVE_CLIENT_SECRET', None)
        if not self.client_id or not self.client_secret:
            raise CloudServiceError("Google Drive API credentials are not configured in settings.py.")

    def _get_redirect_uri(self):
        return urljoin(settings.SITE_DOMAIN, "auth/google_drive/callback")

    def _get_flow(self):
        client_config = {
            "web": {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [self._get_redirect_uri()],
            }
        }
        return Flow.from_client_config(
            client_config,
            scopes=self.SCOPES,
            redirect_uri=self._get_redirect_uri()
        )

    def get_authorization_url(self, request):
        flow = self._get_flow()
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )
        return authorization_url, state

    def handle_callback(self, code):
        try:
            flow = self._get_flow()
            flow.fetch_token(code=code)
            creds = flow.credentials
            return {
                'access_token': creds.token,
                'refresh_token': creds.refresh_token,
                'expires_at': creds.expiry,
            }
        except Exception as e:
            logger.error(f"Google Drive token exchange failed: {e}")
            raise CloudServiceError("Failed to get token from Google Drive.")

    def _get_client(self):
        if not self.connection:
            raise CloudServiceError("No connection provided for Google Drive client.")

        creds = Credentials(
            token=self.connection.access_token,
            refresh_token=self.connection.refresh_token,
            client_id=self.client_id,
            client_secret=self.client_secret,
            token_uri="https://oauth2.googleapis.com/token"
        )
        # TODO: Handle token refresh logic here when implementing API calls
        return build('drive', 'v3', credentials=creds)

    def get_user_info(self):
        creds = Credentials(token=self.connection.access_token)
        service = build('oauth2', 'v2', credentials=creds)
        try:
            user_info = service.userinfo().get().execute()
            return {'email': user_info.get('email')}
        except HttpError as e:
            raise CloudServiceError(f"Google Drive get_user_info failed: {e}")

    def list_files(self, path='/'):
        service = self._get_client()
        folder_id = 'root' if path == '/' else path
        try:
            results = service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                pageSize=100,
                fields="nextPageToken, files(id, name, mimeType, size)"
            ).execute()

            items = []
            for file in results.get('files', []):
                is_folder = file.get('mimeType') == 'application/vnd.google-apps.folder'
                items.append({
                    'id': file.get('id'),
                    'name': file.get('name'),
                    'type': 'folder' if is_folder else 'file',
                    'path': file.get('id'),
                    'size': int(file.get('size', 0)) if not is_folder else None,
                })
            return items
        except HttpError as e:
            raise CloudServiceError(f"Google Drive list_files failed: {e}")

    def download_file(self, file_id):
        service = self._get_client()
        try:
            request = service.files().get_media(fileId=file_id)
            file_metadata = service.files().get(fileId=file_id, fields='name, size').execute()
            
            fh = BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            
            fh.seek(0)
            return {
                'name': file_metadata.get('name'),
                'size': int(file_metadata.get('size', 0)),
                'content': fh
            }
        except HttpError as e:
            raise CloudServiceError(f"Google Drive download failed: {e}")


SERVICE_REGISTRY = {
    'dropbox': DropboxService,
    'google_drive': GoogleDriveService,
}


def get_cloud_service(provider_name, connection=None):
    """Factory function to get a cloud service instance."""
    service_class = SERVICE_REGISTRY.get(provider_name)
    if not service_class:
        raise ValueError(f"Unsupported cloud provider: {provider_name}")
    return service_class(connection=connection)
