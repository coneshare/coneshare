import pytest
from datetime import timedelta
from django.utils import timezone

from core.models import User, Organization
from documents.models import Folder, Document
from documents.services import (
    soft_delete_folder,
    soft_delete_document,
    restore_item,
    empty_trash,
)
from documents.tasks import purge_expired_trash_documents_task


@pytest.fixture
def org_and_user(db):
    org = Organization.objects.create(name="Test Org")
    user = User.objects.create_user(username="testuser", email="test@coneshare.com", password="password", organization=org)
    root = Folder.objects.create(name="__root__", organization=org, created_by=user)
    return org, user, root


@pytest.mark.django_db
class TestTrashServicesAndTasks:

    def test_soft_delete_folder_preserves_existing_deleted_at(self, org_and_user):
        """
        Soft deleting a parent folder must NOT overwrite deleted_at on children already soft-deleted earlier.
        """
        org, user, root = org_and_user
        parent = Folder.objects.create(name="Parent", organization=org, parent=root, created_by=user)
        child = Folder.objects.create(name="Child", organization=org, parent=parent, created_by=user)

        # Soft delete child 20 days ago
        old_time = timezone.now() - timedelta(days=20)
        child.deleted_at = old_time
        child.deleted_by = user
        child.save()

        # Now soft delete parent today
        soft_delete_folder(parent, user)

        child.refresh_from_db()
        parent.refresh_from_db()

        assert parent.deleted_at is not None
        # Child's deleted_at should preserve its original timestamp, not overwritten to parent's soft delete time
        assert abs((child.deleted_at - old_time).total_seconds()) < 2

    def test_restore_folder_name_collision_with_trashed_item(self, org_and_user):
        """
        Restoring a folder named 'Docs' when another 'Docs' is in trash should NOT cause false collision 'Docs (2)'.
        """
        org, user, root = org_and_user
        # Folder A named 'Docs' soft-deleted
        folder_a = Folder.objects.create(name="Docs", organization=org, parent=root, created_by=user)
        soft_delete_folder(folder_a, user)

        # Folder B named 'Docs' soft-deleted
        folder_b = Folder.objects.create(name="Docs (copy)", organization=org, parent=root, created_by=user)
        soft_delete_folder(folder_b, user)
        folder_b.name = "Docs"
        folder_b.save(update_fields=['name'])

        # Restore folder_b - since no active folder named 'Docs' exists, it should retain 'Docs'
        restore_item(folder_b, 'folder', user)
        folder_b.refresh_from_db()

        assert folder_b.name == "Docs"
        assert folder_b.deleted_at is None

    def test_restore_folder_name_collision_with_active_item(self, org_and_user):
        """
        Restoring a folder named 'Docs' when an active 'Docs' exists should generate 'Docs (2)'.
        """
        org, user, root = org_and_user
        trashed_folder = Folder.objects.create(name="Docs", organization=org, parent=root, created_by=user)
        soft_delete_folder(trashed_folder, user)

        # Active folder created after trashed_folder was soft deleted
        active_folder = Folder.objects.create(name="Docs", organization=org, parent=root, created_by=user)

        restore_item(trashed_folder, 'folder', user)
        trashed_folder.refresh_from_db()

        assert trashed_folder.name == "Docs (2)"
        assert trashed_folder.deleted_at is None

    def test_empty_trash_hard_deletes_without_double_delete_errors(self, org_and_user):
        """
        empty_trash should cleanly delete root trashed folders and their contents without double-delete exceptions.
        """
        org, user, root = org_and_user
        parent = Folder.objects.create(name="Parent", organization=org, parent=root, created_by=user)
        doc = Document.objects.create(
            name="file.txt",
            organization=org,
            folder=parent,
            created_by=user,
            storage_key="test/key.txt",
            file_size=100
        )
        soft_delete_folder(parent, user)

        # Confirm both are deleted
        assert Folder.objects.deleted().filter(id=parent.id).exists()
        assert Document.objects.deleted().filter(id=doc.id).exists()

        empty_trash(user)

        assert not Folder.objects.filter(id=parent.id).exists()
        assert not Document.objects.filter(id=doc.id).exists()

    def test_purge_expired_trash_documents_task(self, org_and_user):
        """
        purge_expired_trash_documents_task should purge items >= 30 days old and retain items < 30 days old.
        """
        org, user, root = org_and_user
        old_folder = Folder.objects.create(name="Old Folder", organization=org, parent=root, created_by=user)
        old_folder.deleted_at = timezone.now() - timedelta(days=31)
        old_folder.deleted_by = user
        old_folder.save()

        new_folder = Folder.objects.create(name="New Folder", organization=org, parent=root, created_by=user)
        new_folder.deleted_at = timezone.now() - timedelta(days=5)
        new_folder.deleted_by = user
        new_folder.save()

        purge_expired_trash_documents_task()

        assert not Folder.objects.filter(id=old_folder.id).exists()
        assert Folder.objects.filter(id=new_folder.id).exists()
