import pytest
from rest_framework import status

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
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

    def test_retrieve_dataroom_detail(self, api_client, dataroom, document):
        """Test retrieving a specific dataroom's contents."""
        # Add a document and a folder to the dataroom root
        DataroomDocument.objects.create(dataroom=dataroom, document=document, folder=None)
        DataroomFolder.objects.create(dataroom=dataroom, name="Subfolder", parent=None)

        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/')
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data['id'] == str(dataroom.id)
        assert len(data['documents']) == 1
        assert data['documents'][0]['document_name'] == document.name
        assert len(data['folders']) == 1
        assert data['folders'][0]['name'] == "Subfolder"

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
            DataroomDocument.objects.create(dataroom=dataroom, document=doc, folder=target_folder)

        # The number of queries should remain constant regardless of document count.
        # Current expected queries with N+1 bug in get_ancestors:
        # 1 (get folder) + 1 (get children) + 1 (get documents) + 2 (for 2 ancestors) = 5
        with django_assert_num_queries(5):
            url = f'/api/v1/dataroom-folders/{target_folder.id}/'
            response = api_client.get(url)
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

    def test_remove_content_from_dataroom(self, api_client, dataroom, document):
        """Test removing content from a dataroom."""
        dd = DataroomDocument.objects.create(dataroom=dataroom, document=document)
        assert DataroomDocument.objects.count() == 1

        url = f'/api/v1/datarooms/{dataroom.id}/remove-content/'
        data = {'dataroom_document_ids': [str(dd.id)]}
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert DataroomDocument.objects.count() == 0

    def test_move_document_to_folder(self, api_client, dataroom, document):
        """Test moving a document into a folder within a dataroom."""
        dataroom_doc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
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
        DataroomDocument.objects.create(dataroom=dataroom, document=document, folder=parent_folder)

        url = f'/api/v1/dataroom-folders/{parent_folder.id}/'
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['name'] == "Parent"
        assert len(data['sub_folders']) == 1
        assert data['sub_folders'][0]['name'] == "Sub"
        assert len(data['documents']) == 1
        assert data['documents'][0]['document_name'] == document.name


class TestPublicDataroomDataView:
    def test_get_valid_dataroom_data(self, public_client, dataroom, document, user):
        """
        Test that the public endpoint returns correctly filtered data based
        on visibility settings.
        """
        # Setup dataroom with content
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
        dfolder = DataroomFolder.objects.create(dataroom=dataroom, name="Folder")

        # Create share link for dataroom, which auto-creates settings
        link = ShareLink.objects.create(dataroom=dataroom, name="Public DR Link", created_by=user)

        # Make one item invisible
        folder_setting = link.dataroom_settings.get(dataroom_folder=dfolder)
        folder_setting.is_visible = False
        folder_setting.save()

        url = f"/api/v1/links/{link.slug}/view-data/"
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['id'] == str(dataroom.id)
        assert len(data['documents']) == 1
        assert data['documents'][0]['id'] == str(ddoc.id)
        # The folder should not be in the list
        assert len(data['folders']) == 0

    def test_get_password_protected_dataroom_returns_401(self, public_client, dataroom, user):
        """Test that a password-protected dataroom link requires auth."""
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user, password="testpassword")
        url = f"/api/v1/links/{link.slug}/view-data/"
        response = public_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'password'

    def test_get_document_from_dataroom_link_success(self, public_client, dataroom, document, user):
        """
        Test that a specific document can be fetched from a dataroom link
        when the correct document_id is provided.
        """
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(dataroom=dataroom, name="DR Link", created_by=user)

        url = f"/api/v1/links/{link.slug}/view-data/?document_id={document.id}"
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['link_type'] == 'document'
        assert data['id'] == str(document.id)
        assert data['name'] == document.name

    def test_get_document_from_dataroom_link_permission_denied(self, public_client, dataroom, document, user):
        """
        Test that fetching a document from a dataroom link fails if the item
        is marked as not visible.
        """
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        link = ShareLink.objects.create(dataroom=dataroom, name="DR Link", created_by=user)

        # Make the document invisible in this link's settings
        setting = link.dataroom_settings.get(dataroom_document__document=document)
        setting.is_visible = False
        setting.save()

        url = f"/api/v1/links/{link.slug}/view-data/?document_id={document.id}"
        response = public_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN
