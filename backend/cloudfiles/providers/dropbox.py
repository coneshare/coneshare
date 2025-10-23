import logging
from datetime import timedelta
from io import BytesIO
from urllib.parse import urljoin

import dropbox
import httpx
from django.conf import settings
from django.urls import reverse
from django.utils import timezone

from .base import BaseCloudProvider, CloudProviderError

logger = logging.getLogger(__name__)


class DropboxProvider(BaseCloudProvider):
    """Dropbox integration."""
    PROVIDER_NAME = 'dropbox'

    def __init__(self, connection=None):
        super().__init__(connection)
        self.app_key = getattr(settings, 'DROPBOX_APP_KEY', None)
        self.app_secret = getattr(settings, 'DROPBOX_APP_SECRET', None)
        if not self.app_key or not self.app_secret:
            raise CloudProviderError("Dropbox API credentials are not configured in settings.py.")

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

                expires_in = token_data.get('expires_in')
                expires_at = timezone.now() + timedelta(seconds=expires_in) if expires_in else None

                return {
                    'access_token': token_data['access_token'],
                    'refresh_token': token_data.get('refresh_token'),
                    'expires_at': expires_at,
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Dropbox token exchange failed: {e.response.status_code} - {e.response.text}")
            raise CloudProviderError("Failed to get token from Dropbox.")
        except Exception as e:
            raise CloudProviderError(f"Dropbox OAuth callback error: {e}")

    def _refresh_token(self):
        """Manually refreshes the Dropbox access token."""
        if not self.connection or not self.connection.refresh_token:
            raise CloudProviderError("Cannot refresh token without a refresh token.")

        token_url = "https://api.dropboxapi.com/oauth2/token"
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': self.connection.refresh_token,
        }
        try:
            with httpx.Client() as client:
                response = client.post(token_url, data=data, auth=(self.app_key, self.app_secret))
                response.raise_for_status()
                token_data = response.json()

                self.connection.access_token = token_data['access_token']
                if 'expires_in' in token_data:
                    self.connection.expires_at = timezone.now() + timedelta(seconds=token_data['expires_in'])

                self.connection.save(update_fields=['access_token', 'expires_at'])
                logger.info(f"Refreshed Dropbox token for connection {self.connection.id}")

        except httpx.HTTPStatusError as e:
            logger.error(f"Dropbox token refresh failed: {e.response.status_code} - {e.response.text}")
            raise CloudProviderError("Failed to refresh Dropbox token.")

    def _get_client(self):
        if not self.connection:
            raise CloudProviderError("No connection provided for Dropbox client.")

        if self.connection.refresh_token and self.connection.expires_at:
            # Refresh if token expires in the next 5 minutes
            if self.connection.expires_at < timezone.now() + timedelta(minutes=5):
                self._refresh_token()

        return dropbox.Dropbox(
            oauth2_access_token=self.connection.access_token,
        )

    def get_user_info(self):
        client = self._get_client()
        try:
            account = client.users_get_current_account()
            return {'email': account.email}
        except dropbox.exceptions.AuthError as e:
            raise CloudProviderError(f"Dropbox auth error: {e}")

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
            raise CloudProviderError(f"Dropbox API error: {e}")

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
            raise CloudProviderError(f"Dropbox download error: {e}")
