import pytest
from rest_framework import status

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
from documents.models import Document, Folder

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
        """Test that retrieving a folder's contents does not cause an N+1 query problem."""
        parent_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Parent")

        # Create 5 documents in the folder
        for i in range(5):
            doc = Document.objects.create(name=f"Doc {i}", organization=organization, created_by=user)
            DataroomDocument.objects.create(dataroom=dataroom, document=doc, folder=parent_folder)

        # The number of queries should be constant and not dependent on the number of documents.
        # Without select_related, this would be over 10 queries (1+5 for docs, 5 for users).
        # We expect a low, fixed number of queries (e.g., auth, main object, children, documents, ancestors).
        with django_assert_num_queries(6):
            url = f'/api/v1/dataroom-folders/{parent_folder.id}/'
            response = api_client.get(url)
            assert response.status_code == status.HTTP_200_OK
            assert len(response.json()['documents']) == 5

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
