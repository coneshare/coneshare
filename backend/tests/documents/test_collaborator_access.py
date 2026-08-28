import pytest
from unittest.mock import patch
from rest_framework import status
from django.contrib.auth import get_user_model

from datarooms.models import Dataroom, DataroomDocument, DataroomCollaborator
from documents.models import Document, DocumentVersion

User = get_user_model()


@pytest.fixture
def other_user(db, organization):
    return User.objects.create_user(
        username="collab@example.com",
        email="collab@example.com",
        password="password123",
        organization=organization,
    )


@pytest.fixture
def non_member_user(db, organization):
    return User.objects.create_user(
        username="outsider@example.com",
        email="outsider@example.com",
        password="password123",
        organization=organization,
    )


@pytest.fixture
def owner_document(user, organization):
    doc = Document.objects.create(
        name="Confidential Plan.pdf",
        created_by=user,
        organization=organization,
        status="ready",
        file_size=1024,
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        original_storage_key="org/doc/plan.pdf",
        file_size=1024,
    )
    return doc


@pytest.fixture
def co_managed_dataroom(user, other_user, organization, owner_document):
    room = Dataroom.objects.create(
        name="M&A Deal Room",
        created_by=user,
        organization=organization,
    )
    DataroomCollaborator.objects.create(
        dataroom=room,
        user=other_user,
        invited_by=user,
    )
    DataroomDocument.objects.create(
        dataroom=room,
        document=owner_document,
        name=owner_document.name,
    )
    return room


@pytest.mark.django_db
class TestCollaboratorDocumentAccess:
    def test_collaborator_can_retrieve_dataroom_document(
        self, api_client, other_user, owner_document, co_managed_dataroom
    ):
        api_client.force_authenticate(user=other_user)
        response = api_client.get(f"/api/v1/documents/{owner_document.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(owner_document.id)
        assert response.data["name"] == "Confidential Plan.pdf"
        assert response.data["created_by_user"]["email"] == "test@example.com"

    def test_collaborator_can_view_document_stats_and_sessions(
        self, api_client, other_user, owner_document, co_managed_dataroom
    ):
        api_client.force_authenticate(user=other_user)
        stats_resp = api_client.get(f"/api/v1/documents/{owner_document.id}/stats/")
        assert stats_resp.status_code == status.HTTP_200_OK
        assert "total_views" in stats_resp.data

        sessions_resp = api_client.get(f"/api/v1/documents/{owner_document.id}/view-sessions/")
        assert sessions_resp.status_code == status.HTTP_200_OK

    @patch("documents.views.fileserver_client.generate_download_url")
    def test_collaborator_can_download_document(
        self, mock_generate_url, api_client, other_user, owner_document, co_managed_dataroom
    ):
        mock_generate_url.return_value = "https://download.coneshare.com/plan.pdf"
        api_client.force_authenticate(user=other_user)

        response = api_client.get(f"/api/v1/documents/{owner_document.id}/download/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["download_url"] == "https://download.coneshare.com/plan.pdf"

    def test_collaborator_cannot_mutate_or_delete_owner_document(
        self, api_client, other_user, owner_document, co_managed_dataroom
    ):
        api_client.force_authenticate(user=other_user)

        # Attempt rename
        patch_resp = api_client.patch(
            f"/api/v1/documents/{owner_document.id}/",
            {"name": "Hacked Name.pdf"},
        )
        assert patch_resp.status_code == status.HTTP_403_FORBIDDEN

        # Attempt delete
        del_resp = api_client.delete(f"/api/v1/documents/{owner_document.id}/")
        assert del_resp.status_code == status.HTTP_403_FORBIDDEN

    def test_non_collaborator_gets_404(
        self, api_client, non_member_user, owner_document, co_managed_dataroom
    ):
        api_client.force_authenticate(user=non_member_user)
        response = api_client.get(f"/api/v1/documents/{owner_document.id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_collaborator_personal_library_does_not_list_dataroom_document(
        self, api_client, other_user, owner_document, co_managed_dataroom
    ):
        api_client.force_authenticate(user=other_user)
        response = api_client.get("/api/v1/documents/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        doc_ids = [d["id"] for d in results]
        assert str(owner_document.id) not in doc_ids
