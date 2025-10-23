import logging
from io import BytesIO
from urllib.parse import urljoin

from django.conf import settings
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload

from .base import BaseCloudProvider, CloudProviderError

logger = logging.getLogger(__name__)


class GoogleDriveProvider(BaseCloudProvider):
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
            raise CloudProviderError("Google Drive API credentials are not configured in settings.py.")

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

    def get_authorization_url(self):
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
            raise CloudProviderError("Failed to get token from Google Drive.")

    def _get_client(self):
        if not self.connection:
            raise CloudProviderError("No connection provided for Google Drive client.")

        creds = Credentials(
            token=self.connection.access_token,
            refresh_token=self.connection.refresh_token,
            client_id=self.client_id,
            client_secret=self.client_secret,
            token_uri="https://oauth2.googleapis.com/token"
        )

        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                # Persist the refreshed credentials
                self.connection.access_token = creds.token
                self.connection.expires_at = creds.expiry
                update_fields = ['access_token', 'expires_at']

                # A new refresh token is only issued on the initial authorization
                # code exchange if `access_type=offline` and `prompt=consent` are used.
                if creds.refresh_token and creds.refresh_token != self.connection.refresh_token:
                    self.connection.refresh_token = creds.refresh_token
                    update_fields.append('refresh_token')

                self.connection.save(update_fields=update_fields)
                logger.info(f"Refreshed Google Drive token for connection {self.connection.id}")
            except RefreshError as e:
                logger.error(f"Google Drive token refresh failed for connection {self.connection.id}: {e}")
                # This often means the user has revoked access.
                raise CloudProviderError("Failed to refresh Google Drive token. Please try disconnecting and reconnecting your account.")

        return build('drive', 'v3', credentials=creds)

    def get_user_info(self):
        creds = Credentials(token=self.connection.access_token)
        service = build('oauth2', 'v2', credentials=creds)
        try:
            user_info = service.userinfo().get().execute()
            return {'email': user_info.get('email')}
        except HttpError as e:
            raise CloudProviderError(f"Google Drive get_user_info failed: {e}")

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
            raise CloudProviderError(f"Google Drive list_files failed: {e}")

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
            raise CloudProviderError(f"Google Drive download failed: {e}")
