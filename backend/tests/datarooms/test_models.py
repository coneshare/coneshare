import pytest

from datarooms.models import (
    DROOM_ITEM_TYPE_DOCUMENT,
    DROOM_ITEM_TYPE_FOLDER,
    Dataroom,
    DataroomCollaborator,
    DataroomDocument,
    DataroomFolder,
    DataroomItemOrder,
)

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
    assert not dataroom.branding_banner
    assert dataroom.branding_banner.name in (None, "")
    assert dataroom.brand_primary_color is None
    assert dataroom.brand_secondary_color is None
    assert dataroom.brand_accent_color is None
    assert dataroom.show_file_index is True


def test_dataroom_folder_creation(dataroom):
    """Test that a DataroomFolder instance can be created."""
    folder = DataroomFolder.objects.create(name="Test Folder", dataroom=dataroom)
    assert isinstance(folder, DataroomFolder)
    assert str(folder) == "Test Folder"
    assert folder.dataroom == dataroom
    

def test_dataroom_document_creation(dataroom, document):
    """Test that a DataroomDocument instance can be created."""
    dataroom_document = DataroomDocument.objects.create(
        dataroom=dataroom, document=document, name=document.name
    )
    assert isinstance(dataroom_document, DataroomDocument)
    assert dataroom_document.dataroom == dataroom
    assert dataroom_document.document == document
    assert dataroom_document.name == document.name
    

def test_dataroom_branding_banner_upload_path(organization, user):
    dataroom = Dataroom.objects.create(
        name="Branded Dataroom", organization=organization, created_by=user
    )
    dataroom.branding_banner.name = "banner.svg"
    expected = f"dataroom-branding/{organization.id}/{dataroom.id}/banner.svg"
    assert dataroom.branding_banner.field.generate_filename(dataroom, "banner.svg") == expected


def test_dataroom_item_order_creation(dataroom, document):
    folder = DataroomFolder.objects.create(name="Test Folder", dataroom=dataroom)
    dataroom_document = DataroomDocument.objects.create(
        dataroom=dataroom, document=document, name=document.name
    )
    order_row_1 = DataroomItemOrder.objects.create(
        dataroom=dataroom,
        parent_folder=None,
        item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
        folder=folder,
        position=0,
    )
    order_row_2 = DataroomItemOrder.objects.create(
        dataroom=dataroom,
        parent_folder=None,
        item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
        dataroom_document=dataroom_document,
        position=1,
    )
    assert order_row_1.position == 0
    assert order_row_2.position == 1
    assert order_row_1.item_type == DROOM_ITEM_TYPE_FOLDER
    assert order_row_2.item_type == DROOM_ITEM_TYPE_DOCUMENT


def test_dataroom_collaborator_creation(dataroom, user):
    """Test that a DataroomCollaborator instance can be created and uniqueness is enforced."""
    from core.models import User
    collab_user = User.objects.create_user(
        email="collab@test.com", username="collab@test.com", password="password", organization=dataroom.organization
    )
    collab = DataroomCollaborator.objects.create(
        dataroom=dataroom,
        user=collab_user,
        role=DataroomCollaborator.ROLE_COLLABORATOR,
        invited_by=user,
    )
    assert isinstance(collab, DataroomCollaborator)
    assert str(collab) == f"{collab_user.email} - {dataroom.name} (collaborator)"
    assert collab.dataroom == dataroom
    assert collab.user == collab_user
    assert collab.invited_by == user
    assert collab.role == "collaborator"

    # Test uniqueness
    with pytest.raises(Exception):
        DataroomCollaborator.objects.create(
            dataroom=dataroom,
            user=collab_user,
            role=DataroomCollaborator.ROLE_COLLABORATOR,
        )

