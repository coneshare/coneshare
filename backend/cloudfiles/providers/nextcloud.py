import logging
import secrets
import xml.etree.ElementTree as ET
from io import BytesIO
from urllib.parse import urlencode, urljoin, unquote

import httpx
from django.conf import settings

from .base import BaseCloudProvider, CloudProviderError

logger = logging.getLogger(__name__)


class NextcloudProvider(BaseCloudProvider):
    """Nextcloud integration."""
    PROVIDER_NAME = 'nextcloud'

    def __init__(self, connection=None):
        super().__init__(connection)
        self.host = getattr(settings, 'NEXT_CLOUD_HOST', None)
        self.client_id = getattr(settings, 'NEXT_CLOUD_CLIENT_ID', None)
        self.client_secret = getattr(settings, 'NEXT_CLOUD_CLIENT_SECRET', None)
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

                return {
                    'access_token': token_data['access_token'],
                    'refresh_token': token_data.get('refresh_token'),
                    'expires_at': None,  # Nextcloud tokens don't expire by default
                }
        except httpx.HTTPStatusError as e:
            logger.error(f"Nextcloud token exchange failed: {e.response.status_code} - {e.response.text}")
            raise CloudProviderError("Failed to get token from Nextcloud.")
        except Exception as e:
            raise CloudProviderError(f"Nextcloud OAuth callback error: {e}")

    def _get_client(self):
        if not self.connection:
            raise CloudProviderError("No connection provided for Nextcloud client.")

        headers = {
            'Authorization': f'Bearer {self.connection.access_token}',
            'OCS-APIRequest': 'true',
        }
        return httpx.Client(headers=headers)

    def get_user_info(self):
        user_info_url = f"{self.host.rstrip('/')}/ocs/v2.php/cloud/user?format=json"
        with self._get_client() as client:
            try:
                response = client.get(user_info_url)
                response.raise_for_status()
                data = response.json()
                user_data = data.get('ocs', {}).get('data', {})
                return {
                    'email': user_data.get('email'),
                    'user_id': user_data.get('id'),
                }
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
                    content = BytesIO(response.read())

                    return {
                        'name': file_name,
                        'size': size,
                        'content': content
                    }
            except httpx.HTTPStatusError as e:
                logger.error(f"Nextcloud download failed: {e}")
                raise CloudProviderError(f"Nextcloud download failed: {e}")
