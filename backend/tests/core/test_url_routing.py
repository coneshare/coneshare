import pytest
from rest_framework import status
from rest_framework.test import APIClient


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "path",
    [
        "/apikeys.txt",
        "/apis/.env",
        "/apis/.env.production",
        "/apis/phpinfo.php",
        "/apiXYZ",
        "/api/v1/nonexistent-endpoint/",
        "/api/schema/nonexistent/",
        "/nonexistent-path/",
        "/unknown/sub/path",
    ],
)
def test_unmatched_routes_return_404_not_500(client, path):
    """
    Ensure unmatched paths (including paths starting with /api or /apis)
    return HTTP 404 Not Found rather than raising TemplateDoesNotExist (HTTP 500).
    Ref: https://github.com/coneshare/coneshare/issues/302
    """
    response = client.get(path)
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_registered_api_routes_accessible(client):
    """
    Ensure registered public API endpoints continue to resolve properly.
    """
    response = client.get("/api/v1/languages/")
    assert response.status_code == status.HTTP_200_OK

    response = client.get("/api/v1/public/settings/")
    assert response.status_code == status.HTTP_200_OK
