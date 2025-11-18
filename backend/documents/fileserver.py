import os
import requests
from urllib.parse import urljoin
from django.conf import settings
from rest_framework.exceptions import APIException


class FileServerClient:
    """
    A client for communicating with the internal API of the Go file server.
    """
    def __init__(self):
        self.base_url = getattr(settings, 'CORE_API_URL', None)
        self.token = getattr(settings, 'INTERNAL_API_TOKEN', None)
        if not self.base_url or not self.token:
            # This will cause Django to fail at startup if the settings are missing,
            # which is a good way to enforce configuration.
            raise RuntimeError("CORE_API_URL and INTERNAL_API_TOKEN must be set.")

        self.headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json',
        }

    def _post(self, endpoint, data, expect_json=True):
        url = urljoin(self.base_url, endpoint)
        try:
            response = requests.post(url, json=data, headers=self.headers, timeout=5)
            response.raise_for_status()
            if expect_json:
                return response.json()
            return response
        except requests.exceptions.RequestException as e:
            # In production, you would have more robust logging here.
            # Raising an APIException will result in a 503 Service Unavailable
            # response to the frontend.
            raise APIException(f"File server is unavailable: {e}")

    def generate_upload_url(self, storage_key: str, is_internal: bool = True) -> str:
        """Requests a temporary URL for uploading a file."""
        data = {'storage_key': storage_key}
        response_data = self._post('/internal/v1/generate-upload-url', data)
        relative_url = response_data.get('url')
        if is_internal:
            return urljoin(self.base_url, relative_url)
        return urljoin(settings.SITE_DOMAIN, relative_url)

    def generate_download_url(self, storage_key: str, is_internal: bool = True) -> str:
        """Requests a temporary URL for downloading a file."""
        data = {'storage_key': storage_key}
        response_data = self._post('/internal/v1/generate-download-url', data)
        relative_url = response_data.get('url')
        if is_internal:
            return urljoin(self.base_url, relative_url)
        return urljoin(settings.SITE_DOMAIN, relative_url)

    def delete_file(self, storage_key: str):
        """Requests deletion of a file from the file server."""
        data = {'storage_key': storage_key}
        self._post('/internal/v1/delete-file', data, expect_json=False)


# A singleton instance of the client for use throughout the application.
fileserver_client = FileServerClient()
