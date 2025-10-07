from datetime import timedelta

import pytest
from django.utils import timezone

pytestmark = pytest.mark.django_db


class TestShareLinkViewDataView:
    """Tests for the public ShareLinkViewDataView endpoint."""

    def test_get_valid_link_data(self, public_client, share_link):
        url = f"/api/v1/links/{share_link.slug}/view-data/"
        response = public_client.get(url)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(share_link.document.id)
        assert data["name"] == share_link.document.name
        assert "linkSettings" in data
        assert data["linkSettings"]["allowDownload"] is True

    def test_get_expired_link_returns_410(self, public_client, share_link):
        share_link.expires_at = timezone.now() - timedelta(days=1)
        share_link.save()

        url = f"/api/v1/links/{share_link.slug}/view-data/"
        response = public_client.get(url)

        assert response.status_code == 410
        assert response.json()["message"] == "This link has expired."

    def test_get_inactive_link_returns_404(self, public_client, share_link):
        share_link.is_active = False
        share_link.save()

        url = f"/api/v1/links/{share_link.slug}/view-data/"
        response = public_client.get(url)

        assert response.status_code == 404
        assert response.json()["message"] == "This file is not available."

    def test_get_password_protected_link_returns_401(
        self, share_link_with_password, public_client
    ):
        url = f"/api/v1/links/{share_link_with_password.slug}/view-data/"
        response = public_client.get(url)

        assert response.status_code == 401
        data = response.json()
        assert data["message"] == "This link is password-protected. Please enter the password to continue."
