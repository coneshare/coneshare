import pytest

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
n
pytestmark = pytest.mark.django_db


def test_dataroom_creation(organization, user):
    """Test that a Dataroom instance can be created."""
    dataroom = Dataroom.objects.create(
        name="Test Dataroom", organization=organization, created_by=user
    )
    assert isinstance(dataroom, Dataroom)
    assert str(dataroom) == "Test Dataroom"
    assert dataroom.organization == organization
    assert dataroom.created_by == user


def test_dataroom_folder_creation(dataroom):
    """Test that a DataroomFolder instance can be created."""
    folder = DataroomFolder.objects.create(name="Test Folder", dataroom=dataroom)
    assert isinstance(folder, DataroomFolder)
    assert str(folder) == "Test Folder"
    assert folder.dataroom == dataroom


def test_dataroom_document_creation(dataroom, document):
    """Test that a DataroomDocument instance can be created."""
    dataroom_document = DataroomDocument.objects.create(
        dataroom=dataroom, document=document
    )
    assert isinstance(dataroom_document, DataroomDocument)
    assert dataroom_document.dataroom == dataroom
    assert dataroom_document.document == document
    assert dataroom_document.name == document.name
