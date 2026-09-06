import os
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder, DataroomItemOrder
from datarooms.services import touch_dataroom_folder_ancestors, get_dataroom_storage_used_bytes
from datarooms.utils import get_dataroom_storage_folder_name
from documents.models import Document, Folder
from documents.services import recalculate_user_document_size, is_dataroom_vault_document
from sharelinks.models import DataroomVisit, ShareLink, ViewSession

pytestmark = pytest.mark.django_db


class TestDataroomViewSet:
    def test_list_datarooms_scoped_to_user(self, api_client, user, user2, organization):
        """
        Test retrieving datarooms is scoped to the user who created them.
        """
        Dataroom.objects.create(name="My Dataroom", organization=organization, created_by=user)
        Dataroom.objects.create(name="Other's Dataroom", organization=organization, created_by=user2)

        response = api_client.get('/api/v1/datarooms/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == "My Dataroom"

    def test_list_datarooms_ordered_by_created_at_desc(self, api_client, user, organization):
        """
        Test that datarooms are returned in descending order of creation time (newest first).
        """
        dr1 = Dataroom.objects.create(name="First Room", organization=organization, created_by=user)
        dr2 = Dataroom.objects.create(name="Second Room", organization=organization, created_by=user)
        dr3 = Dataroom.objects.create(name="Third Room", organization=organization, created_by=user)

        Dataroom.objects.filter(id=dr1.id).update(created_at=timezone.now() - timedelta(days=2))
        Dataroom.objects.filter(id=dr2.id).update(created_at=timezone.now() - timedelta(days=1))
        Dataroom.objects.filter(id=dr3.id).update(created_at=timezone.now())

        response = api_client.get('/api/v1/datarooms/')
        assert response.status_code == status.HTTP_200_OK
        names = [item['name'] for item in response.data]
        assert names == ["Third Room", "Second Room", "First Room"]

    def test_create_dataroom(self, api_client, user, organization):
        """Test creating a new dataroom."""
        assert Dataroom.objects.count() == 0
        data = {'name': 'New API Dataroom'}
        response = api_client.post('/api/v1/datarooms/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'New API Dataroom'
        assert Dataroom.objects.count() == 1

        dataroom = Dataroom.objects.first()
        assert dataroom.organization == organization
        assert dataroom.created_by == user

    def test_update_dataroom_branding_fields(self, api_client, dataroom):
        url = f'/api/v1/datarooms/{dataroom.id}/'
        response = api_client.patch(url, {
            "brand_primary_color": "#112233",
            "brand_secondary_color": "#445566",
            "brand_accent_color": "#778899AA",
            "show_file_index": False,
        }, format="json")

        assert response.status_code == status.HTTP_200_OK
        dataroom.refresh_from_db()
        assert dataroom.brand_primary_color == "#112233"
        assert dataroom.brand_secondary_color == "#445566"
        assert dataroom.brand_accent_color == "#778899AA"
        assert dataroom.show_file_index is False

    def test_update_dataroom_branding_invalid_color_fails(self, api_client, dataroom):
        url = f'/api/v1/datarooms/{dataroom.id}/'
        response = api_client.patch(url, {"brand_primary_color": "blue"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "brand_primary_color" in response.data

    def test_remove_dataroom_banner(self, api_client, dataroom):
        dataroom.branding_banner = SimpleUploadedFile("banner.jpg", b"fake-image-bytes", content_type="image/jpeg")
        dataroom.save()
        assert dataroom.branding_banner

        url = f'/api/v1/datarooms/{dataroom.id}/'
        response = api_client.patch(url, {"remove_branding_banner": True}, format="multipart")
        assert response.status_code == status.HTTP_200_OK
        dataroom.refresh_from_db()
        assert not dataroom.branding_banner

    def test_retrieve_dataroom_detail(self, api_client, dataroom, document):
        """Test retrieving a specific dataroom's contents."""
        # Add a document and a folder to the dataroom root
        dataroom_document = DataroomDocument.objects.create(dataroom=dataroom, document=document, folder=None, name=document.name)
        DataroomFolder.objects.create(dataroom=dataroom, name="Subfolder", parent=None)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=dataroom.created_by)
        session = ViewSession.objects.create(share_link=link)
        DataroomVisit.objects.create(view_session=session, dataroom_document=dataroom_document)

        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/')
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data['id'] == str(dataroom.id)
        assert len(data['items']) == 2
        assert data['items'][0]['type'] == 'folder'
        assert data['items'][1]['type'] == 'document'
        assert data['items'][1]['dataroom_view_count'] == 1

    def test_cannot_access_other_users_dataroom_folders(self, api_client, user2, organization):
        """A user cannot list or retrieve folders from a dataroom created by another user."""
        other_dataroom = Dataroom.objects.create(name="Other DR", organization=organization, created_by=user2)
        other_folder = DataroomFolder.objects.create(name="Other Folder", dataroom=other_dataroom)

        # 1. Test listing: should not appear in the general list
        list_url = '/api/v1/dataroom-folders/'
        response = api_client.get(list_url)
        assert response.status_code == status.HTTP_200_OK
        assert not any(f['id'] == str(other_folder.id) for f in response.data)

        # 2. Test direct retrieval: should return 404
        retrieve_url = f'/api/v1/dataroom-folders/{other_folder.id}/'
        response = api_client.get(retrieve_url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_retrieve_folder_contents_is_performant(self, api_client, dataroom, organization, user, django_assert_num_queries):
        """
        Test retrieving a nested folder's contents to check for N+1 query problems,
        especially in the ancestor retrieval logic.
        """
        # Create a nested folder structure to test ancestor lookups
        level1 = DataroomFolder.objects.create(dataroom=dataroom, name="Level 1")
        level2 = DataroomFolder.objects.create(dataroom=dataroom, name="Level 2", parent=level1)
        target_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Target", parent=level2)

        # Create 5 documents in the target folder
        for i in range(5):
            doc = Document.objects.create(name=f"Doc {i}", organization=organization, created_by=user)
            DataroomDocument.objects.create(dataroom=dataroom, document=doc, folder=target_folder, name=doc.name)

        # The number of queries should remain constant regardless of document count.
        # Current expected queries:
        # 1 (get folder + dataroom via select_related) + 1 (get children) + 1 (get documents)
        # + 2 (for 2 ancestors) + 1 (check item-order rows for this scope) = 6
        with django_assert_num_queries(6):
            url = f'/api/v1/dataroom-folders/{target_folder.id}/'
            response = api_client.get(url)
            print(response.json()['ancestors'])
            assert response.status_code == status.HTTP_200_OK
            assert len(response.json()['documents']) == 5
            assert len(response.json()['ancestors']) == 2

    def test_delete_dataroom_permission_denied(self, api_client, user2, organization):
        """Test that a user cannot delete another user's dataroom."""
        dataroom_by_user2 = Dataroom.objects.create(
            organization=organization,
            created_by=user2,
            name="User2's Dataroom"
        )

        response = api_client.delete(f'/api/v1/datarooms/{dataroom_by_user2.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert Dataroom.objects.filter(id=dataroom_by_user2.id).exists()

    def test_delete_dataroom_success(self, api_client, dataroom):
        """Test a user can delete their own dataroom."""
        dataroom_id = dataroom.id
        response = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/')

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Dataroom.objects.filter(id=dataroom_id).exists()

    @patch('documents.services.fileserver_client.delete_file')
    def test_delete_dataroom_with_direct_upload_quota_balance(self, mock_fs_delete, api_client, dataroom, user):
        """
        Reproduction Test:
        1. New user with 0 documents, total_document_size = 0.
        2. Create dataroom and upload a file (~331KB).
        3. Delete the dataroom.
        4. User's total_document_size must be 0, not -331697.
        """
        user.total_document_size = 0
        user.save()

        file_size = 331697
        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/test_file.pdf',
            'unique_name': 'test_file.pdf',
            'file_size': file_size,
            'content_type': 'application/pdf',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        user.refresh_from_db()
        assert user.total_document_size == 0

        # Delete dataroom
        res_delete = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/')
        assert res_delete.status_code == status.HTTP_204_NO_CONTENT

        user.refresh_from_db()
        assert user.total_document_size == 0, f"Expected total_document_size to be 0, got {user.total_document_size}"

    @patch('documents.services.fileserver_client.generate_upload_url', return_value='http://fileserver/upload')
    @patch('documents.services.fileserver_client.delete_file')
    def test_direct_upload_does_not_consume_user_personal_quota(self, mock_fs_delete, mock_fs_upload, api_client, user, organization):
        """
        Option A verification:
        A user has a 10 MB personal quota.
        The dataroom has a 500 MB capacity.
        Uploading a 50 MB file directly to the dataroom must NOT be blocked by the user's personal quota,
        must NOT increment the user's personal total_document_size, and must NOT block subsequent uploads
        to the user's personal workspace.
        """
        user.custom_file_size_quota_mb = 10
        user.total_document_size = 0
        user.save()

        dataroom = Dataroom.objects.create(
            name="Deal Dataroom",
            organization=organization,
            created_by=user,
            storage_quota_mb=500,
            storage_version=2
        )

        file_size = 50 * 1024 * 1024  # 50 MB (exceeds user's 10 MB personal quota)
        url_request = f'/api/v1/datarooms/{dataroom.id}/uploads/request/'
        data_request = {
            'file_name': 'big_deal_deck.pdf',
            'file_size': file_size,
        }
        res_req = api_client.post(url_request, data_request, format='json')
        assert res_req.status_code == status.HTTP_200_OK, f"Expected 200, got {res_req.status_code}: {res_req.data}"

        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/big_deal_deck.pdf',
            'unique_name': res_req.data.get('unique_name', 'big_deal_deck.pdf'),
            'file_size': file_size,
            'content_type': 'application/pdf',
        }
        res_fin = api_client.post(url_finalize, data_finalize, format='json')
        assert res_fin.status_code == status.HTTP_202_ACCEPTED

        # 1. User's personal total_document_size must remain 0
        user.refresh_from_db()
        assert user.total_document_size == 0, f"Expected user personal quota usage to be 0, got {user.total_document_size}"

        # 2. Recalculating user quota must also yield 0
        assert recalculate_user_document_size(user) == 0

        # 3. Dataroom's storage usage must record the 50 MB
        assert get_dataroom_storage_used_bytes(dataroom) == file_size

        # 4. User should still be able to upload to their personal workspace (5 MB <= 10 MB)
        res_personal = api_client.post('/api/v1/uploads/document/request/', {
            'file_name': 'personal_notes.pdf',
            'file_size': 5 * 1024 * 1024,
        }, format='json')
        assert res_personal.status_code == status.HTTP_200_OK

    @patch('documents.services.fileserver_client.generate_upload_url', return_value='http://fileserver/upload')
    @patch('documents.services.fileserver_client.delete_file')
    def test_legacy_v1_direct_upload_consumes_user_personal_quota(self, mock_fs_delete, mock_fs_upload, api_client, user, organization):
        """
        Legacy v1 verification:
        Legacy v1 datarooms store direct uploads under personal storage ('Dataroom Uploads').
        1. Direct upload request checks personal quota and blocks if exceeded.
        2. Successful v1 upload increments user.total_document_size.
        3. Recalculate includes legacy personal files.
        4. Upgrading the dataroom to v2 moves files to '__datarooms__' vault and frees personal quota upon recalculation.
        """
        user.custom_file_size_quota_mb = 10
        user.total_document_size = 0
        user.save()

        dataroom = Dataroom.objects.create(
            name="Legacy Room",
            organization=organization,
            created_by=user,
            storage_quota_mb=500,
            storage_version=1
        )

        # 1. Attempt upload that exceeds personal quota (15 MB > 10 MB) -> must fail with 400
        url_request = f'/api/v1/datarooms/{dataroom.id}/uploads/request/'
        res_fail = api_client.post(url_request, {'file_name': 'too_big.pdf', 'file_size': 15 * 1024 * 1024}, format='json')
        assert res_fail.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceed your storage quota" in res_fail.data['detail']

        # 2. Upload a file at root and a file in a subfolder within personal quota
        file_size = 2 * 1024 * 1024
        res_ok = api_client.post(url_request, {'file_name': 'doc.pdf', 'file_size': file_size}, format='json')
        assert res_ok.status_code == status.HTTP_200_OK

        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        res_fin = api_client.post(url_finalize, {
            'storage_key': 'org_1/uploads/doc.pdf',
            'unique_name': res_ok.data.get('unique_name', 'doc.pdf'),
            'file_size': file_size,
            'content_type': 'application/pdf',
        }, format='json')
        assert res_fin.status_code == status.HTTP_202_ACCEPTED

        # Upload a second file inside a subfolder
        finance_folder = DataroomFolder.objects.create(dataroom=dataroom, name='Finance', created_by=user)
        subfolder_file_size = 1 * 1024 * 1024
        res_sub_req = api_client.post(url_request, {'file_name': 'sub_doc.pdf', 'file_size': subfolder_file_size, 'destination_folder_id': finance_folder.id}, format='json')
        assert res_sub_req.status_code == status.HTTP_200_OK

        res_sub_fin = api_client.post(url_finalize, {
            'storage_key': 'org_1/uploads/sub_doc.pdf',
            'unique_name': res_sub_req.data.get('unique_name', 'sub_doc.pdf'),
            'file_size': subfolder_file_size,
            'content_type': 'application/pdf',
            'destination_folder_id': finance_folder.id
        }, format='json')
        assert res_sub_fin.status_code == status.HTTP_202_ACCEPTED

        total_uploaded = file_size + subfolder_file_size
        user.refresh_from_db()
        assert user.total_document_size == total_uploaded
        assert recalculate_user_document_size(user) == total_uploaded

        # 3. Upgrade dataroom to v2 (moves backing documents including subfolders to __datarooms__ vault)
        res_upgrade = api_client.post(f'/api/v1/datarooms/{dataroom.id}/upgrade-storage/')
        assert res_upgrade.status_code == status.HTTP_200_OK
        dataroom.refresh_from_db()
        assert dataroom.storage_version == 2

        # 4. Upgrading automatically recalculated and freed the uploader's personal quota
        user.refresh_from_db()
        assert user.total_document_size == 0
        assert recalculate_user_document_size(user) == 0

    @patch('documents.services.fileserver_client.delete_file')
    def test_delete_dataroom_with_shared_direct_upload_preserves_shared_document(self, mock_fs_delete, api_client, dataroom, user, organization):

        """
        Test that deleting a dataroom preserves backing documents that are also linked
        in another dataroom.
        """
        second_dataroom = Dataroom.objects.create(
            name="Second Dataroom",
            organization=organization,
            created_by=user
        )

        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/shared_file.pdf',
            'unique_name': 'shared_file.pdf',
            'file_size': 1024,
            'content_type': 'application/pdf',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        doc = Document.objects.get(name='shared_file.pdf')

        # Link the document to the second dataroom as well
        DataroomDocument.objects.create(
            dataroom=second_dataroom,
            document=doc,
            name='shared_file.pdf'
        )

        # Delete the first dataroom
        res_delete = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/')
        assert res_delete.status_code == status.HTTP_204_NO_CONTENT

        # The document and storage files must be preserved for second_dataroom
        assert Document.objects.filter(id=doc.id).exists()
        assert DataroomDocument.objects.filter(dataroom=second_dataroom, document=doc).exists()
        mock_fs_delete.assert_not_called()

    @patch('documents.services.fileserver_client.delete_file')
    def test_delete_dataroom_with_colliding_shared_documents_handles_name_collisions_gracefully(self, mock_fs_delete, api_client, dataroom, user, organization):
        """
        Test that delete_dataroom handles name collisions gracefully when relocating multiple
        surviving documents (with the same name in different subfolders) to the system vault.
        """
        from documents.models import Folder
        from datarooms.services import get_or_create_dataroom_storage_folder
        second_dataroom = Dataroom.objects.create(
            name="Second Dataroom",
            organization=organization,
            created_by=user
        )

        storage_folder = get_or_create_dataroom_storage_folder(dataroom)
        system_vault = storage_folder.parent

        # Create two physical subfolders in storage_folder
        sub1, _ = Folder.get_or_create_vault_subfolder(
            organization=organization,
            parent=storage_folder,
            name="Sub1",
        )
        sub2, _ = Folder.get_or_create_vault_subfolder(
            organization=organization,
            parent=storage_folder,
            name="Sub2",
        )

        # Create two physical documents with the same name in different subfolders
        doc1 = Document.objects.create(name="Contract.pdf", folder=sub1, created_by=user, organization=organization)
        doc2 = Document.objects.create(name="Contract.pdf", folder=sub2, created_by=user, organization=organization)

        # Link both to the dataroom being deleted as direct uploads
        DataroomDocument.objects.create(dataroom=dataroom, document=doc1, name="Contract.pdf", is_direct_upload=True)
        DataroomDocument.objects.create(dataroom=dataroom, document=doc2, name="Contract.pdf", is_direct_upload=True)

        # Also link both to second_dataroom so they are preserved
        DataroomDocument.objects.create(dataroom=second_dataroom, document=doc1, name="Contract.pdf")
        DataroomDocument.objects.create(dataroom=second_dataroom, document=doc2, name="Contract.pdf")

        # Delete the first dataroom - should succeed with 204 without IntegrityError 500
        res_delete = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/')
        assert res_delete.status_code == status.HTTP_204_NO_CONTENT

        # Both documents must still exist and be relocated under system_vault with distinct names
        doc1.refresh_from_db()
        doc2.refresh_from_db()
        assert doc1.folder == system_vault
        assert doc2.folder == system_vault
        assert doc1.name != doc2.name
        assert {doc1.name, doc2.name} == {"Contract.pdf", "Contract (2).pdf"}

    @patch('documents.services.fileserver_client.delete_file')
    def test_delete_dataroom_when_created_by_is_none(self, mock_fs_delete, api_client, dataroom, user):
        """
        Test that delete_dataroom cleans up storage and backing folders even if
        dataroom.created_by is None (e.g. user was deleted).
        """
        from datarooms.services import delete_dataroom

        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/orphan_file.pdf',
            'unique_name': 'orphan_file.pdf',
            'file_size': 2048,
            'content_type': 'application/pdf',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED
        doc = Document.objects.get(name='orphan_file.pdf')

        # Simulate user deletion where created_by is SET_NULL
        dataroom.created_by = None
        dataroom.save()

        delete_dataroom(dataroom)

        assert not Document.objects.filter(id=doc.id).exists()
        assert not Dataroom.objects.filter(id=dataroom.id).exists()
        mock_fs_delete.assert_called_with('org_1/uploads/orphan_file.pdf')

    def test_add_content_to_dataroom(self, api_client, dataroom, document):
        """Test adding documents to a dataroom."""
        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        data = {'document_ids': [str(document.id)]}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=document).exists()
        ddoc = DataroomDocument.objects.get(dataroom=dataroom, document=document)
        assert ddoc.name == document.name

    def test_add_content_exceeding_dataroom_storage_quota_is_rejected(self, api_client, dataroom, user, organization):
        """Test adding workspace content that would exceed dataroom storage_quota_mb is rejected with 400."""
        dataroom.storage_quota_mb = 10  # 10 MB cap
        dataroom.save(update_fields=['storage_quota_mb'])

        doc = Document.objects.create(
            name="Large Contract.pdf",
            organization=organization,
            created_by=user,
            file_size=15 * 1024 * 1024  # 15 MB
        )

        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        response = api_client.post(url, {'document_ids': [str(doc.id)]})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "storage limit" in response.json()['detail'].lower()
        assert not DataroomDocument.objects.filter(dataroom=dataroom, document=doc).exists()

    def test_upload_finalize_exceeding_dataroom_storage_quota_is_rejected(self, api_client, dataroom, user, organization):
        """Test that upload_finalize enforces dataroom storage_quota_mb under transaction lock."""
        dataroom.storage_quota_mb = 10  # 10 MB cap
        dataroom.save(update_fields=['storage_quota_mb'])

        # Pre-fill 8 MB
        existing_doc = Document.objects.create(
            name="Existing.pdf",
            organization=organization,
            created_by=user,
            file_size=8 * 1024 * 1024
        )
        DataroomDocument.objects.create(dataroom=dataroom, document=existing_doc, name="Existing.pdf")

        # Try to finalize an upload of 5 MB (total 13 MB > 10 MB)
        url = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data = {
            'storage_key': 'org_1/uploads/overflow.pdf',
            'unique_name': 'overflow.pdf',
            'file_size': 5 * 1024 * 1024,
            'content_type': 'application/pdf',
        }
        response = api_client.post(url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "storage limit" in response.json()['detail'].lower()

    def test_add_folder_content_exceeding_dataroom_storage_quota_is_rejected(self, api_client, dataroom, user, organization):
        """Test adding workspace folder with documents that would exceed dataroom storage_quota_mb is rejected."""
        from documents.models import Folder
        dataroom.storage_quota_mb = 10  # 10 MB cap
        dataroom.save(update_fields=['storage_quota_mb'])

        root_folder = Folder.objects.get(name="__root__", organization=organization, parent=None)
        folder = Folder.objects.create(name="Contracts", parent=root_folder, created_by=user, organization=organization)
        subfolder = Folder.objects.create(name="2026", parent=folder, created_by=user, organization=organization)

        Document.objects.create(
            name="Contract A.pdf",
            folder=subfolder,
            organization=organization,
            created_by=user,
            file_size=12 * 1024 * 1024  # 12 MB > 10 MB
        )

        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        response = api_client.post(url, {'folder_ids': [str(folder.id)]})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "storage limit" in response.json()['detail'].lower()
        assert not DataroomFolder.objects.filter(dataroom=dataroom, name="Contracts").exists()

    def test_add_existing_document_to_another_folder_does_not_double_count_quota(self, api_client, dataroom, user, organization):
        """Test that linking an existing document into a second folder doesn't fail quota when space is available."""
        dataroom.storage_quota_mb = 10  # 10 MB cap
        dataroom.save(update_fields=['storage_quota_mb'])

        doc = Document.objects.create(
            name="Shared Doc.pdf",
            organization=organization,
            created_by=user,
            file_size=8 * 1024 * 1024  # 8 MB <= 10 MB
        )
        DataroomDocument.objects.create(dataroom=dataroom, document=doc, name="Shared Doc.pdf")

        # Create a second visual folder
        folder2 = DataroomFolder.objects.create(dataroom=dataroom, name="Folder 2")

        # Adding the same doc to Folder 2 adds 0 bytes of new physical storage
        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        response = api_client.post(url, {'document_ids': [str(doc.id)], 'destination_folder_id': str(folder2.id)})

        assert response.status_code == status.HTTP_200_OK
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=doc).count() == 2

    def test_add_content_permission_denied_for_other_user_content(self, api_client, user, user2, document):
        """
        Test that a user cannot add documents or folders owned by another user
        to their dataroom.
        """
        # `document` is created by `user`
        assert document.created_by == user

        # `user2` creates a dataroom that they own
        dataroom_by_user2 = Dataroom.objects.create(name="User2's Dataroom", organization=user2.organization, created_by=user2)

        # `user2` logs in
        api_client.force_authenticate(user=user2)

        # `user2` tries to add `user`'s document to their dataroom
        url = f'/api/v1/datarooms/{dataroom_by_user2.id}/add-content/'
        data = {'document_ids': [str(document.id)]}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "You do not have permission" in response.data['detail']
        assert DataroomDocument.objects.count() == 0

    def test_add_content_updates_existing_share_links(self, api_client, dataroom, document, user):
        """
        Test that adding content to a dataroom automatically updates existing
        share links with the new item settings.
        """
        # 1. Create a share link for the dataroom while it's empty.
        link = ShareLink.objects.create(dataroom=dataroom, name="Existing Link", created_by=user)
        assert link.dataroom_settings.count() == 0

        # 2. Add a document to the dataroom via the API.
        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        data = {'document_ids': [str(document.id)]}
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK

        # 3. Verify the existing share link now has a setting for the new document.
        link.refresh_from_db()
        assert link.dataroom_settings.count() == 1
        setting = link.dataroom_settings.first()
        assert setting.dataroom_document.document == document

    def test_add_folder_content_to_dataroom(self, api_client, dataroom, user, organization, document):
        """Test adding a folder with its contents to a dataroom."""
        root_folder = Folder.objects.get_root_for_org(organization)
        source_folder = Folder.objects.create(name="Source", created_by=user, organization=organization, parent=root_folder)
        # Put the document inside the source folder
        document.folder = source_folder
        document.save()

        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        data = {'folder_ids': [str(source_folder.id)]}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert DataroomFolder.objects.filter(dataroom=dataroom, name="Source").exists()
        dataroom_folder = DataroomFolder.objects.get(dataroom=dataroom, name="Source")
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=document, folder=dataroom_folder).exists()
        ddoc = DataroomDocument.objects.get(dataroom=dataroom, document=document, folder=dataroom_folder)
        assert ddoc.name == document.name

    def test_add_document_with_name_conflict_is_renamed(self, api_client, dataroom, document):
        """
        Test adding a document to a dataroom folder where a document with the
        same name already exists results in renaming.
        """
        # 1. Add the document once.
        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        data = {'document_ids': [str(document.id)]}
        response1 = api_client.post(url, data)
        assert response1.status_code == status.HTTP_200_OK
        assert DataroomDocument.objects.filter(name=document.name).count() == 1

        # 2. Add the same document to the same location again.
        response2 = api_client.post(url, data)
        assert response2.status_code == status.HTTP_200_OK

        # 3. Verify there are now two DataroomDocument objects and one is renamed.
        assert DataroomDocument.objects.filter(document=document).count() == 2
        base, ext = os.path.splitext(document.name)
        new_name = f"{base} (2){ext}"
        assert DataroomDocument.objects.filter(name=new_name).exists()

    def test_add_same_document_to_multiple_locations(self, api_client, dataroom, document):
        """
        Test that the same source document can be added to multiple locations
        (e.g., root and a subfolder) inside a dataroom.
        """
        # 1. Create a destination folder in the dataroom.
        dest_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Destination")

        # 2. Add the document to the root of the dataroom.
        add_to_root_url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        add_to_root_data = {'document_ids': [str(document.id)]}
        api_client.post(add_to_root_url, add_to_root_data)

        # 3. Add the same document to the destination folder.
        add_to_folder_url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        add_to_folder_data = {
            'document_ids': [str(document.id)],
            'destination_folder_id': str(dest_folder.id)
        }
        api_client.post(add_to_folder_url, add_to_folder_data)

        # 4. Assert that two DataroomDocument entries now exist for the same source document.
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=document).count() == 2
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=document, folder=None).exists()
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=document, folder=dest_folder).exists()

    def test_remove_content_from_dataroom(self, api_client, dataroom, document):
        """Test removing content from a dataroom."""
        dd = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        assert DataroomDocument.objects.count() == 1

        url = f'/api/v1/datarooms/{dataroom.id}/remove-content/'
        data = {'dataroom_document_ids': [str(dd.id)]}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert DataroomDocument.objects.count() == 0

    def test_move_document_to_folder(self, api_client, dataroom, document):
        """Test moving a document into a folder within a dataroom."""
        dataroom_doc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        dataroom_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Destination")

        url = f'/api/v1/datarooms/{dataroom.id}/move-content/'
        data = {
            'dataroom_document_ids': [str(dataroom_doc.id)],
            'destination_folder_id': str(dataroom_folder.id)
        }
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        dataroom_doc.refresh_from_db()
        assert dataroom_doc.folder == dataroom_folder

    def test_move_folder_to_root(self, api_client, dataroom):
        """Test moving a folder back to the dataroom root."""
        parent = DataroomFolder.objects.create(dataroom=dataroom, name="Parent")
        child = DataroomFolder.objects.create(dataroom=dataroom, name="Child", parent=parent)

        url = f'/api/v1/datarooms/{dataroom.id}/move-content/'
        data = {
            'dataroom_folder_ids': [str(child.id)],
            'destination_folder_id': ''
        }
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        child.refresh_from_db()
        assert child.parent is None

    def test_move_folder_into_itself_fails(self, api_client, dataroom):
        """Test that moving a folder into itself is not allowed."""
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="Folder")
        url = f'/api/v1/datarooms/{dataroom.id}/move-content/'
        data = {
            'dataroom_folder_ids': [str(folder.id)],
            'destination_folder_id': str(folder.id)
        }
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_move_folder_with_conflict_resolves_name(self, api_client, dataroom):
        """Test that moving a folder into a location with a name conflict results in renaming."""
        folder_to_move = DataroomFolder.objects.create(dataroom=dataroom, name="My Folder")
        destination_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Destination")
        
        # Create conflicting folders in the destination
        DataroomFolder.objects.create(dataroom=dataroom, parent=destination_folder, name="My Folder")
        DataroomFolder.objects.create(dataroom=dataroom, parent=destination_folder, name="My Folder (2)")

        url = f'/api/v1/datarooms/{dataroom.id}/move-content/'
        data = {
            'dataroom_folder_ids': [str(folder_to_move.id)],
            'destination_folder_id': str(destination_folder.id)
        }
        response = api_client.post(url, data)
        
        assert response.status_code == status.HTTP_200_OK
        folder_to_move.refresh_from_db()
        assert folder_to_move.parent == destination_folder
        assert folder_to_move.name == "My Folder (3)"

    def test_reorder_items_mixed_root_success(self, api_client, dataroom, document, user, organization):
        doc2 = Document.objects.create(name="Doc 2", organization=organization, created_by=user)
        folder_a = DataroomFolder.objects.create(dataroom=dataroom, name="A")
        ddoc1 = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        folder_b = DataroomFolder.objects.create(dataroom=dataroom, name="B")
        ddoc2 = DataroomDocument.objects.create(dataroom=dataroom, document=doc2, name=doc2.name)
        dataroom.show_file_index = True
        dataroom.save(update_fields=["show_file_index"])

        url = f'/api/v1/datarooms/{dataroom.id}/reorder-items/'
        response = api_client.post(url, {
            "ordered_items": [
                {"type": "document", "id": str(ddoc2.id)},
                {"type": "folder", "id": str(folder_b.id)},
                {"type": "document", "id": str(ddoc1.id)},
                {"type": "folder", "id": str(folder_a.id)},
            ],
        }, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder__isnull=True).count() == 4
        ordered_rows = list(
            DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder__isnull=True)
            .order_by("position")
        )
        assert ordered_rows[0].item_type == DataroomItemOrder.ITEM_TYPE_DOCUMENT
        assert str(ordered_rows[0].dataroom_document_id) == str(ddoc2.id)
        assert ordered_rows[1].item_type == DataroomItemOrder.ITEM_TYPE_FOLDER
        assert str(ordered_rows[1].folder_id) == str(folder_b.id)
        assert ordered_rows[2].item_type == DataroomItemOrder.ITEM_TYPE_DOCUMENT
        assert str(ordered_rows[2].dataroom_document_id) == str(ddoc1.id)
        assert ordered_rows[3].item_type == DataroomItemOrder.ITEM_TYPE_FOLDER
        assert str(ordered_rows[3].folder_id) == str(folder_a.id)

    def test_reorder_items_requires_full_scope_ids(self, api_client, dataroom, document):
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="A")
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        dataroom.show_file_index = True
        dataroom.save(update_fields=["show_file_index"])

        url = f'/api/v1/datarooms/{dataroom.id}/reorder-items/'
        response = api_client.post(url, {
            "ordered_items": [
                {"type": "folder", "id": str(folder.id)},
            ],
        }, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "ordered_items" in response.data["detail"]

    def test_dataroom_root_items_excludes_soft_deleted_documents(self, api_client, dataroom, document, user, organization):
        doc_active = document
        doc_trashed = Document.objects.create(name="Trashed Doc", organization=organization, created_by=user, deleted_at=timezone.now())
        ddoc_active = DataroomDocument.objects.create(dataroom=dataroom, document=doc_active, name=doc_active.name)
        ddoc_trashed = DataroomDocument.objects.create(dataroom=dataroom, document=doc_trashed, name=doc_trashed.name)

        # 1. Check GET /api/v1/datarooms/{id}/ does not return trashed document in items
        detail_url = f'/api/v1/datarooms/{dataroom.id}/'
        detail_res = api_client.get(detail_url)
        assert detail_res.status_code == status.HTTP_200_OK
        returned_item_ids = [item['id'] for item in detail_res.data['items']]
        assert str(ddoc_active.id) in returned_item_ids
        assert str(ddoc_trashed.id) not in returned_item_ids

        # 2. Check reorder-items succeeds when passing only active items returned from detail
        reorder_url = f'/api/v1/datarooms/{dataroom.id}/reorder-items/'
        reorder_res = api_client.post(reorder_url, {
            "ordered_items": [
                {"type": "document", "id": str(ddoc_active.id)},
            ],
        }, format="json")
        assert reorder_res.status_code == status.HTTP_200_OK

    def test_reorder_items_other_user_dataroom_returns_404(self, api_client, user2, organization, document):
        other_room = Dataroom.objects.create(name="Other", organization=organization, created_by=user2)
        ddoc = DataroomDocument.objects.create(dataroom=other_room, document=document, name=document.name)

        url = f'/api/v1/datarooms/{other_room.id}/reorder-items/'
        response = api_client.post(url, {
            "ordered_items": [
                {"type": "document", "id": str(ddoc.id)},
            ],
        }, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_reorder_items_works_when_file_index_disabled(self, api_client, dataroom, document):
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        assert dataroom.show_file_index is True
        dataroom.show_file_index = False
        dataroom.save(update_fields=["show_file_index"])

        url = f'/api/v1/datarooms/{dataroom.id}/reorder-items/'
        response = api_client.post(url, {
            "ordered_items": [
                {"type": "document", "id": str(ddoc.id)},
            ],
        }, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert DataroomItemOrder.objects.filter(
            dataroom=dataroom,
            parent_folder__isnull=True,
            dataroom_document=ddoc,
            position=0,
        ).exists()

        # Check that GET detail endpoint returns items with position and respects custom order
        detail_res = api_client.get(f'/api/v1/datarooms/{dataroom.id}/')
        assert detail_res.status_code == status.HTTP_200_OK
        assert detail_res.data["items"][0]["id"] == str(ddoc.id)
        assert detail_res.data["items"][0]["position"] == 0

    def test_dataroom_folder_retrieve_preserves_item_order_when_file_index_disabled(self, api_client, dataroom, document, user, organization):
        parent_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Parent", parent=None)
        sub_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Sub", parent=parent_folder)
        doc2 = Document.objects.create(name="Doc In Folder", organization=organization, created_by=user)
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=doc2, name=doc2.name, folder=parent_folder)
        dataroom.show_file_index = False
        dataroom.save(update_fields=["show_file_index"])

        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=parent_folder,
            item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
            dataroom_document=ddoc,
            position=0,
        )
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=parent_folder,
            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
            folder=sub_folder,
            position=1,
        )

        folder_url = f'/api/v1/dataroom-folders/{parent_folder.id}/'
        response = api_client.get(folder_url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["items"][0]["type"] == "document"
        assert response.data["items"][0]["id"] == str(ddoc.id)
        assert response.data["items"][0]["position"] == 0
        assert response.data["items"][1]["type"] == "folder"
        assert response.data["items"][1]["id"] == str(sub_folder.id)
        assert response.data["items"][1]["position"] == 1

    def test_dataroom_folder_retrieve_excludes_soft_deleted_documents(self, api_client, dataroom, document, user, organization):
        parent_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Parent Folder", parent=None)
        doc_active = document
        doc_trashed = Document.objects.create(name="Trashed Doc in Folder", organization=organization, created_by=user, deleted_at=timezone.now())
        ddoc_active = DataroomDocument.objects.create(dataroom=dataroom, document=doc_active, name=doc_active.name, folder=parent_folder)
        ddoc_trashed = DataroomDocument.objects.create(dataroom=dataroom, document=doc_trashed, name=doc_trashed.name, folder=parent_folder)

        folder_url = f'/api/v1/dataroom-folders/{parent_folder.id}/'
        response = api_client.get(folder_url)
        assert response.status_code == status.HTTP_200_OK
        returned_item_ids = [item['id'] for item in response.data['items']]
        assert str(ddoc_active.id) in returned_item_ids
        assert str(ddoc_trashed.id) not in returned_item_ids

    def test_reorder_items_after_moving_content_should_succeed(self, api_client, dataroom, document, user, organization):
        # 1. Setup a destination folder and a document inside it.
        folder_dest = DataroomFolder.objects.create(dataroom=dataroom, name="Destination")
        ddoc1 = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name, folder=folder_dest)
        
        # 2. Call reorder endpoint once to initialize order rows for folder_dest.
        url_reorder = f'/api/v1/datarooms/{dataroom.id}/reorder-items/'
        response_reorder_init = api_client.post(url_reorder, {
            "parent_id": str(folder_dest.id),
            "ordered_items": [
                {"type": "document", "id": str(ddoc1.id)},
            ],
        }, format="json")
        assert response_reorder_init.status_code == status.HTTP_200_OK
        
        # Verify that DataroomItemOrder row exists for folder_dest and ddoc1.
        assert DataroomItemOrder.objects.filter(
            dataroom=dataroom,
            parent_folder=folder_dest,
            dataroom_document=ddoc1
        ).exists()

        # 3. Create another document in the root.
        doc2 = Document.objects.create(name="Doc 2", organization=organization, created_by=user)
        ddoc2 = DataroomDocument.objects.create(dataroom=dataroom, document=doc2, name=doc2.name)

        # 4. Move ddoc2 into folder_dest.
        url_move = f'/api/v1/datarooms/{dataroom.id}/move-content/'
        response_move = api_client.post(url_move, {
            "dataroom_document_ids": [str(ddoc2.id)],
            "destination_folder_id": str(folder_dest.id)
        }, format="json")
        assert response_move.status_code == status.HTTP_200_OK

        # 5. Call reorder endpoint with all items in the target scope.
        # This should succeed, but currently fails with 409 because ddoc2 has no order row.
        response_reorder = api_client.post(url_reorder, {
            "parent_id": str(folder_dest.id),
            "ordered_items": [
                {"type": "document", "id": str(ddoc1.id)},
                {"type": "document", "id": str(ddoc2.id)},
            ],
        }, format="json")
        assert response_reorder.status_code == status.HTTP_200_OK

    def test_reorder_items_after_adding_content_should_succeed(self, api_client, dataroom, document, user, organization):
        # 1. Setup a folder and a document inside it.
        folder_dest = DataroomFolder.objects.create(dataroom=dataroom, name="Destination")
        ddoc1 = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name, folder=folder_dest)
        
        # 2. Call reorder endpoint once to initialize order rows for folder_dest.
        url_reorder = f'/api/v1/datarooms/{dataroom.id}/reorder-items/'
        response_reorder_init = api_client.post(url_reorder, {
            "parent_id": str(folder_dest.id),
            "ordered_items": [
                {"type": "document", "id": str(ddoc1.id)},
            ],
        }, format="json")
        assert response_reorder_init.status_code == status.HTTP_200_OK

        # 3. Create a library document, and add it to folder_dest using the add_content endpoint.
        # The add_content endpoint will not create an order row if show_file_index is False.
        dataroom.show_file_index = False
        dataroom.save(update_fields=["show_file_index"])

        doc2 = Document.objects.create(name="Doc 2", organization=organization, created_by=user)
        url_add = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        response_add = api_client.post(url_add, {
            "document_ids": [str(doc2.id)],
            "destination_folder_id": str(folder_dest.id)
        }, format="json")
        assert response_add.status_code == status.HTTP_200_OK

        # Find the created DataroomDocument.
        ddoc2 = DataroomDocument.objects.get(dataroom=dataroom, document=doc2, folder=folder_dest)

        # Confirm there's no DataroomItemOrder record for ddoc2.
        assert not DataroomItemOrder.objects.filter(
            dataroom=dataroom,
            parent_folder=folder_dest,
            dataroom_document=ddoc2
        ).exists()

        # Turn show_file_index back to True.
        dataroom.show_file_index = True
        dataroom.save(update_fields=["show_file_index"])

        # 4. Attempt to reorder items inside folder_dest.
        # This should succeed, but currently fails with 409.
        response_reorder = api_client.post(url_reorder, {
            "parent_id": str(folder_dest.id),
            "ordered_items": [
                {"type": "document", "id": str(ddoc1.id)},
                {"type": "document", "id": str(ddoc2.id)},
            ],
        }, format="json")
        assert response_reorder.status_code == status.HTTP_200_OK

    def test_list_view_sessions_for_dataroom(self, api_client, user, dataroom, organization):
        """
        Test that the view-sessions endpoint returns paginated view sessions
        scoped to the correct dataroom.
        """
        # Dataroom and link we are testing
        link1 = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        ViewSession.objects.create(share_link=link1, viewer_email="viewer1@test.com")

        # Other dataroom and link to ensure isolation
        other_dataroom = Dataroom.objects.create(name="Other Dataroom", organization=organization, created_by=user)
        other_link = ShareLink.objects.create(dataroom=other_dataroom, created_by=user)
        ViewSession.objects.create(share_link=other_link, viewer_email="other_viewer@test.com")

        url = f'/api/v1/datarooms/{dataroom.id}/view-sessions/'
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['count'] == 1
        assert len(data['results']) == 1
        assert data['results'][0]['viewer_email'] == 'viewer1@test.com'

    def test_updating_link_to_disallow_downloads_does_not_cascade(self, dataroom, document, user):
        """
        Test that updating a parent share link's `allow_download` setting
        does not cascade to existing item settings.
        """
        # 1. Create a dataroom document and a share link.
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user, allow_download=True)

        # 2. Verify the initial setting is correct.
        setting = link.dataroom_settings.get(dataroom_document=ddoc)
        assert setting.allow_download is True

        # 3. Update the parent link.
        link.allow_download = False
        link.save()

        # 4. Verify the item setting has not changed.
        setting.refresh_from_db()
        assert setting.allow_download is True

    def test_updating_link_to_disable_watermarking_does_not_cascade(self, dataroom, document, user):
        """
        Test that updating a parent share link's `enable_watermark` setting
        does not cascade to existing item settings.
        """
        # 1. Create a dataroom document and a share link with watermarking enabled.
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user, enable_watermark=True)

        # 2. Verify the initial setting is correct.
        setting = link.dataroom_settings.get(dataroom_document=ddoc)
        assert setting.enable_watermark is True

        # 3. Update the parent link.
        link.enable_watermark = False
        link.save()

        # 4. Verify the item setting has not changed.
        setting.refresh_from_db()
        assert setting.enable_watermark is True

    def test_ensure_paths_in_dataroom(self, api_client, dataroom):
        """
        Test ensuring folder structures in a dataroom.
        """
        url = f'/api/v1/datarooms/{dataroom.id}/ensure-paths/'
        
        # 1. Post valid paths to ensure
        data = {
            'paths': [
                'Folder A',
                'Folder A/Subfolder B',
                'Folder C'
            ]
        }
        response = api_client.post(url, data, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        
        # Verify response structure
        resp_data = response.json()
        assert resp_data['detail'] == "Folder structure ensured successfully."
        assert 'Folder A' in resp_data['path_mappings']
        assert 'Folder C' in resp_data['path_mappings']
        
        # Verify folders exist in database
        folder_a_name = resp_data['path_mappings']['Folder A']
        folder_c_name = resp_data['path_mappings']['Folder C']
        
        folder_a = DataroomFolder.objects.get(dataroom=dataroom, name=folder_a_name, parent=None)
        folder_c = DataroomFolder.objects.get(dataroom=dataroom, name=folder_c_name, parent=None)
        subfolder_b = DataroomFolder.objects.get(dataroom=dataroom, name='Subfolder B', parent=folder_a)

        # 2. Ensure checking parent folder works
        data_nested = {
            'paths': ['Sub-Subfolder D'],
            'parent_folder_id': str(folder_a.id)
        }
        response_nested = api_client.post(url, data_nested, format='json')
        assert response_nested.status_code == status.HTTP_201_CREATED
        nested_name = response_nested.json()['path_mappings']['Sub-Subfolder D']
        assert DataroomFolder.objects.filter(dataroom=dataroom, name=nested_name, parent=folder_a).exists()

        # 3. Test validation error with a folder belonging to another dataroom
        from datarooms.models import Dataroom
        other_dr = Dataroom.objects.create(name="Other DR", organization=dataroom.organization, created_by=dataroom.created_by)
        other_folder = DataroomFolder.objects.create(dataroom=other_dr, name="Other Folder")
        
        data_invalid = {
            'paths': ['Some Folder'],
            'parent_folder_id': str(other_folder.id)
        }
        response_invalid = api_client.post(url, data_invalid, format='json')
        assert response_invalid.status_code == status.HTTP_400_BAD_REQUEST
        assert "Parent folder does not belong to this dataroom." in response_invalid.json()['detail']

    def test_upload_request_in_dataroom(self, api_client, dataroom):
        """
        Test requesting upload URLs in a dataroom.
        """
        from unittest.mock import patch
        with patch('documents.fileserver.fileserver_client.generate_upload_url') as mock_generate_url:
            mock_generate_url.return_value = "https://fileserver.example.com/upload-token"

            # 1. Test request without a specific folder path (root upload)
            url = f'/api/v1/datarooms/{dataroom.id}/uploads/request/'
            data = {
                'file_name': 'test_file.pdf',
                'file_size': 1024,
            }
            response = api_client.post(url, data, format='json')
            assert response.status_code == status.HTTP_200_OK, response.json()
            resp_data = response.json()
            assert resp_data['upload_url'] == "https://fileserver.example.com/upload-token"
            assert 'storage_key' in resp_data
            assert resp_data['unique_name'] == 'test_file.pdf'

            # 2. Test request inside an ensured folder path in the dataroom
            folder = DataroomFolder.objects.create(dataroom=dataroom, name="Uploads")
            data_nested = {
                'file_name': 'nested_file.txt',
                'file_size': 512,
                'path': 'Uploads/nested_file.txt',
            }
            response_nested = api_client.post(url, data_nested, format='json')
            assert response_nested.status_code == status.HTTP_200_OK
            resp_nested = response_nested.json()
            assert resp_nested['unique_name'] == 'nested_file.txt'

            # 3. Test validation error if the path does not exist
            data_non_existent = {
                'file_name': 'nested_file.txt',
                'file_size': 512,
                'path': 'NonExistent/nested_file.txt',
            }
            response_non_existent = api_client.post(url, data_non_existent, format='json')
            assert response_non_existent.status_code == status.HTTP_400_BAD_REQUEST
            assert "Folder path 'NonExistent' does not exist in this dataroom." in response_non_existent.json()['detail']

            # 4. Test dataroom storage quota exceeded
            dataroom.storage_quota_mb = 1
            dataroom.save()
            data_oversized = {
                'file_name': 'oversized.pdf',
                'file_size': 2 * 1024 * 1024,
            }
            response_quota = api_client.post(url, data_oversized, format='json')
            assert response_quota.status_code == status.HTTP_400_BAD_REQUEST
            assert "exceed the Dataroom storage limit" in response_quota.json()['detail']

    @patch('documents.fileserver.fileserver_client.generate_upload_url')
    def test_upload_request_inside_folder_with_path(self, mock_generate_url, api_client, dataroom):
        """
        Represents the issue where uploading a file inside an existing folder
        with its path set (relative to root) causes a DoesNotExist error.
        """
        mock_generate_url.return_value = "https://fileserver.example.com/upload-token"

        # 1. Create a folder 'png' in the dataroom at root
        folder_png = DataroomFolder.objects.create(dataroom=dataroom, name="png", parent=None)

        # 2. Request upload for a file 'photo.png' inside folder 'png'
        # The frontend sends: destination_folder_id = folder_png.id, path = 'png/photo.png'
        url = f'/api/v1/datarooms/{dataroom.id}/uploads/request/'
        data = {
            'file_name': 'photo.png',
            'file_size': 1024,
            'destination_folder_id': str(folder_png.id),
            'path': 'png/photo.png'
        }
        response = api_client.post(url, data, format='json')
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()['unique_name'] == 'photo.png'

    def test_upload_finalize_in_dataroom(self, api_client, dataroom):
        """
        Test finalizing a direct upload to a dataroom.
        """
        url = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        
        # 1. Finalize root upload (no path, no parent folder)
        data = {
            'storage_key': 'org_1/uploads/test_file.pdf',
            'unique_name': 'test_file.pdf',
            'file_size': 1024,
            'content_type': 'application/pdf',
        }
        
        response = api_client.post(url, data, format='json')
        assert response.status_code == status.HTTP_202_ACCEPTED, response.json()

        # Check standard document was created in '__datarooms__/<dataroom_id>' system vault
        from documents.models import Document, Folder
        doc = Document.objects.get(name='test_file.pdf')
        assert doc.folder.name == str(dataroom.id)
        assert doc.folder.parent.name == "__datarooms__"
        assert doc.folder.parent.parent.name == "__root__"

        # Verify system vault folder is system-owned (created_by=None) while document has creator attribution
        assert doc.folder.created_by is None
        assert doc.created_by == dataroom.created_by

        # Check DataroomDocument reference was created
        assert DataroomDocument.objects.filter(
            dataroom=dataroom,
            document=doc,
            folder=None,
            name='test_file.pdf'
        ).exists()

        # 2. Finalize nested upload with path
        # First ensure the visual folder path exists in Dataroom
        ensure_url = f'/api/v1/datarooms/{dataroom.id}/ensure-paths/'
        ensure_response = api_client.post(ensure_url, {'paths': ['Folder A/Folder B']}, format='json')
        assert ensure_response.status_code == status.HTTP_201_CREATED

        folder_a_name = ensure_response.json()['path_mappings']['Folder A']
        folder_a = DataroomFolder.objects.get(dataroom=dataroom, name=folder_a_name, parent=None)
        folder_b = DataroomFolder.objects.get(dataroom=dataroom, name='Folder B', parent=folder_a)

        data_nested = {
            'storage_key': 'org_1/uploads/test_nested.pdf',
            'unique_name': 'test_nested.pdf',
            'file_size': 2048,
            'content_type': 'application/pdf',
            'path': f'{folder_a_name}/Folder B/test_nested.pdf',
        }
        response_nested = api_client.post(url, data_nested, format='json')
        assert response_nested.status_code == status.HTTP_202_ACCEPTED

        # Check standard document was created in the nested library folder
        doc_nested = Document.objects.get(name='test_nested.pdf')
        assert doc_nested.folder.name == "Folder B"
        assert doc_nested.folder.parent.name == folder_a_name
        assert doc_nested.folder.parent.parent.name == str(dataroom.id)

        # Check DataroomDocument reference was created under visual folder_b
        assert DataroomDocument.objects.filter(
            dataroom=dataroom,
            document=doc_nested,
            folder=folder_b,
            name='test_nested.pdf'
        ).exists()

    def test_dataroom_rename_updates_library_folder(self, api_client, dataroom):
        """
        Test that renaming a legacy (v1) dataroom renames the library folder under Dataroom Uploads,
        while a modern (v2) dataroom keeps the immutable system vault folder intact.
        """
        # Test legacy v1 rename
        dataroom.storage_version = 1
        dataroom.save(update_fields=['storage_version'])

        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/temp.txt',
            'unique_name': 'temp.txt',
            'file_size': 12,
            'content_type': 'text/plain',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        from documents.models import Folder
        org = dataroom.created_by.organization
        root_folder = Folder.objects.get_root_for_org(org)
        dataroom_uploads = Folder.objects.get(organization=org, parent=root_folder, name="Dataroom Uploads")
        assert Folder.objects.filter(organization=org, parent=dataroom_uploads, name=get_dataroom_storage_folder_name(dataroom.name, dataroom)).exists()

        # Update the dataroom name via PATCH
        url_patch = f'/api/v1/datarooms/{dataroom.id}/'
        old_name = dataroom.name
        new_name = "Brand New Dataroom Name"
        res_patch = api_client.patch(url_patch, {'name': new_name}, format='json')
        assert res_patch.status_code == status.HTTP_200_OK

        assert Folder.objects.filter(organization=org, parent=dataroom_uploads, name=get_dataroom_storage_folder_name(new_name, dataroom)).exists()
        assert not Folder.objects.filter(organization=org, parent=dataroom_uploads, name=get_dataroom_storage_folder_name(old_name, dataroom)).exists()

    def test_dataroom_deletion_cleans_uploads(self, api_client, dataroom):
        """
        Test that deleting a dataroom recursively deletes the library folder and its contents.
        """
        from unittest.mock import patch
        with patch('documents.services.fileserver_client.delete_file') as mock_delete_file:
            # 1. Finalize an upload to create the library folder structure and document
            url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
            data_finalize = {
                'storage_key': 'org_1/uploads/temp.txt',
                'unique_name': 'temp.txt',
                'file_size': 12,
                'content_type': 'text/plain',
            }
            res = api_client.post(url_finalize, data_finalize, format='json')
            assert res.status_code == status.HTTP_202_ACCEPTED

            # Verify documents and library folders are in DB
            from documents.models import Document, Folder
            assert Document.objects.filter(name='temp.txt').exists()

            # 2. Delete the dataroom
            url_delete = f'/api/v1/datarooms/{dataroom.id}/'
            response = api_client.delete(url_delete)
            assert response.status_code == status.HTTP_204_NO_CONTENT

            # 3. Assert mock_delete_file was called with the storage key
            mock_delete_file.assert_called_with('org_1/uploads/temp.txt')

            # 4. Verify standard document and library folder are deleted
            assert not Document.objects.filter(name='temp.txt').exists()
            org = dataroom.created_by.organization
            root_folder = Folder.objects.get_root_for_org(org)
            system_vault = Folder.objects.filter(organization=org, parent=root_folder, name="__datarooms__").first()
            if system_vault:
                assert not Folder.objects.filter(organization=org, parent=system_vault, name=str(dataroom.id)).exists()

    @patch('documents.services.fileserver_client.delete_file')
    def test_direct_upload_deletion_removes_library_document(self, mock_delete_file, api_client, dataroom):
        """
        Test that deleting a directly uploaded dataroom document recursively deletes the backing Document
        model and file from storage, allowing it to be uploaded again.
        """
        # 1. Finalize an upload to create the library folder structure and document
        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/test_file.pdf',
            'unique_name': 'test_file.pdf',
            'file_size': 1024,
            'content_type': 'application/pdf',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        # Verify standard document and DataroomDocument are in DB
        from documents.models import Document
        assert Document.objects.filter(name='test_file.pdf').exists()
        dataroom_doc = DataroomDocument.objects.get(name='test_file.pdf', dataroom=dataroom)

        # 2. Remove the document from the dataroom (delete/remove-content)
        url_remove = f'/api/v1/datarooms/{dataroom.id}/remove-content/'
        data_remove = {
            'dataroom_document_ids': [str(dataroom_doc.id)],
            'dataroom_folder_ids': []
        }
        response_remove = api_client.post(url_remove, data_remove, format='json')
        assert response_remove.status_code == status.HTTP_204_NO_CONTENT

        # 3. Assert mock_delete_file was called with the storage key
        mock_delete_file.assert_called_with('org_1/uploads/test_file.pdf')

        # 4. Verify standard document is deleted from library
        assert not Document.objects.filter(name='test_file.pdf').exists()

        # 5. Finalize the same upload again (to prove no UNIQUE constraint failed error occurs)
        res_again = api_client.post(url_finalize, data_finalize, format='json')
        assert res_again.status_code == status.HTTP_202_ACCEPTED
        assert Document.objects.filter(name='test_file.pdf').exists()

    @patch('documents.services.fileserver_client.delete_file', side_effect=APIException("Storage service unavailable"))
    def test_remove_content_resilient_to_storage_delete_failure(self, mock_delete_file, api_client, dataroom):
        """
        Test that removing content from a dataroom succeeds with 204 even if the fileserver
        storage deletion encounters an exception.
        """
        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/resilient_test.pdf',
            'unique_name': 'resilient_test.pdf',
            'file_size': 1024,
            'content_type': 'application/pdf',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        dataroom_doc = DataroomDocument.objects.get(name='resilient_test.pdf', dataroom=dataroom)

        # Remove the document
        url_remove = f'/api/v1/datarooms/{dataroom.id}/remove-content/'
        data_remove = {
            'dataroom_document_ids': [str(dataroom_doc.id)],
            'dataroom_folder_ids': []
        }
        response_remove = api_client.post(url_remove, data_remove, format='json')
        # Must return 204 without raising 500
        assert response_remove.status_code == status.HTTP_204_NO_CONTENT
        assert not DataroomDocument.objects.filter(id=dataroom_doc.id).exists()

    @patch('documents.services.fileserver_client.delete_file')
    def test_direct_upload_deletion_with_multiple_dataroom_uploads_folders(self, mock_delete_file, api_client, dataroom, user2):
        """
        Test that direct upload deletion does not crash when multiple 'Dataroom Uploads' folders
        exist (created by different users in the same organization).
        """
        # Ensure user2 is in the same organization as dataroom creator
        org = dataroom.created_by.organization
        user2.organization = org
        user2.save()

        # 1. Create two 'Dataroom Uploads' folders (one for each user)
        root_folder = Folder.objects.get_root_for_org(org)
        Folder.objects.create(
            organization=org,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=dataroom.created_by
        )
        Folder.objects.create(
            organization=org,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=user2
        )

        # Verify we now have 2 'Dataroom Uploads' folders in this org under root
        assert Folder.objects.filter(organization=org, parent=root_folder, name="Dataroom Uploads").count() == 2

        # 2. Finalize an upload for the dataroom (creates the first 'Dataroom Uploads' folder for dataroom.created_by)
        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/test_file_multiple.pdf',
            'unique_name': 'test_file_multiple.pdf',
            'file_size': 1024,
            'content_type': 'application/pdf',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        dataroom_doc = DataroomDocument.objects.get(name='test_file_multiple.pdf', dataroom=dataroom)

        # 3. Remove the document from the dataroom (triggers pre_delete signal)
        url_remove = f'/api/v1/datarooms/{dataroom.id}/remove-content/'
        data_remove = {
            'dataroom_document_ids': [str(dataroom_doc.id)],
            'dataroom_folder_ids': []
        }
        response_remove = api_client.post(url_remove, data_remove, format='json')

        # This should succeed without raising MultipleObjectsReturned exception!
        assert response_remove.status_code == status.HTTP_204_NO_CONTENT
        assert not Document.objects.filter(name='test_file_multiple.pdf').exists()



class TestDataroomFolderViewSet:
    def test_create_dataroom_folder(self, api_client, dataroom):
        """Test creating a folder inside a dataroom."""
        url = '/api/v1/dataroom-folders/'
        data = {'name': 'New Dataroom Folder', 'dataroom': str(dataroom.id)}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomFolder.objects.filter(dataroom=dataroom, name='New Dataroom Folder').exists()

    def test_create_folder_with_show_file_index_and_existing_orders(self, api_client, dataroom):
        """
        Test creating a folder in a dataroom that has show_file_index=True and existing order rows.
        Guards against FieldError: Cannot resolve keyword 'order' in DataroomFolderViewSet._append_item_order.
        """
        dataroom.show_file_index = True
        dataroom.save(update_fields=['show_file_index'])

        existing_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Existing Folder")
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=None,
            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
            folder=existing_folder,
            position=0
        )

        url = '/api/v1/dataroom-folders/'
        data = {'name': 'New Subfolder', 'dataroom': str(dataroom.id)}
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomItemOrder.objects.filter(dataroom=dataroom, position=1).exists()

    def test_list_dataroom_folders_scoped_to_dataroom(self, api_client, dataroom, user2, organization):
        """Test listing folders is correctly filtered by dataroom ID."""
        DataroomFolder.objects.create(name="Folder 1", dataroom=dataroom)

        other_dataroom = Dataroom.objects.create(name="Other DR", organization=organization, created_by=user2)
        DataroomFolder.objects.create(name="Other Folder", dataroom=other_dataroom)

        url = f'/api/v1/dataroom-folders/?dataroom_id={dataroom.id}'
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == "Folder 1"

    def test_create_dataroom_folder_permission_denied(self, api_client, user2, organization):
        """A user cannot create a folder in a dataroom from another organization."""
        other_org = organization.__class__.objects.create(name="Other Org")
        other_dataroom = Dataroom.objects.create(name="Other DR", organization=other_org, created_by=user2)

        url = '/api/v1/dataroom-folders/'
        data = {'name': 'My Folder in their DR', 'dataroom': str(other_dataroom.id)}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_retrieve_folder_contents(self, api_client, dataroom, document):
        """Test retrieving a folder's contents, including subfolders and documents."""
        parent_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Parent")
        DataroomFolder.objects.create(dataroom=dataroom, name="Sub", parent=parent_folder)
        dataroom_document = DataroomDocument.objects.create(dataroom=dataroom, document=document, folder=parent_folder, name=document.name)
        direct_link = ShareLink.objects.create(document=document, created_by=dataroom.created_by)
        ViewSession.objects.create(share_link=direct_link)
        dataroom_link = ShareLink.objects.create(dataroom=dataroom, created_by=dataroom.created_by)
        dataroom_session = ViewSession.objects.create(share_link=dataroom_link)
        DataroomVisit.objects.create(view_session=dataroom_session, dataroom_document=dataroom_document)

        url = f'/api/v1/dataroom-folders/{parent_folder.id}/'
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['name'] == "Parent"
        assert len(data['sub_folders']) == 1
        assert data['sub_folders'][0]['name'] == "Sub"
        assert len(data['documents']) == 1
        assert data['documents'][0]['name'] == document.name
        assert data['documents'][0]['dataroom_view_count'] == 1
        assert len(data['items']) == 2
        assert data['items'][0]['type'] == 'folder'
        assert data['items'][1]['type'] == 'document'
        assert data['items'][1]['dataroom_view_count'] == 1

    def test_rename_folder_success(self, api_client, dataroom):
        """Test renaming a dataroom folder successfully."""
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="Original Name")
        url = f'/api/v1/dataroom-folders/{folder.id}/'
        data = {'name': 'New Name'}
        response = api_client.patch(url, data)
        assert response.status_code == status.HTTP_200_OK
        folder.refresh_from_db()
        assert folder.name == 'New Name'

    def test_rename_folder_with_conflict_fails(self, api_client, dataroom):
        """Test renaming a folder to a name that already exists in the same location fails."""
        DataroomFolder.objects.create(dataroom=dataroom, name="Existing Name")
        folder_to_rename = DataroomFolder.objects.create(dataroom=dataroom, name="Original Name")

        url = f'/api/v1/dataroom-folders/{folder_to_rename.id}/'
        data = {'name': 'Existing Name'}
        response = api_client.patch(url, data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'already exists' in str(response.json())

    def test_toggle_folder_star_success(self, api_client, dataroom):
        """Test toggling a dataroom folder's starred status."""
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="Folder", is_starred=False)
        url = f'/api/v1/dataroom-folders/{folder.id}/'

        response = api_client.patch(url, {'is_starred': True})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()['is_starred'] is True

        folder.refresh_from_db()
        assert folder.is_starred is True

    def test_rename_direct_uploaded_folder_propagates(self, api_client, dataroom):
        """Test that renaming a direct uploaded dataroom folder renames its backing library folder."""
        # 1. Finalize an upload to create visual folder and backing library folder path
        ensure_url = f'/api/v1/datarooms/{dataroom.id}/ensure-paths/'
        res_ensure = api_client.post(ensure_url, {'paths': ['subfolder']}, format='json')
        assert res_ensure.status_code == status.HTTP_201_CREATED

        # Finalize a file inside subfolder to materialize the backing library folder
        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/subfile.txt',
            'unique_name': 'subfile.txt',
            'file_size': 12,
            'content_type': 'text/plain',
            'path': 'subfolder/subfile.txt',
        }
        res_finalize = api_client.post(url_finalize, data_finalize, format='json')
        assert res_finalize.status_code == status.HTTP_202_ACCEPTED

        # Retrieve the created visual folder and verify backing standard folder exists
        dfolder = DataroomFolder.objects.get(dataroom=dataroom, name='subfolder')
        org = dataroom.created_by.organization
        root_folder = Folder.objects.get_root_for_org(org)
        system_vault = Folder.objects.get(organization=org, parent=root_folder, name="__datarooms__")
        backing_dataroom_root = Folder.objects.get(organization=org, parent=system_vault, name=str(dataroom.id))
        backing_folder = Folder.objects.get(organization=org, parent=backing_dataroom_root, name='subfolder')

        # 2. Rename DataroomFolder via PATCH
        url_patch = f'/api/v1/dataroom-folders/{dfolder.id}/'
        res_patch = api_client.patch(url_patch, {'name': 'renamed_subfolder'}, format='json')
        assert res_patch.status_code == status.HTTP_200_OK

        # 3. Verify renaming propagated to backing Folder
        dfolder.refresh_from_db()
        assert dfolder.name == 'renamed_subfolder'
        backing_folder.refresh_from_db()
        assert backing_folder.name == 'renamed_subfolder'



