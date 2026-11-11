import os
from typing import Any
import requests
from urllib.parse import urljoin
from django.conf import settings
from rest_framework.exceptions import APIException


class FileServerClient:
    """
    A client for communicating with the internal API of the Go file server.
    """
    base_url: str
    token: str

    def __init__(self) -> None:
        base_url = getattr(settings, 'CORE_API_URL', None)
        token = getattr(settings, 'INTERNAL_API_TOKEN', None)
        if not base_url or not token:
            # This will cause Django to fail at startup if the settings are missing,
            # which is a good way to enforce configuration.
            raise RuntimeError("CORE_API_URL and INTERNAL_API_TOKEN must be set.")

        self.base_url = str(base_url)
        self.token = str(token)
        self.headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json',
        }

    def _post(self, endpoint: str, data: dict[str, Any], expect_json: bool = True, timeout: int = 5) -> Any:
        url = urljoin(self.base_url, endpoint)
        try:
            response = requests.post(url, json=data, headers=self.headers, timeout=timeout)
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
        data: dict[str, Any] = {'storage_key': storage_key}
        response_data = self._post('/internal/v1/generate-upload-url', data)
        relative_url = str(response_data.get('url') or '')
        if is_internal:
            return urljoin(self.base_url, relative_url)
        site_domain = settings.SITE_DOMAIN
        assert isinstance(site_domain, str) and site_domain, "SITE_DOMAIN setting must be a non-empty string"
        return urljoin(site_domain, relative_url)

    def generate_download_url(self, storage_key: str, is_internal: bool = True, filename: str | None = None) -> str:
        """Requests a temporary URL for downloading a file."""
        data: dict[str, Any] = {'storage_key': storage_key}
        if filename:
            data['filename'] = filename
        response_data = self._post('/internal/v1/generate-download-url', data)
        relative_url = str(response_data.get('url') or '')
        if is_internal:
            return urljoin(self.base_url, relative_url)
        site_domain = settings.SITE_DOMAIN
        assert isinstance(site_domain, str) and site_domain, "SITE_DOMAIN setting must be a non-empty string"
        return urljoin(site_domain, relative_url)

    def generate_preview_url(self, storage_key: str, is_internal: bool = True, expiry_seconds: int | None = None) -> str:
        """Requests a temporary URL for inline previewing a file."""
        data: dict[str, Any] = {'storage_key': storage_key}
        if expiry_seconds and expiry_seconds > 0:
            data['expiry_seconds'] = expiry_seconds
        response_data = self._post('/internal/v1/generate-preview-url', data)
        relative_url = str(response_data.get('url') or '')
        if is_internal:
            return urljoin(self.base_url, relative_url)
        site_domain = settings.SITE_DOMAIN
        assert isinstance(site_domain, str) and site_domain, "SITE_DOMAIN setting must be a non-empty string"
        return urljoin(site_domain, relative_url)

    def delete_file(self, storage_key: str):
        """Requests deletion of a file from the file server."""
        data: dict[str, Any] = {'storage_key': storage_key}
        self._post('/internal/v1/delete-file', data, expect_json=False)

    def get_file_info(self, storage_key: str) -> dict:
        """Retrieves physical file metadata (exists, size) from the file server."""
        data: dict[str, Any] = {'storage_key': storage_key}
        return self._post('/internal/v1/file-info', data, expect_json=True)

    def copy_file(self, source_storage_key: str, destination_storage_key: str, file_size: int | None = None) -> None:
        """Requests copying of a file on the file server."""
        data = {
            'source_storage_key': source_storage_key,
            'destination_storage_key': destination_storage_key
        }
        # Dynamic timeout: default to 10 seconds, but add 1 second per 10MB of file size, up to 120 seconds.
        timeout = 10
        if file_size:
            # 1 second per 10MB (10 * 1024 * 1024 bytes)
            timeout += file_size // (10 * 1024 * 1024)
            timeout = min(timeout, 120)
        self._post('/internal/v1/copy-file', data, expect_json=False, timeout=timeout)

    def upload_file(self, storage_key: str, data: Any, content_type: str | None = None, timeout: tuple[int, int] = (10, 60)) -> Any:
        """Uploads file content directly using a generated internal upload URL."""
        upload_url = self.generate_upload_url(storage_key, is_internal=True)
        headers = {}
        if content_type:
            headers['Content-Type'] = content_type
        try:
            response = requests.put(upload_url, data=data, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            raise APIException(f"File upload failed: {e}")


# A singleton instance of the client for use throughout the application.
fileserver_client = FileServerClient()
