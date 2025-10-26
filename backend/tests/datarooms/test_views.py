import pytest
from rest_framework import status

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
from documents.models import Document, Folder

pytestmark = pytest.mark.django_db


class TestDataroomViewSet:
    def test_list_datarooms_scoped_to_organization(self, api_client, user, user2, organization):
        """
        Test retrieving datarooms is scoped to the organization, not the user.
        """
        Dataroom.objects.create(name="My Dataroom", organization=organization, created_by=user)
        Dataroom.objects.create(name="Other's Dataroom", organization=organization, created_by=user2)

        response = api_client.get('/api/v1/datarooms/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2

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