class TestDataroomDocumentViewSet:
    def test_rename_document_success(self, api_client, dataroom, document):
        """Test successfully renaming a dataroom document."""
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        url = f'/api/v1/dataroom-documents/{ddoc.id}/'
        data = {'name': 'New Document Name.pdf'}

        response = api_client.patch(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()['name'] == 'New Document Name.pdf'

        ddoc.refresh_from_db()
        assert ddoc.name == 'New Document Name.pdf'

    def test_rename_document_duplicate_name_in_same_folder_fails(self, api_client, dataroom, document):
        """Test renaming a document to a name that already exists in the same folder returns 400."""
        doc2 = Document.objects.create(name='Doc B.pdf', organization=dataroom.organization, created_by=dataroom.created_by)
        ddoc1 = DataroomDocument.objects.create(dataroom=dataroom, document=document, name='Doc A.pdf')
        ddoc2 = DataroomDocument.objects.create(dataroom=dataroom, document=doc2, name='Doc B.pdf')

        url = f'/api/v1/dataroom-documents/{ddoc2.id}/'
        data = {'name': 'Doc A.pdf'}

        response = api_client.patch(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'name' in response.json()

    def test_rename_direct_upload_document_physical_name_collision_handled_gracefully(self, api_client, dataroom, user, organization):
        """
        Test that renaming a direct upload document in visual folder 2 to the same name
        as a direct upload in visual folder 1 (both sharing the physical system vault folder)
        does not crash with IntegrityError (500) and updates the visual name smoothly.
        """
        from datarooms.services import get_or_create_dataroom_storage_folder
        storage_folder = get_or_create_dataroom_storage_folder(dataroom, requesting_user=user)

        # 2 direct upload documents in the same physical vault folder by the same user
        doc1 = Document.objects.create(name='contract.pdf', organization=organization, created_by=user, folder=storage_folder)
        doc2 = Document.objects.create(name='other.pdf', organization=organization, created_by=user, folder=storage_folder)

        # 2 different visual folders in the dataroom
        vfolder1 = DataroomFolder.objects.create(dataroom=dataroom, name="Folder 1")
        vfolder2 = DataroomFolder.objects.create(dataroom=dataroom, name="Folder 2")

        ddoc1 = DataroomDocument.objects.create(dataroom=dataroom, folder=vfolder1, document=doc1, name='contract.pdf', is_direct_upload=True)
        ddoc2 = DataroomDocument.objects.create(dataroom=dataroom, folder=vfolder2, document=doc2, name='other.pdf', is_direct_upload=True)

        url = f'/api/v1/dataroom-documents/{ddoc2.id}/'
        data = {'name': 'contract.pdf'}

        response = api_client.patch(url, data)
        assert response.status_code == status.HTTP_200_OK
        ddoc2.refresh_from_db()
        assert ddoc2.name == 'contract.pdf'

    def test_rename_document_other_user_dataroom_returns_404(self, api_client, user2, organization, document):
        """Test user cannot rename document in another user's dataroom."""
        other_room = Dataroom.objects.create(name="Other Room", organization=organization, created_by=user2)
        ddoc = DataroomDocument.objects.create(dataroom=other_room, document=document, name='Doc.pdf')

        url = f'/api/v1/dataroom-documents/{ddoc.id}/'
        data = {'name': 'New Name'}
        response = api_client.patch(url, data)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_toggle_document_star_success(self, api_client, dataroom, document):
        """Test toggling a dataroom document's starred status."""
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name, is_starred=False)
        url = f'/api/v1/dataroom-documents/{ddoc.id}/'

        response = api_client.patch(url, {'is_starred': True})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()['is_starred'] is True

        ddoc.refresh_from_db()
        assert ddoc.is_starred is True

    def test_rename_direct_uploaded_document_propagates(self, api_client, dataroom):
        """Test that renaming a direct uploaded dataroom document renames its backing library document."""
        # 1. Finalize an upload to create backing Document
        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        data_finalize = {
            'storage_key': 'org_1/uploads/temp.txt',
            'unique_name': 'temp.txt',
            'file_size': 12,
            'content_type': 'text/plain',
        }
        res = api_client.post(url_finalize, data_finalize, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        # Find the DataroomDocument and its backing Document
        ddoc = DataroomDocument.objects.get(dataroom=dataroom, name='temp.txt')
        backing_doc = ddoc.document
        assert backing_doc.name == 'temp.txt'

        # 2. Rename DataroomDocument via PATCH
        url_patch = f'/api/v1/dataroom-documents/{ddoc.id}/'
        res_patch = api_client.patch(url_patch, {'name': 'renamed_temp.txt'}, format='json')
        assert res_patch.status_code == status.HTTP_200_OK

        # 3. Verify renaming propagated
        ddoc.refresh_from_db()
        assert ddoc.name == 'renamed_temp.txt'
        backing_doc.refresh_from_db()
        assert backing_doc.name == 'renamed_temp.txt'

    def test_dataroom_name_collision_isolates_library_folders(self, api_client, dataroom):
        """
        Test that multiple datarooms with the same name do not share library folders,
        and deleting one does not delete the other's backing library folder.
        """
        from documents.models import Folder
        from unittest.mock import patch

        org = dataroom.created_by.organization
        root_folder = Folder.objects.get_root_for_org(org)

        # 1. Create a second dataroom with the exact same name
        from datarooms.models import Dataroom
        second_dataroom = Dataroom.objects.create(
            organization=org,
            name=dataroom.name,
            created_by=dataroom.created_by
        )

        # 2. Finalize upload for first dataroom
        url_finalize_1 = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        res_1 = api_client.post(url_finalize_1, {
            'storage_key': 'org_1/uploads/temp1.txt',
            'unique_name': 'temp1.txt',
            'file_size': 12,
            'content_type': 'text/plain',
        }, format='json')
        assert res_1.status_code == status.HTTP_202_ACCEPTED

        # 3. Finalize upload for second dataroom
        url_finalize_2 = f'/api/v1/datarooms/{second_dataroom.id}/uploads/finalize/'
        res_2 = api_client.post(url_finalize_2, {
            'storage_key': 'org_1/uploads/temp2.txt',
            'unique_name': 'temp2.txt',
            'file_size': 15,
            'content_type': 'text/plain',
        }, format='json')
        assert res_2.status_code == status.HTTP_202_ACCEPTED

        # 4. Verify two distinct library folders exist under system vault __datarooms__
        system_vault = Folder.objects.get(organization=org, parent=root_folder, name="__datarooms__")
        assert Folder.objects.filter(
            organization=org, parent=system_vault, name=str(dataroom.id)
        ).exists()
        assert Folder.objects.filter(
            organization=org, parent=system_vault, name=str(second_dataroom.id)
        ).exists()

        # 5. Delete the first dataroom
        with patch('documents.services.fileserver_client.delete_file') as mock_delete:
            url_delete = f'/api/v1/datarooms/{dataroom.id}/'
            response = api_client.delete(url_delete)
            assert response.status_code == status.HTTP_204_NO_CONTENT

        # 6. Verify first library folder is deleted but the second library folder still exists!
        assert not Folder.objects.filter(
            organization=org, parent=system_vault, name=str(dataroom.id)
        ).exists()
        assert Folder.objects.filter(
            organization=org, parent=system_vault, name=str(second_dataroom.id)
        ).exists()

    def test_delete_dataroom_without_created_by_cleans_up_backing_folder(self, api_client, organization, user):
        """
        Test that delete_dataroom cleans up the backing folder even if dataroom.created_by is None.
        """
        from documents.models import Folder
        from datarooms.models import Dataroom
        from datarooms.services import delete_dataroom
        from datarooms.utils import get_dataroom_storage_folder_name

        root_folder = Folder.objects.get_root_for_org(organization)
        user_uploads = Folder.objects.create(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=user,
        )

        dr = Dataroom.objects.create(
            organization=organization,
            name="No Creator Dataroom",
            created_by=None,
        )

        storage_folder_name = get_dataroom_storage_folder_name(dr.name, dr)
        dr_folder = Folder.objects.create(
            organization=organization,
            parent=user_uploads,
            name=storage_folder_name,
            created_by=user,
        )

        assert Folder.objects.filter(id=dr_folder.id).exists()

        delete_dataroom(dr)

        assert not Dataroom.objects.filter(id=dr.id).exists()
        assert not Folder.objects.filter(id=dr_folder.id).exists()


class TestDataroomFolderMtimeUpdates:
    def test_touch_dataroom_folder_ancestors_updates_tree(self, dataroom):
        """Test that touch_dataroom_folder_ancestors updates the timestamp of dataroom folder and ancestors."""
        past_time = timezone.now() - timedelta(days=2)
        root_folder = DataroomFolder.objects.create(name="DR Root", dataroom=dataroom)
        sub1 = DataroomFolder.objects.create(name="DR Sub1", parent=root_folder, dataroom=dataroom)
        sub2 = DataroomFolder.objects.create(name="DR Sub2", parent=sub1, dataroom=dataroom)

        DataroomFolder.objects.filter(id__in=[root_folder.id, sub1.id, sub2.id]).update(updated_at=past_time)
        root_folder.refresh_from_db()
        sub1.refresh_from_db()
        sub2.refresh_from_db()
        assert root_folder.updated_at == past_time
        assert sub1.updated_at == past_time
        assert sub2.updated_at == past_time

        touch_dataroom_folder_ancestors(sub2)

        root_folder.refresh_from_db()
        sub1.refresh_from_db()
        sub2.refresh_from_db()
        assert root_folder.updated_at > past_time
        assert sub1.updated_at > past_time
        assert sub2.updated_at > past_time

    def test_create_dataroom_folder_touches_parent(self, api_client, dataroom):
        """Test creating a subfolder in dataroom touches its parent DataroomFolder."""
        api_client.force_authenticate(user=dataroom.created_by)
        parent_folder = DataroomFolder.objects.create(name="Parent", dataroom=dataroom)
        past_time = timezone.now() - timedelta(days=2)
        DataroomFolder.objects.filter(id=parent_folder.id).update(updated_at=past_time)
        parent_folder.refresh_from_db()
        assert parent_folder.updated_at == past_time

        res = api_client.post('/api/v1/dataroom-folders/', {
            'name': 'New Child Folder',
            'parent': parent_folder.id,
            'dataroom': dataroom.id
        }, format='json')
        assert res.status_code == status.HTTP_201_CREATED

        parent_folder.refresh_from_db()
        assert parent_folder.updated_at > past_time

    def test_move_dataroom_items_touches_source_and_dest_folders(self, api_client, dataroom, document):
        """Test moving dataroom items touches both source and destination DataroomFolders."""
        api_client.force_authenticate(user=dataroom.created_by)
        source_folder = DataroomFolder.objects.create(name="Source DR", dataroom=dataroom)
        dest_folder = DataroomFolder.objects.create(name="Dest DR", dataroom=dataroom)
        ddoc = DataroomDocument.objects.create(name="file.pdf", dataroom=dataroom, folder=source_folder, document=document)

        past_time = timezone.now() - timedelta(days=2)
        DataroomFolder.objects.filter(id__in=[source_folder.id, dest_folder.id]).update(updated_at=past_time)
        source_folder.refresh_from_db()
        dest_folder.refresh_from_db()
        assert source_folder.updated_at == past_time
        assert dest_folder.updated_at == past_time

        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/move-content/', {
            'dataroom_document_ids': [ddoc.id],
            'dataroom_folder_ids': [],
            'destination_folder_id': dest_folder.id
        }, format='json')
        assert res.status_code == status.HTTP_200_OK

        source_folder.refresh_from_db()
        dest_folder.refresh_from_db()
        assert source_folder.updated_at > past_time
        assert dest_folder.updated_at > past_time

    def test_remove_nested_folder_with_documents_succeeds(self, api_client, dataroom, document):
        """
        Regression test: Deleting a parent folder that contains subfolders with documents
        must not crash with DataroomFolder.DoesNotExist when attempting to touch deleted subfolder parents.
        """
        api_client.force_authenticate(user=dataroom.created_by)
        parent_folder = DataroomFolder.objects.create(name="Parent Folder", dataroom=dataroom)
        child_folder = DataroomFolder.objects.create(name="Child Folder", parent=parent_folder, dataroom=dataroom)
        DataroomDocument.objects.create(name="child_doc.pdf", dataroom=dataroom, folder=child_folder, document=document)

        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/remove-content/', {
            'dataroom_document_ids': [],
            'dataroom_folder_ids': [parent_folder.id]
        }, format='json')
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not DataroomFolder.objects.filter(id__in=[parent_folder.id, child_folder.id]).exists()

    def test_touch_dataroom_folder_ancestors_with_cycle_safely_terminates(self, dataroom):
        """Test that touch_dataroom_folder_ancestors does not infinite-loop if there is a cycle."""
        f1 = DataroomFolder.objects.create(name="F1", dataroom=dataroom)
        f2 = DataroomFolder.objects.create(name="F2", parent=f1, dataroom=dataroom)
        # Mock a cycle in memory
        f1.parent = f2
        touch_dataroom_folder_ancestors(f2)  # Should terminate cleanly without hanging

    def test_upload_finalize_touches_destination_folder_mtime(self, api_client, dataroom):
        """Test that finalizing direct dataroom upload touches destination DataroomFolder updated_at."""
        api_client.force_authenticate(user=dataroom.created_by)
        dest_folder = DataroomFolder.objects.create(name="Upload Target", dataroom=dataroom)
        past_time = timezone.now() - timedelta(days=2)
        DataroomFolder.objects.filter(id=dest_folder.id).update(updated_at=past_time)
        dest_folder.refresh_from_db()
        assert dest_folder.updated_at == past_time

        url_finalize = f'/api/v1/datarooms/{dataroom.id}/uploads/finalize/'
        res = api_client.post(url_finalize, {
            'storage_key': 'org_1/uploads/test_file.pdf',
            'unique_name': 'test_file.pdf',
            'file_size': 100,
            'content_type': 'application/pdf',
            'destination_folder_id': dest_folder.id,
        }, format='json')
        assert res.status_code == status.HTTP_202_ACCEPTED

        dest_folder.refresh_from_db()
        assert dest_folder.updated_at > past_time

    def test_ensure_paths_touches_parent_folder_mtime(self, api_client, dataroom):
        """Test that ensure_paths creates child folders and touches parent_folder updated_at."""
        api_client.force_authenticate(user=dataroom.created_by)
        parent_folder = DataroomFolder.objects.create(name="Base Folder", dataroom=dataroom)
        past_time = timezone.now() - timedelta(days=2)
        DataroomFolder.objects.filter(id=parent_folder.id).update(updated_at=past_time)
        parent_folder.refresh_from_db()
        assert parent_folder.updated_at == past_time

        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/ensure-paths/', {
            'paths': ['SubDir/NestedDir'],
            'parent_folder_id': parent_folder.id,
        }, format='json')
        assert res.status_code == status.HTTP_201_CREATED

        parent_folder.refresh_from_db()
        assert parent_folder.updated_at > past_time

    def test_add_content_touches_destination_folder_mtime(self, api_client, dataroom, document):
        """Test that adding library content to a dataroom folder touches destination DataroomFolder updated_at."""
        api_client.force_authenticate(user=dataroom.created_by)
        dest_folder = DataroomFolder.objects.create(name="Add Content Target", dataroom=dataroom)
        past_time = timezone.now() - timedelta(days=2)
        DataroomFolder.objects.filter(id=dest_folder.id).update(updated_at=past_time)
        dest_folder.refresh_from_db()
        assert dest_folder.updated_at == past_time

        add_to_folder_url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        res = api_client.post(add_to_folder_url, {
            'document_ids': [str(document.id)],
            'destination_folder_id': str(dest_folder.id)
        }, format='json')
        assert res.status_code == status.HTTP_200_OK

        dest_folder.refresh_from_db()
        assert dest_folder.updated_at > past_time

    def test_dataroom_storage_quota_settings_and_enforcement(self, api_client, dataroom, user, user2):
        """Test setting storage quota and enforcing it on uploads."""
        api_client.force_authenticate(user=user)

        # 1. Update storage quota as owner
        res = api_client.patch(f'/api/v1/datarooms/{dataroom.id}/', {'storage_quota_mb': 100})
        assert res.status_code == status.HTTP_200_OK
        assert res.data['storage_quota_mb'] == 100

        # 2. Update storage quota as collaborator is rejected (403 Forbidden)
        from datarooms.models import DataroomCollaborator
        DataroomCollaborator.objects.create(dataroom=dataroom, user=user2)
        api_client.force_authenticate(user=user2)
        res = api_client.patch(f'/api/v1/datarooms/{dataroom.id}/', {'storage_quota_mb': 200})
        assert res.status_code == status.HTTP_403_FORBIDDEN

        # 3. Negative quota rejected
        api_client.force_authenticate(user=user)
        res = api_client.patch(f'/api/v1/datarooms/{dataroom.id}/', {'storage_quota_mb': -5})
        assert res.status_code == status.HTTP_400_BAD_REQUEST

        # 4. Upload exceeding dataroom quota is rejected
        dataroom.storage_quota_mb = 10  # 10 MB limit
        dataroom.save()

        with patch('datarooms.views.fileserver_client.generate_upload_url', return_value='http://mocked/upload'):
            # 12 MB upload exceeds 10 MB limit
            res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/uploads/request/', {
                'file_name': 'large_video.mp4',
                'file_size': 12 * 1024 * 1024,
                'content_type': 'video/mp4'
            })
            assert res.status_code == status.HTTP_400_BAD_REQUEST
            assert 'exceed the Dataroom storage limit of 10 MB' in res.data['detail']

            # 5 MB upload within 10 MB limit succeeds
            res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/uploads/request/', {
                'file_name': 'small_file.pdf',
                'file_size': 5 * 1024 * 1024,
                'content_type': 'application/pdf'
            })
            assert res.status_code == status.HTTP_200_OK

    def test_dataroom_storage_version_defaults_and_vault_hierarchy(self, api_client, user, organization):
        """Test newly created dataroom defaults to storage_version=2 and uses __datarooms__ vault."""
        api_client.force_authenticate(user=user)
        res = api_client.post('/api/v1/datarooms/', {'name': 'Modern Vault Dataroom'})
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['storage_version'] == 2

        dataroom = Dataroom.objects.get(id=res.data['id'])
        assert dataroom.storage_version == 2

        # Finalize direct upload into v2 dataroom
        from datarooms.views import DataroomViewSet
        view = DataroomViewSet()
        vault_folder = view._ensure_library_folder_path(user, dataroom, relative_path="Subfolder/file.pdf")
        assert vault_folder.parent.name == str(dataroom.id)
        assert vault_folder.parent.parent.name == "__datarooms__"
        assert vault_folder.parent.created_by is None

    def test_v1_dataroom_feature_gating_and_upgrade(self, api_client, user, user2, organization):
        """Test that v1 dataroom gates collaboration/transfer and can be upgraded to v2."""
        api_client.force_authenticate(user=user)
        dataroom = Dataroom.objects.create(name="Legacy Dataroom", organization=organization, created_by=user, storage_version=1)

        # 1. Attempt adding collaborator on v1 dataroom -> rejected
        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', {'user_ids': [str(user2.id)]})
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert 'legacy storage (v1)' in res.data['detail']

        # 2. Attempt transfer ownership on v1 dataroom -> rejected
        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/transfer-ownership/', {'new_owner_id': str(user2.id)})
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert 'legacy storage (v1)' in res.data['detail']

        # 3. Upgrade dataroom to v2
        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/upgrade-storage/')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['storage_version'] == 2

        dataroom.refresh_from_db()
        assert dataroom.storage_version == 2

        # 4. Now adding collaborator on upgraded room succeeds
        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', {'user_ids': [str(user2.id)]})
        assert res.status_code == status.HTTP_201_CREATED

    def test_v1_dataroom_upgrade_with_duplicate_document_names_in_legacy_folders(self, api_client, user, organization):
        """Test that upgrading a v1 dataroom handles duplicate document and folder names across legacy backing roots without IntegrityError."""
        api_client.force_authenticate(user=user)
        dataroom = Dataroom.objects.create(name="Project Omega", organization=organization, created_by=user, storage_version=1)

        root_folder = Folder.objects.get_root_for_org(organization)
        from core.models import User
        user2 = User.objects.create_user(
            username="collab_legacy",
            email="collab_legacy@example.com",
            password="password123",
            organization=organization,
        )
        # Create two legacy "Dataroom Uploads" roots (from different users' legacy paths)
        legacy_uploads_1 = Folder.objects.create(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=user,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )
        legacy_uploads_2 = Folder.objects.create(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=user2,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )

        legacy_name = get_dataroom_storage_folder_name(dataroom.name, dataroom)
        old_folder_1 = Folder.objects.create(
            organization=organization,
            parent=legacy_uploads_1,
            name=legacy_name,
            created_by=user,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )
        old_folder_2 = Folder.objects.create(
            organization=organization,
            parent=legacy_uploads_2,
            name=legacy_name,
            created_by=user2,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )

        # Create two documents with the exact same name created by the same user in different legacy folders
        doc1 = Document.objects.create(
            organization=organization,
            folder=old_folder_1,
            name="Confidential_Report.pdf",
            type="document",
            content_type="application/pdf",
            status="ready",
            created_by=user
        )
        doc2 = Document.objects.create(
            organization=organization,
            folder=old_folder_2,
            name="Confidential_Report.pdf",
            type="document",
            content_type="application/pdf",
            status="ready",
            created_by=user
        )

        # Create two subfolders with the same name created by the same user in different legacy folders
        subf1 = Folder.objects.create(
            organization=organization,
            parent=old_folder_1,
            name="Financials",
            created_by=user,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )
        subf2 = Folder.objects.create(
            organization=organization,
            parent=old_folder_2,
            name="Financials",
            created_by=user2,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )

        # Perform upgrade
        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/upgrade-storage/')
        assert res.status_code == status.HTTP_200_OK

        dataroom.refresh_from_db()
        assert dataroom.storage_version == 2

        doc1.refresh_from_db()
        doc2.refresh_from_db()
        subf1.refresh_from_db()
        subf2.refresh_from_db()

        # Both documents should now be in the new vault folder with distinct names
        assert doc1.folder_id == doc2.folder_id
        assert doc1.name != doc2.name

        # Both subfolders should now be in the new vault folder with distinct names
        assert subf1.parent_id == subf2.parent_id

    def test_v1_dataroom_upgrade_clears_created_by_on_subfolders_and_deducts_user_quota(self, api_client, user, organization):
        """Test that upgrading a v1 dataroom clears created_by on subfolders and descendants to obey the vault invariant and deducts user quota."""
        api_client.force_authenticate(user=user)
        dataroom = Dataroom.objects.create(name="Project Beta", organization=organization, created_by=user, storage_version=1)

        root_folder = Folder.objects.get_root_for_org(organization)
        legacy_uploads = Folder.objects.create(organization=organization, parent=root_folder, name="Dataroom Uploads", created_by=user)
        legacy_name = get_dataroom_storage_folder_name(dataroom.name, dataroom)
        old_folder = Folder.objects.create(organization=organization, parent=legacy_uploads, name=legacy_name, created_by=user)

        # Create child subfolder and nested subfolder in the legacy backing directory
        subf = Folder.objects.create(organization=organization, parent=old_folder, name="Reports", created_by=user)
        nested_subf = Folder.objects.create(organization=organization, parent=subf, name="2026", created_by=user)

        # Direct doc under dataroom root
        doc_root = Document.objects.create(
            organization=organization, folder=old_folder, name="Root.pdf",
            type="document", content_type="application/pdf", file_size=1000,
            status="ready", created_by=user
        )
        # Doc in subfolder
        doc_sub = Document.objects.create(
            organization=organization, folder=subf, name="Sub.pdf",
            type="document", content_type="application/pdf", file_size=2000,
            status="ready", created_by=user
        )
        # Doc in nested subfolder
        doc_nested = Document.objects.create(
            organization=organization, folder=nested_subf, name="Nested.pdf",
            type="document", content_type="application/pdf", file_size=2000,
            status="ready", created_by=user
        )
        # Personal document outside dataroom
        personal_folder = Folder.objects.create(organization=organization, parent=root_folder, name="My Private Docs", created_by=user)
        personal_doc = Document.objects.create(
            organization=organization, folder=personal_folder, name="Personal.pdf",
            type="document", content_type="application/pdf", file_size=500,
            status="ready", created_by=user
        )

        user.total_document_size = 5500
        user.save(update_fields=['total_document_size'])

        # Perform upgrade
        res = api_client.post(f'/api/v1/datarooms/{dataroom.id}/upgrade-storage/')
        assert res.status_code == status.HTTP_200_OK

        dataroom.refresh_from_db()
        assert dataroom.storage_version == 2

        subf.refresh_from_db()
        nested_subf.refresh_from_db()
        assert subf.created_by is None
        assert nested_subf.created_by is None

        doc_root.refresh_from_db()
        doc_sub.refresh_from_db()
        doc_nested.refresh_from_db()
        assert is_dataroom_vault_document(doc_root) is True
        assert is_dataroom_vault_document(doc_sub) is True
        assert is_dataroom_vault_document(doc_nested) is True

        user.refresh_from_db()
        assert user.total_document_size == 500

    def test_dataroom_stats(self, api_client, user, organization):
        """
        Test retrieving aggregate stats for a dataroom (total_views, unique_viewers, duration, downloads).
        """
        dataroom = Dataroom.objects.create(name="Analytics Room", organization=organization, created_by=user)
        link1 = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        link2 = ShareLink.objects.create(dataroom=dataroom, created_by=user)

        # 4 sessions across 2 links: 3 unique non-empty emails (alice, bob, bounce), 1 empty email
        s1 = ViewSession.objects.create(
            share_link=link1,
            viewer_email="alice@example.com",
            duration_seconds=120,
            downloaded_at=timezone.now(),
        )
        s2 = ViewSession.objects.create(
            share_link=link1,
            viewer_email="bob@example.com",
            duration_seconds=60,
        )
        s3 = ViewSession.objects.create(
            share_link=link2,
            viewer_email="",
            duration_seconds=30,
        )
        # 0-second bounce session
        s4 = ViewSession.objects.create(
            share_link=link2,
            viewer_email="bounce@example.com",
            duration_seconds=0,
        )

        # 1 visit download under session 2
        DataroomVisit.objects.create(
            view_session=s2,
            downloaded_at=timezone.now(),
        )

        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/stats/')
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        # total_views includes the 0s bounce (4 total)
        assert data['total_views'] == 4
        assert data['unique_viewers'] == 3
        assert data['total_duration_seconds'] == 210
        # avg_duration_seconds uses 3 engaged sessions: 210 / 3 = 70.0 (not 210 / 4 = 52.5)
        assert data['avg_duration_seconds'] == 70.0
        assert data['total_downloads'] == 2  # 1 session download + 1 visit download

    def test_dataroom_stats_empty(self, api_client, user, organization):
        """
        Test dataroom stats when no sessions exist.
        """
        dataroom = Dataroom.objects.create(name="Empty Stats Room", organization=organization, created_by=user)
        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/stats/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            'total_views': 0,
            'unique_viewers': 0,
            'total_duration_seconds': 0,
            'avg_duration_seconds': 0,
            'total_downloads': 0,
        }

    def test_dataroom_stats_with_anonymous_viewers(self, api_client, user, organization):
        """
        Test that unique_viewers correctly counts anonymous viewers by IP address,
        deduplicates multiple sessions from the same IP, and omits records where both
        email and IP are missing.
        """
        dataroom = Dataroom.objects.create(name="Anonymous Stats Room", organization=organization, created_by=user)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)

        # 1. Identified viewer (Alice) from IP 1.1.1.1
        ViewSession.objects.create(share_link=link, viewer_email="alice@example.com", ip_address="1.1.1.1", duration_seconds=60)
        # 2. Identified viewer (Alice) again from another IP 2.2.2.2 (should deduplicate to 1 Alice)
        ViewSession.objects.create(share_link=link, viewer_email="alice@example.com", ip_address="2.2.2.2", duration_seconds=45)
        # 3. Anonymous viewer from IP 1.1.1.1 (should be distinct from email:alice@example.com)
        ViewSession.objects.create(share_link=link, viewer_email="", ip_address="1.1.1.1", duration_seconds=30)
        # 4. Same anonymous viewer from IP 1.1.1.1 (should deduplicate with #3)
        ViewSession.objects.create(share_link=link, viewer_email="", ip_address="1.1.1.1", duration_seconds=20)
        # 5. Different anonymous viewer from IP 3.3.3.3
        ViewSession.objects.create(share_link=link, viewer_email="", ip_address="3.3.3.3", duration_seconds=15)
        # 6. Anonymous session with no IP (None) -> omitted from unique_viewers
        ViewSession.objects.create(share_link=link, viewer_email="", ip_address=None, duration_seconds=10)
        # 7. Anonymous session with empty string IP ("") -> omitted from unique_viewers
        ViewSession.objects.create(share_link=link, viewer_email="", ip_address="", duration_seconds=5)

        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/stats/')
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Total views counts all 7 sessions
        assert data['total_views'] == 7
        # Unique viewers: 1 (alice) + 1 (anon 1.1.1.1) + 1 (anon 3.3.3.3) = 3 (unidentified IPs omitted)
        assert data['unique_viewers'] == 3









