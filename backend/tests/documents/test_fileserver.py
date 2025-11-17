import pytest
import requests
from unittest.mock import patch, MagicMock
from django.test import override_settings
from rest_framework.exceptions import APIException
from importlib import reload

# The FileServerClient is instantiated at the module level as a singleton.
# We need to import the module itself so we can reload it in tests to
# re-initialize the client with our overridden settings.
from documents import fileserver


@pytest.fixture(autouse=True)
def reload_fileserver_client_with_settings():
    """
    Each test may have different settings. This fixture ensures the fileserver
    module is reloaded for each test, re-instantiating the singleton client
    with the correct settings for that specific test case.
    """
    reload(fileserver)


class TestFileServerClient:

    @override_settings(
        CORE_API_URL="http://core-api.test",
        INTERNAL_API_TOKEN="test-token",
        SITE_DOMAIN="http://coneshare.test"
    )
    @patch('documents.fileserver.requests.post')
    def test_generate_upload_url_internal(self, mock_post):
        """
        Tests that an internal upload URL is correctly formed using CORE_API_URL.
        """
        mock_response = MagicMock()
        mock_response.json.return_value = {'url': '/files/upload/some-token'}
        mock_post.return_value = mock_response

        client = fileserver.FileServerClient()
        result_url = client.generate_upload_url('org/key.pdf', is_internal=True)

        expected_url = 'http://core-api.test/internal/v1/generate-upload-url'
        expected_data = {'storage_key': 'org/key.pdf'}
        mock_post.assert_called_once_with(
            url=expected_url, json=expected_data, headers=client.headers, timeout=5
        )
        assert result_url == "http://core-api.test/files/upload/some-token"

    @override_settings(
        CORE_API_URL="http://core-api.test",
        INTERNAL_API_TOKEN="test-token",
        SITE_DOMAIN="http://coneshare.test"
    )
    @patch('documents.fileserver.requests.post')
    def test_generate_upload_url_external(self, mock_post):
        """
        Tests that an external upload URL is correctly formed using SITE_DOMAIN.
        """
        mock_response = MagicMock()
        mock_response.json.return_value = {'url': '/files/upload/some-token'}
        mock_post.return_value = mock_response

        client = fileserver.FileServerClient()
        result_url = client.generate_upload_url('org/key.pdf', is_internal=False)

        assert result_url == "http://coneshare.test/files/upload/some-token"

    @override_settings(
        CORE_API_URL="http://core-api.test",
        INTERNAL_API_TOKEN="test-token",
        SITE_DOMAIN="http://coneshare.test"
    )
    @patch('documents.fileserver.requests.post')
    def test_generate_download_url_external(self, mock_post):
        """
        Tests that an external download URL is correctly formed using SITE_DOMAIN.
        """
        mock_response = MagicMock()
        mock_response.json.return_value = {'url': '/files/download/some-token'}
        mock_post.return_value = mock_response

        client = fileserver.FileServerClient()
        result_url = client.generate_download_url('org/key.pdf', is_internal=False)

        expected_url = 'http://core-api.test/internal/v1/generate-download-url'
        mock_post.assert_called_once_with(
            url=expected_url, json={'storage_key': 'org/key.pdf'}, headers=client.headers, timeout=5
        )
        assert result_url == "http://coneshare.test/files/download/some-token"

    @override_settings(
        CORE_API_URL="http://core-api.test",
        INTERNAL_API_TOKEN="test-token",
        SITE_DOMAIN="http://coneshare.test"
    )
    @patch('documents.fileserver.requests.post')
    def test_delete_file(self, mock_post):
        """
        Tests that the delete_file method calls the correct endpoint.
        """
        client = fileserver.FileServerClient()
        client.delete_file('org/to-delete.pdf')

        expected_url = 'http://core-api.test/internal/v1/delete-file'
        mock_post.assert_called_once_with(
            url=expected_url, json={'storage_key': 'org/to-delete.pdf'}, headers=client.headers, timeout=5
        )

    @override_settings(
        CORE_API_URL="http://core-api.test",
        INTERNAL_API_TOKEN="test-token",
        SITE_DOMAIN="http://coneshare.test"
    )
    @patch('documents.fileserver.requests.post')
    def test_request_exception_raises_api_exception(self, mock_post):
        """
        Tests that a network error is caught and re-raised as a DRF APIException.
        """
        mock_post.side_effect = requests.exceptions.RequestException("Connection failed")

        client = fileserver.FileServerClient()
        with pytest.raises(APIException) as excinfo:
            client.generate_upload_url('org/key.pdf')

        assert "File server is unavailable" in str(excinfo.value)


# Test initialization failures
def test_client_init_raises_runtime_error_if_settings_missing():
    """
    Tests that FileServerClient raises RuntimeError if settings are not configured.
    """
    with override_settings(CORE_API_URL=None, INTERNAL_API_TOKEN=None):
        with pytest.raises(RuntimeError):
            reload(fileserver)

    with override_settings(CORE_API_URL="http://core-api.test", INTERNAL_API_TOKEN=None):
        with pytest.raises(RuntimeError):
            reload(fileserver)
