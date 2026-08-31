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
        self, api_client, user, other_user, owner_document, co_managed_dataroom
    ):
        # Collaborator can access aggregate stats
        api_client.force_authenticate(user=other_user)
        stats_resp = api_client.get(f"/api/v1/documents/{owner_document.id}/stats/")
        assert stats_resp.status_code == status.HTTP_200_OK
        assert "total_views" in stats_resp.data

        # But collaborator cannot access detailed visitor view-sessions
        sessions_resp = api_client.get(f"/api/v1/documents/{owner_document.id}/view-sessions/")
        assert sessions_resp.status_code == status.HTTP_403_FORBIDDEN

        # Document owner can access detailed view-sessions
        api_client.force_authenticate(user=user)
        owner_sessions_resp = api_client.get(f"/api/v1/documents/{owner_document.id}/view-sessions/")
        assert owner_sessions_resp.status_code == status.HTTP_200_OK


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

    def test_collaborator_cannot_rebuild_preview_of_owner_document(
        self, api_client, other_user, owner_document, co_managed_dataroom
    ):
        api_client.force_authenticate(user=other_user)

        from documents.models import DocumentPage
        primary_version = owner_document.versions.filter(is_primary=True).first()
        DocumentPage.objects.create(
            document_version=primary_version,
            page_number=1,
            storage_key="org/doc/page_1.png",
        )

        resp = api_client.post(f"/api/v1/documents/{owner_document.id}/rebuild-preview/")
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert primary_version.pages.count() == 1

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

    def test_collaborator_cannot_view_owner_direct_share_links_in_document_serializer(
        self, api_client, other_user, user, owner_document, co_managed_dataroom
    ):
        from sharelinks.models import ShareLink
        # Create a direct share link by document owner
        ShareLink.objects.create(
            document=owner_document,
            created_by=user,
            name="Confidential Client Link",
            slug="secret-doc-slug-123"
        )

        # 1. Collaborator retrieves the document
        api_client.force_authenticate(user=other_user)
        response = api_client.get(f"/api/v1/documents/{owner_document.id}/")
        assert response.status_code == status.HTTP_200_OK
        # Must not leak owner's direct share links
        assert response.data.get('share_links') == []
        assert response.data.get('share_link_view_count') == 0

        # 2. Document owner retrieves the document
        api_client.force_authenticate(user=user)
        owner_resp = api_client.get(f"/api/v1/documents/{owner_document.id}/")
        assert owner_resp.status_code == status.HTTP_200_OK
        assert len(owner_resp.data.get('share_links')) == 1
        assert owner_resp.data['share_links'][0]['name'] == "Confidential Client Link"
