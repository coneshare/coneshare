from unittest.mock import patch
import pytest
from django.urls import resolve, Resolver404
from rest_framework import status
from documents.models import Document, Folder
from documents.views import (
    DocumentViewSet,
    DocumentUploadRequestView,
    DocumentUploadFinalizeView,
    DocumentVersionUploadRequestView,
    DocumentVersionUploadFinalizeView,
)
from datarooms.views import DataroomViewSet
from sharelinks.views import ShareLinkViewSet
from analytics.views import AllViewSessionsView, ViewSessionDetailView
from core.admin_views import AdminUserViewSet, AdminLoginActivityViewSet


@pytest.mark.django_db
class TestMCPURLContracts:
    """
    Contract tests asserting that every endpoint invoked by the MCP server
    cleanly resolves to the expected DRF view/action in Django URLconf.
    """

    def test_legacy_analytics_document_url_does_not_exist(self):
        """The route /analytics/documents/{id}/ called by older MCP client does not exist."""
        with pytest.raises(Resolver404):
            resolve("/api/v1/analytics/documents/01ARZ3NDEKTSV4RRFFQ69G5FAV/")

    def test_document_stats_url_resolves_to_document_viewset_stats(self):
        """Document engagement stats live on /documents/{id}/stats/."""
        match = resolve("/api/v1/documents/01ARZ3NDEKTSV4RRFFQ69G5FAV/stats/")
        assert match.func.cls == DocumentViewSet
        assert match.func.actions.get('get') == 'stats'

    def test_dataroom_remove_content_url_resolves(self):
        match = resolve("/api/v1/datarooms/01ARZ3NDEKTSV4RRFFQ69G5FAV/remove-content/")
        assert match.func.cls == DataroomViewSet
        assert match.func.actions.get('post') == 'remove_content'

    def test_document_upload_urls_resolve(self):
        match_req = resolve("/api/v1/uploads/document/request/")
        assert match_req.func.view_class == DocumentUploadRequestView

        match_fin = resolve("/api/v1/uploads/document/finalize/")
        assert match_fin.func.view_class == DocumentUploadFinalizeView

    def test_all_mcp_client_endpoints_resolve(self):
        """
        Verify the complete inventory of paths called by ConeshareClient
        against Django URLconf.
        """
        sample_id = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
        expected_endpoints = [
            # Documents & Folders
            ("/api/v1/documents/", DocumentViewSet),
            (f"/api/v1/documents/{sample_id}/", DocumentViewSet),
            (f"/api/v1/documents/{sample_id}/stats/", DocumentViewSet),
            ("/api/v1/folders/", None),
            (f"/api/v1/folders/{sample_id}/", None),
            ("/api/v1/actions/move/", None),
            ("/api/v1/uploads/document/request/", DocumentUploadRequestView),
            ("/api/v1/uploads/document/finalize/", DocumentUploadFinalizeView),
            (f"/api/v1/uploads/document/{sample_id}/versions/request/", DocumentVersionUploadRequestView),
            (f"/api/v1/uploads/document/{sample_id}/versions/finalize/", DocumentVersionUploadFinalizeView),
            # Datarooms
            ("/api/v1/datarooms/", DataroomViewSet),
            (f"/api/v1/datarooms/{sample_id}/", DataroomViewSet),
            (f"/api/v1/datarooms/{sample_id}/search/", DataroomViewSet),
            (f"/api/v1/datarooms/{sample_id}/add-content/", DataroomViewSet),
            (f"/api/v1/datarooms/{sample_id}/remove-content/", DataroomViewSet),
            # Share Links
            ("/api/v1/share-links/", ShareLinkViewSet),
            (f"/api/v1/share-links/{sample_id}/", ShareLinkViewSet),
            # Analytics
            ("/api/v1/analytics/view-sessions/", AllViewSessionsView),
            (f"/api/v1/analytics/view-sessions/{sample_id}/", ViewSessionDetailView),
            # Admin
            ("/api/v1/admin/users/", AdminUserViewSet),
            (f"/api/v1/admin/users/{sample_id}/", AdminUserViewSet),
            ("/api/v1/admin/login-activities/", AdminLoginActivityViewSet),
        ]

        for path, expected_cls in expected_endpoints:
            match = resolve(path)
            if expected_cls is not None:
                view_cls = getattr(match.func, 'cls', getattr(match.func, 'view_class', None))
                assert view_cls == expected_cls, f"Expected {expected_cls} for {path}, got {view_cls}"


