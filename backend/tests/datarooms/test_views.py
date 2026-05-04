import os

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder, DataroomItemOrder
from documents.models import Document, Folder
from sharelinks.models import ShareLink, ViewSession

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
        DataroomDocument.objects.create(dataroom=dataroom, document=document, folder=None, name=document.name)
        DataroomFolder.objects.create(dataroom=dataroom, name="Subfolder", parent=None)

        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/')
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data['id'] == str(dataroom.id)
        assert len(data['items']) == 2
        assert data['items'][0]['type'] == 'folder'
        assert data['items'][1]['type'] == 'document'

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
        # 1 (get folder) + 1 (get children) + 1 (get documents) + 2 (for 2 ancestors)
        # + 1 (load dataroom.show_file_index) + 1 (check item-order rows for this scope) = 7
        with django_assert_num_queries(7):
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

    def test_add_content_to_dataroom(self, api_client, dataroom, document):
        """Test adding documents to a dataroom."""
        url = f'/api/v1/datarooms/{dataroom.id}/add-content/'
        data = {'document_ids': [str(document.id)]}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert DataroomDocument.objects.filter(dataroom=dataroom, document=document).exists()
        ddoc = DataroomDocument.objects.get(dataroom=dataroom, document=document)
        assert ddoc.name == document.name

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


class TestDataroomFolderViewSet:
    def test_create_dataroom_folder(self, api_client, dataroom):
        """Test creating a folder inside a dataroom."""
        url = '/api/v1/dataroom-folders/'
        data = {'name': 'New Dataroom Folder', 'dataroom': str(dataroom.id)}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomFolder.objects.filter(dataroom=dataroom, name='New Dataroom Folder').exists()

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
        DataroomDocument.objects.create(dataroom=dataroom, document=document, folder=parent_folder, name=document.name)

        url = f'/api/v1/dataroom-folders/{parent_folder.id}/'
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['name'] == "Parent"
        assert len(data['sub_folders']) == 1
        assert data['sub_folders'][0]['name'] == "Sub"
        assert len(data['documents']) == 1
        assert data['documents'][0]['name'] == document.name
        assert len(data['items']) == 2
        assert data['items'][0]['type'] == 'folder'
        assert data['items'][1]['type'] == 'document'

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


class TestDataroomDocumentViewSet:
    def test_rename_document_success(self, api_client, dataroom, document):
        """Test successfully renaming a dataroom document."""
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        url = f'/api/v1/dataroom-documents/{ddoc.id}/'
        data = {'name': 'Renamed Document.pdf'}
        response = api_client.patch(url, data)

        assert response.status_code == status.HTTP_200_OK
        ddoc.refresh_from_db()
        assert ddoc.name == 'Renamed Document.pdf'

    def test_rename_document_with_conflict_fails(self, api_client, dataroom, document):
        """Test renaming a document to a name that already exists fails."""
        # A document that already exists with the target name
        DataroomDocument.objects.create(dataroom=dataroom, document=document, name='existing-name.pdf')
        # The document we are going to try to rename
        doc2 = Document.objects.create(name="another.pdf", organization=dataroom.organization)
        ddoc_to_rename = DataroomDocument.objects.create(dataroom=dataroom, document=doc2, name='original-name.pdf')

        url = f'/api/v1/dataroom-documents/{ddoc_to_rename.id}/'
        data = {'name': 'existing-name.pdf'}
        response = api_client.patch(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'already exists' in str(response.json())

    def test_user_cannot_rename_document_in_others_dataroom(self, api_client, dataroom, document, user2):
        """A user cannot rename a document in a dataroom they do not own."""
        other_dataroom = Dataroom.objects.create(created_by=user2, name="Other DR", organization=dataroom.organization)
        ddoc = DataroomDocument.objects.create(dataroom=other_dataroom, document=document, name=document.name)

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
