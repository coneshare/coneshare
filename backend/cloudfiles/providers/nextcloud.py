import logging
import secrets
import tempfile
import xml.etree.ElementTree as ET
from datetime import timedelta
from io import BytesIO
from urllib.parse import urlencode, urljoin, unquote

import httpx
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from core.services import get_dynamic_setting
from .base import BaseCloudProvider, CloudProviderError

logger = logging.getLogger(__name__)


class NextcloudProvider(BaseCloudProvider):
    """Nextcloud integration."""
    PROVIDER_NAME = 'nextcloud'

    def __init__(self, connection=None):
        super().__init__(connection)
        self.host = get_dynamic_setting('NEXT_CLOUD_HOST')
        self.client_id = get_dynamic_setting('NEXT_CLOUD_CLIENT_ID')
        self.client_secret = get_dynamic_setting('NEXT_CLOUD_CLIENT_SECRET')
        if not all([self.host, self.client_id, self.client_secret]):
            raise CloudProviderError("Nextcloud API credentials are not configured in settings.py.")

    def _get_redirect_uri(self):
        return urljoin(settings.SITE_DOMAIN, "auth/nextcloud/callback")

    def get_authorization_url(self):
        state = secrets.token_urlsafe(16)
        redirect_uri = self._get_redirect_uri()

        params = {
            'client_id': self.client_id,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'state': state,
        }
        auth_url = f"{self.host.rstrip('/')}/apps/oauth2/authorize?{urlencode(params)}"
        return auth_url, state

    def handle_callback(self, code):
        redirect_uri = self._get_redirect_uri()
        token_url = f"{self.host.rstrip('/')}/apps/oauth2/api/v1/token"

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
                    auth=(self.client_id, self.client_secret)
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
            logger.error(f"Nextcloud token exchange failed: {e.response.status_code} - {e.response.text}")
            raise CloudProviderError("Failed to get token from Nextcloud.")
        except Exception as e:
            raise CloudProviderError(f"Nextcloud OAuth callback error: {e}")

    def _refresh_token(self):
        """Manually refreshes the Nextcloud access token."""
        if not self.connection or not self.connection.refresh_token:
            raise CloudProviderError("Cannot refresh token without a refresh token.")

        token_url = f"{self.host.rstrip('/')}/apps/oauth2/api/v1/token"
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': self.connection.refresh_token,
        }
        try:
            with httpx.Client() as client:
                response = client.post(
                    token_url,
                    data=data,
                    auth=(self.client_id, self.client_secret)
                )
                response.raise_for_status()
                token_data = response.json()

                self.connection.access_token = token_data['access_token']
                if 'expires_in' in token_data:
                    self.connection.expires_at = timezone.now() + timedelta(seconds=token_data['expires_in'])

                self.connection.save(update_fields=['access_token', 'expires_at'])
                logger.info(f"Refreshed Nextcloud token for connection {self.connection.id}")

        except httpx.HTTPStatusError as e:
            logger.error(f"Nextcloud token refresh failed: {e.response.status_code} - {e.response.text}")
            raise CloudProviderError("Failed to refresh Nextcloud token.")

    def _get_client(self):
        if not self.connection:
            raise CloudProviderError("No connection provided for Nextcloud client.")

        if self.connection.refresh_token and self.connection.expires_at:
            # Refresh if token expires in the next 5 minutes
            if self.connection.expires_at < timezone.now() + timedelta(minutes=5):
                self._refresh_token()

        headers = {
            'Authorization': f'Bearer {self.connection.access_token}',
            'OCS-APIRequest': 'true',
        }
        return httpx.Client(headers=headers)

    def get_user_info(self):
        if not self.connection:
            raise CloudProviderError("Connection is required to retrieve user info.")

        cache_key = f"nextcloud_user_info_{self.connection.id}"
        cached_info = cache.get(cache_key)
        if cached_info:
            return cached_info

        user_info_url = f"{self.host.rstrip('/')}/ocs/v2.php/cloud/user?format=json"
        with self._get_client() as client:
            try:
                response = client.get(user_info_url)
                response.raise_for_status()
                data = response.json()
                user_data = data.get('ocs', {}).get('data', {})
                user_info = {
                    'email': user_data.get('email'),
                    'user_id': user_data.get('id'),
                }
                # Cache user info for 1 hour to reduce API calls
                cache.set(cache_key, user_info, timeout=3600)
                return user_info
            except httpx.HTTPStatusError as e:
                logger.error(f"Nextcloud get_user_info failed: {e}")
                raise CloudProviderError(f"Nextcloud get_user_info failed: {e}")

    def list_files(self, path='/'):
        # For Nextcloud, we need the user_id to build the WebDAV URL.
        user_info = self.get_user_info()
        user_id = user_info.get('user_id')
        if not user_id:
            raise CloudProviderError("Could not determine Nextcloud user ID.")

        # Check if the path is already a full WebDAV path from a previous API call.
        if path.startswith(f"/remote.php/dav/files/{user_id}"):
            webdav_url = urljoin(self.host, path)
            base_href = path.rstrip('/')
        else:
            # Handle the root folder case.
            webdav_path_segment = '' if path == '/' else path.lstrip('/')
            webdav_url = f"{self.host.rstrip('/')}/remote.php/dav/files/{user_id}/{webdav_path_segment}"
            base_href = f"/remote.php/dav/files/{user_id}/{webdav_path_segment}".rstrip('/')

        with self._get_client() as client:
            try:
                # PROPFIND is a WebDAV method to get properties of resources.
                response = client.request('PROPFIND', webdav_url, headers={'Depth': '1'})
                response.raise_for_status()

                root = ET.fromstring(response.content)
                items = []
                ns = {'d': 'DAV:'}

                for resp in root.findall('d:response', ns):
                    href = resp.find('d:href', ns).text
                    propstat = resp.find('d:propstat', ns)
                    prop = propstat.find('d:prop', ns)

                    # Skip the folder itself
                    if href.rstrip('/') == base_href:
                        continue

                    name = unquote(href.strip('/').split('/')[-1])
                    is_folder = prop.find('d:resourcetype', ns).find('d:collection', ns) is not None
                    size_el = prop.find('d:getcontentlength', ns)
                    size = int(size_el.text) if size_el is not None and size_el.text else None

                    items.append({
                        'id': href,  # Use full path as ID
                        'name': name,
                        'type': 'folder' if is_folder else 'file',
                        'path': href,
                        'size': size if not is_folder else None,
                    })
                return items
            except (httpx.HTTPStatusError, ET.ParseError) as e:
                logger.error(f"Nextcloud list_files failed: {e}")
                raise CloudProviderError(f"Nextcloud list_files failed: {e}")

    def download_file(self, file_id):
        # file_id is the full path from list_files (e.g., /remote.php/dav/...)
        download_url = f"{self.host.rstrip('/')}{file_id}"

        with self._get_client() as client:
            try:
                with client.stream('GET', download_url) as response:
                    response.raise_for_status()
                    file_name = unquote(file_id.strip('/').split('/')[-1])
                    size = int(response.headers.get('content-length', 0))
                    etag_or_rev = response.headers.get('etag', '').strip('"')

                    # Use a spooled temporary file to avoid loading large files into memory.
                    # It spills to disk if the file is larger than 5MB.
                    content = tempfile.SpooledTemporaryFile(max_size=5 * 1024 * 1024)
                    for chunk in response.iter_bytes():
                        content.write(chunk)
                    content.seek(0)

                    return {
                        'name': file_name,
                        'size': size,
                        'content': content,
                        'etag_or_rev': etag_or_rev
                    }
            except httpx.HTTPStatusError as e:
                logger.error(f"Nextcloud download failed: {e}")
                raise CloudProviderError(f"Nextcloud download failed: {e}")

    def revoke_token(self):
        if not self.connection or not self.connection.access_token:
            return
        token_url = f"{self.host.rstrip('/')}/apps/oauth2/api/v1/token/revoke"
        data = {
            'token': self.connection.refresh_token or self.connection.access_token,
            'token_type_hint': 'refresh_token' if self.connection.refresh_token else 'access_token'
        }
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.post(
                    token_url,
                    data=data,
                    auth=(self.client_id, self.client_secret)
                )
                if response.status_code < 400:
                    logger.info(f"Successfully revoked Nextcloud token for connection {self.connection.id}")
                else:
                    logger.warning(f"Nextcloud token revocation returned status: {response.status_code}")
        except Exception as e:
            logger.warning(f"Failed to revoke Nextcloud token: {e}")