@pytest.mark.django_db
class TestMCPIntegrationLiveContracts:
    """
    Live integration contract tests asserting that MCP client request payloads correctly
    execute against DRF views with real API Key authentication and database persistence.
    These run automatically on GitHub CI during backend testing.
    """

    @pytest.fixture
    def mcp_api_client(self, user):
        from rest_framework.test import APIClient
        from core.models import APIKey
        from core.authentication import generate_raw_api_key

        client = APIClient()
        raw_key, prefix, hashed = generate_raw_api_key()
        APIKey.objects.create(user=user, name="MCP CI Key", prefix=prefix, hashed_key=hashed, tier="full_access")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        return client

    def test_dataroom_remove_content_with_dataroom_document_ids_returns_204(self, mcp_api_client, dataroom, document):
        """MCP remove_content_from_dataroom sending dataroom_document_ids successfully removes items."""
        from rest_framework import status
        from datarooms.models import DataroomDocument

        DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        assert DataroomDocument.objects.filter(dataroom=dataroom).count() == 1

        url = f"/api/v1/datarooms/{dataroom.id}/remove-content/"
        res = mcp_api_client.post(url, {"dataroom_document_ids": [str(document.id)]}, format="json")
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert DataroomDocument.objects.filter(dataroom=dataroom).count() == 0

    def test_dataroom_remove_content_with_wrong_keys_returns_clean_400(self, mcp_api_client, dataroom, document):
        """When an agent sends wrong keys (e.g. document_ids), return clean 400 with actionable error message."""
        from rest_framework import status
        from datarooms.models import DataroomDocument

        DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        url = f"/api/v1/datarooms/{dataroom.id}/remove-content/"
        res = mcp_api_client.post(url, {"document_ids": [str(document.id)]}, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        data = res.json()
        assert "non_field_errors" in data
        assert "Either 'dataroom_document_ids' or 'dataroom_folder_ids' must be provided." in data["non_field_errors"]

    def test_document_stats_endpoint_returns_200(self, mcp_api_client, document):
        """MCP get_document_analytics calling /documents/{id}/stats/ returns engagement statistics."""
        from rest_framework import status

        url = f"/api/v1/documents/{document.id}/stats/"
        res = mcp_api_client.get(url)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert "total_views" in data
        assert "total_duration_seconds" in data
        assert "avg_duration_seconds" in data

    @patch('documents.views.fileserver_client.generate_upload_url', return_value='http://fileserver/upload')
    def test_document_upload_request_with_normalized_folder_path(self, mock_gen_url, mcp_api_client, user, organization):
        """MCP request_document_upload sending normalized folder/file_name targets existing folder."""
        from rest_framework import status
        from documents.models import Folder

        root_folder = Folder.objects.filter(organization=organization, name="__root__").first()
        Folder.objects.create(name="finance", organization=organization, created_by=user, parent=root_folder)

        url = "/api/v1/uploads/document/request/"
        payload = {
            "file_name": "quarterly_report.pdf",
            "file_size": 10240,
            "path": "finance/quarterly_report.pdf",
        }
        res = mcp_api_client.post(url, payload, format="json")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert "upload_url" in data
        assert "storage_key" in data
        assert "unique_name" in data

    def test_search_documents_endpoint_contract(self, mcp_api_client, user, organization):
        """MCP search_documents calling /documents/?search=query&page=1&page_size=20 returns paginated matches."""
        from rest_framework import status
        from documents.models import Document, Folder

        root_folder = Folder.objects.filter(organization=organization, name="__root__").first()
        sub_folder = Folder.objects.create(name="Contracts", organization=organization, created_by=user, parent=root_folder)
        doc1 = Document.objects.create(name="Vendor_Agreement.pdf", organization=organization, created_by=user, folder=sub_folder)
        Document.objects.create(name="Other.pdf", organization=organization, created_by=user, folder=sub_folder)

        url = "/api/v1/documents/?search=Vendor&page=1&page_size=20"
        res = mcp_api_client.get(url)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["count"] == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["id"] == str(doc1.id)
        assert data["results"][0]["name"] == "Vendor_Agreement.pdf"

    def test_list_datarooms_name_filter_and_search_content_contracts(self, mcp_api_client, user, organization):
        """MCP list_datarooms(name=...) and search_dataroom_content(dataroom_id, query) match backend endpoints."""
        from rest_framework import status
        from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
        from documents.models import Document, Folder

        room = Dataroom.objects.create(name="Series A Data Room", organization=organization, created_by=user)
        Dataroom.objects.create(name="Other Room", organization=organization, created_by=user)
        dr_folder = DataroomFolder.objects.create(dataroom=room, name="Finance", created_by=user)
        root_folder = Folder.objects.get(organization=organization, name="__root__", parent=None)
        doc = Document.objects.create(name="Annual_Budget.pdf", organization=organization, created_by=user, folder=root_folder)
        DataroomDocument.objects.create(dataroom=room, document=doc, folder=dr_folder, name="Annual_Budget.pdf")

        list_res = mcp_api_client.get("/api/v1/datarooms/?search=Series")
        assert list_res.status_code == status.HTTP_200_OK
        assert [item["id"] for item in list_res.json()] == [str(room.id)]

        search_res = mcp_api_client.get(f"/api/v1/datarooms/{room.id}/search/?q=Budget")
        assert search_res.status_code == status.HTTP_200_OK
        items = search_res.json()["items"]
        assert len(items) == 1
        assert items[0]["name"] == "Annual_Budget.pdf"
        assert items[0]["location"] == "Finance"

    @patch('documents.views.fileserver_client.get_file_info', return_value={'exists': True, 'size': 15})
    @patch('documents.views.fileserver_client.generate_upload_url', return_value='http://fileserver/upload/tok-md')
    def test_create_text_document_folder_walk_and_finalize_contract(
        self, mock_gen_url, mock_file_info, mcp_api_client, user, organization
    ):
        """MCP create_text_document backend contract: reuse/create folders, request, finalize .md, patch description."""
        root_folder = Folder.objects.get(organization=organization, name="__root__", parent=None)
        existing_notes = Folder.objects.create(name="Notes", organization=organization, created_by=user, parent=root_folder)

        root_list = mcp_api_client.get("/api/v1/folders/")
        assert root_list.status_code == status.HTTP_200_OK
        sub_names = {f["name"]: f["id"] for f in root_list.json()["sub_folders"]}
        assert sub_names["Notes"] == str(existing_notes.id)

        notes_list = mcp_api_client.get(f"/api/v1/folders/{existing_notes.id}/")
        assert notes_list.status_code == status.HTTP_200_OK
        assert notes_list.json()["sub_folders"] == []

        create_2026 = mcp_api_client.post(
            "/api/v1/folders/",
            {"name": "2026", "parent": str(existing_notes.id)},
            format="json",
        )
        assert create_2026.status_code == status.HTTP_201_CREATED

        req_res = mcp_api_client.post(
            "/api/v1/uploads/document/request/",
            {"file_name": "meeting.md", "file_size": 15, "path": "Notes/2026/meeting.md"},
            format="json",
        )
        assert req_res.status_code == status.HTTP_200_OK
        req_data = req_res.json()

        fin_res = mcp_api_client.post(
            "/api/v1/uploads/document/finalize/",
            {
                "storage_key": req_data["storage_key"],
                "unique_name": req_data["unique_name"],
                "content_type": "text/markdown",
                "path": f"Notes/2026/{req_data['unique_name']}",
            },
            format="json",
        )
        assert fin_res.status_code == status.HTTP_202_ACCEPTED
        doc_data = fin_res.json()
        assert doc_data["type"] == "markdown"
        assert doc_data["status"] == "ready"

        patch_res = mcp_api_client.patch(
            f"/api/v1/documents/{doc_data['id']}/",
            {"description": "AI summary note"},
            format="json",
        )
        assert patch_res.status_code == status.HTTP_200_OK
        assert patch_res.json()["description"] == "AI summary note"
        created_doc = Document.objects.get(id=doc_data["id"])
        assert created_doc.folder.name == "2026"
        assert created_doc.folder.parent_id == existing_notes.id

        # Regression: filename-shaped subfolder ("Notes/note.md/note.md") targets folder "note.md"
        note_folder = Folder.objects.create(
            name="note.md", organization=organization, created_by=user, parent=existing_notes
        )
        nested_req = mcp_api_client.post(
            "/api/v1/uploads/document/request/",
            {"file_name": "note.md", "file_size": 15, "path": "Notes/note.md/note.md"},
            format="json",
        )
        assert nested_req.status_code == status.HTTP_200_OK
        nested_req_data = nested_req.json()
        nested_fin = mcp_api_client.post(
            "/api/v1/uploads/document/finalize/",
            {
                "storage_key": nested_req_data["storage_key"],
                "unique_name": nested_req_data["unique_name"],
                "content_type": "text/markdown",
                "path": f"Notes/note.md/{nested_req_data['unique_name']}",
            },
            format="json",
        )
        assert nested_fin.status_code == status.HTTP_202_ACCEPTED
        nested_doc = Document.objects.get(id=nested_fin.json()["id"])
        assert nested_doc.folder_id == note_folder.id

    @patch('documents.views.fileserver_client.get_file_info', return_value={'exists': True, 'size': 24})
    @patch('documents.views.fileserver_client.generate_upload_url', return_value='http://fileserver/upload/tok-v2')
    def test_version_upload_contract_preserves_document_and_share_link(
        self, mock_gen_url, mock_file_info, mcp_api_client, document, share_link
    ):
        """MCP request_version_upload + finalize_version_upload promote v2 while keeping document ID and share link."""
        req_res = mcp_api_client.post(
            f"/api/v1/uploads/document/{document.id}/versions/request/",
            {"file_name": "guide_v2.md", "file_size": 24},
            format="json",
        )
        assert req_res.status_code == status.HTTP_200_OK
        req_data = req_res.json()
        assert "upload_url" in req_data
        assert "storage_key" in req_data

        fin_res = mcp_api_client.post(
            f"/api/v1/uploads/document/{document.id}/versions/finalize/",
            {
                "storage_key": req_data["storage_key"],
                "content_type": "text/markdown",
            },
            format="json",
        )
        assert fin_res.status_code == status.HTTP_202_ACCEPTED
        doc_data = fin_res.json()
        assert doc_data["id"] == str(document.id)
        primary_versions = [v for v in doc_data["versions"] if v["is_primary"]]
        assert len(primary_versions) == 1
        assert primary_versions[0]["version_number"] == 2
        share_link.refresh_from_db()
        assert share_link.document_id == document.id
