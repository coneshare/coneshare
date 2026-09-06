import pytest
from django.db import IntegrityError, transaction
from django.core.exceptions import ValidationError

from documents.models import Document, Folder
from documents.services import is_dataroom_vault_document, recalculate_user_document_size
from datarooms.models import Dataroom
from datarooms.services import (
    get_or_create_dataroom_storage_folder,
    upgrade_dataroom_to_v2,
    delete_dataroom,
    sync_dataroom_folder_rename,
)


@pytest.mark.django_db
class TestVaultStorageRefactor:
    def test_folder_type_structural_invariants(self, user):
        org = user.organization
        root = Folder.objects.get_root_for_org(org)
        assert root.folder_type == Folder.FOLDER_TYPE_ROOT

        # 1. Valid Personal Folder (with parent)
        p1 = Folder.objects.create(
            name="Personal With Parent",
            organization=org,
            parent=root,
            created_by=user,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )
        assert p1.folder_type == Folder.FOLDER_TYPE_PERSONAL

        # 2. Valid Personal Folder (without parent - direct ORM/fixture support)
        p2 = Folder.objects.create(
            name="Personal Without Parent",
            organization=org,
            parent=None,
            created_by=user,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )
        assert p2.folder_type == Folder.FOLDER_TYPE_PERSONAL

        # 3. Valid Vault Container & Subfolders
        vault = Folder.objects.create(
            name="__datarooms__",
            organization=org,
            parent=root,
            created_by=None,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        assert vault.folder_type == Folder.FOLDER_TYPE_VAULT

        room_vault = Folder.get_or_create_vault_subfolder(
            organization=org,
            parent=vault,
            name="room_123",
        )[0]
        assert room_vault.folder_type == Folder.FOLDER_TYPE_VAULT
        assert room_vault.created_by is None

        # 4. Invalid: Personal folder with created_by=None violates constraint
        with transaction.atomic():
            with pytest.raises(IntegrityError):
                Folder.objects.create(
                    name="Bad Personal",
                    organization=org,
                    parent=root,
                    created_by=None,
                    folder_type=Folder.FOLDER_TYPE_PERSONAL,
                )

        # 5. Invalid: Vault folder without parent violates constraint
        with transaction.atomic():
            with pytest.raises(IntegrityError):
                Folder.objects.create(
                    name="Bad Vault No Parent",
                    organization=org,
                    parent=None,
                    created_by=None,
                    folder_type=Folder.FOLDER_TYPE_VAULT,
                )

        # 6. Invalid: Vault folder with created_by violates constraint
        with transaction.atomic():
            with pytest.raises(IntegrityError):
                Folder.objects.create(
                    name="Bad Vault With User",
                    organization=org,
                    parent=vault,
                    created_by=user,
                    folder_type=Folder.FOLDER_TYPE_VAULT,
                )

        # 7. Invalid: Root folder with parent violates constraint
        with transaction.atomic():
            with pytest.raises(IntegrityError):
                Folder.objects.create(
                    name="Bad Root",
                    organization=org,
                    parent=root,
                    created_by=None,
                    folder_type=Folder.FOLDER_TYPE_ROOT,
                )

    def test_get_or_create_vault_subfolder_rejects_non_vault_parent(self, user):
        org = user.organization
        root = Folder.objects.get_root_for_org(org)
        personal_folder = Folder.objects.create(
            name="Personal",
            organization=org,
            parent=root,
            created_by=user,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )
        with pytest.raises(AssertionError, match="is not a vault folder"):
            Folder.get_or_create_vault_subfolder(
                organization=org,
                parent=personal_folder,
                name="sub",
            )

    def test_get_or_create_vault_subfolder_rejects_invariant_kwargs(self, user):
        org = user.organization
        root = Folder.objects.get_root_for_org(org)
        vault_root, _ = Folder.objects.get_or_create(
            name="__datarooms__",
            organization=org,
            parent=root,
            folder_type=Folder.FOLDER_TYPE_VAULT,
            created_by=None,
        )
        with pytest.raises(ValueError, match="Vault folder type and creator are fixed"):
            Folder.get_or_create_vault_subfolder(
                organization=org,
                parent=vault_root,
                name="test_bad_type",
                folder_type=Folder.FOLDER_TYPE_PERSONAL,
            )

        with pytest.raises(ValueError, match="Vault folder type and creator are fixed"):
            Folder.get_or_create_vault_subfolder(
                organization=org,
                parent=vault_root,
                name="test_bad_user",
                created_by=user,
            )

    def test_unique_active_vault_folder_name_constraint(self, user):
        org = user.organization
        root = Folder.objects.get_root_for_org(org)
        vault_root, _ = Folder.objects.get_or_create(
            name="__datarooms__",
            organization=org,
            parent=root,
            folder_type=Folder.FOLDER_TYPE_VAULT,
            created_by=None,
        )
        # Create first vault subfolder
        Folder.objects.create(
            name="duplicate_vault",
            parent=vault_root,
            organization=org,
            folder_type=Folder.FOLDER_TYPE_VAULT,
            created_by=None,
        )
        # Creating a second active vault subfolder with same (org, parent, name) must raise IntegrityError
        with transaction.atomic():
            with pytest.raises(IntegrityError):
                Folder.objects.create(
                    name="duplicate_vault",
                    parent=vault_root,
                    organization=org,
                    folder_type=Folder.FOLDER_TYPE_VAULT,
                    created_by=None,
                )

    def test_dataroom_storage_folder_lifecycle_and_link(self, user):
        org = user.organization
        root = Folder.objects.get_root_for_org(org)
        dataroom = Dataroom.objects.create(
            name="Refactor Test Room",
            organization=org,
            created_by=user,
            storage_version=2,
        )
        assert dataroom.vault_folder is None

        # First call lazily allocates and links vault_folder
        folder = get_or_create_dataroom_storage_folder(dataroom, requesting_user=user)
        dataroom.refresh_from_db()
        assert dataroom.vault_folder == folder
        assert folder.folder_type == Folder.FOLDER_TYPE_VAULT
        assert folder.created_by is None

        # Relative path subfolder uses factory and adheres to invariant
        sub = get_or_create_dataroom_storage_folder(dataroom, relative_path="sub1/sub2/file.pdf")
        assert sub.folder_type == Folder.FOLDER_TYPE_VAULT
        assert sub.created_by is None
        assert sub.parent.folder_type == Folder.FOLDER_TYPE_VAULT

    def test_is_dataroom_vault_document_and_quota_recalculation(self, user):
        org = user.organization
        root = Folder.objects.get_root_for_org(org)
        vault_root, _ = Folder.objects.get_or_create(
            name="__datarooms__",
            organization=org,
            parent=root,
            defaults={
                'created_by': None,
                'folder_type': Folder.FOLDER_TYPE_VAULT,
            }
        )
        room_folder = Folder.get_or_create_vault_subfolder(
            organization=org,
            parent=vault_root,
            name="RoomA",
        )[0]
        personal_folder = Folder.objects.create(
            name="My Files",
            organization=org,
            parent=root,
            created_by=user,
            folder_type=Folder.FOLDER_TYPE_PERSONAL,
        )

        doc_vault = Document.objects.create(
            name="vault.pdf",
            organization=org,
            created_by=user,
            folder=room_folder,
            file_size=1000,
            status="ready",
        )
        doc_personal = Document.objects.create(
            name="personal.pdf",
            organization=org,
            created_by=user,
            folder=personal_folder,
            file_size=2000,
            status="ready",
        )

        assert is_dataroom_vault_document(doc_vault) is True
        assert is_dataroom_vault_document(doc_personal) is False

        total_size = recalculate_user_document_size(user)
        # Only personal doc counts towards personal quota
        assert total_size == 2000
