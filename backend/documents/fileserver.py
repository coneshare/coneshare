import os
import requests
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

    def _post(self, endpoint, data):
        url = f'{self.base_url}{endpoint}'
        try:
            response = requests.post(url, json=data, headers=self.headers, timeout=5)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            # In production, you would have more robust logging here.
            # Raising an APIException will result in a 503 Service Unavailable
            # response to the frontend.
            raise APIException(f"File server is unavailable: {e}")

    def generate_upload_url(self, storage_key: str) -> str:
        """Requests a temporary URL for uploading a file."""
        data = {'storage_key': storage_key}
        response_data = self._post('/internal/v1/generate-upload-url', data)
        return response_data.get('url')

    def generate_download_url(self, storage_key: str) -> str:
        """Requests a temporary URL for downloading a file."""
        data = {'storage_key': storage_key}
        response_data = self._post('/internal/v1/generate-download-url', data)
        return response_data.get('url')


# A singleton instance of the client for use throughout the application.
fileserver_client = FileServerClient()
