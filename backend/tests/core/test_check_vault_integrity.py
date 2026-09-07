import io
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from documents.models import Folder
from core.models import Organization, User


@pytest.mark.django_db
def test_check_vault_integrity_success():
    out = io.StringIO()
    call_command("check_vault_integrity", stdout=out)
    output = out.getvalue()
    assert "CONESHARE VAULT STORAGE REFACTOR - PRODUCTION INTEGRITY AUDIT" in output
    assert "✓ AUDIT PASSED!" in output


@pytest.mark.django_db
def test_check_vault_integrity_catches_system_root_folder_type_violation():
    org = Organization.objects.create(name="Test Org")
    user = User.objects.create(username="testuser", email="test@example.com", organization=org)
    # Valid DB row (personal folder has created_by), but violates system naming convention
    Folder.objects.create(
        name="__root__",
        organization=org,
        folder_type="personal",
        created_by=user,
    )

    out = io.StringIO()
    err = io.StringIO()
    with pytest.raises(CommandError, match="Data integrity audit failed"):
        call_command("check_vault_integrity", stdout=out, stderr=err)

    err_output = err.getvalue()
    assert "__root__ folders with non-root type" in err_output


@pytest.mark.django_db
def test_check_vault_integrity_catches_v1_dataroom_with_vault_folder():
    org = Organization.objects.create(name="Test Org 2")
    user = User.objects.create(username="testuser2", email="test2@example.com", organization=org)
    root = Folder.objects.create(name="__root__", organization=org, folder_type="root")
    vault_root = Folder.objects.create(
        name="__datarooms__", organization=org, folder_type="vault", parent=root
    )
    vault_sub = Folder.objects.create(
        name="room-folder", organization=org, folder_type="vault", parent=vault_root
    )

    from datarooms.models import Dataroom

    Dataroom.objects.create(
        organization=org,
        created_by=user,
        name="Legacy Dataroom",
        storage_version=1,
        vault_folder=vault_sub,
    )

    out = io.StringIO()
    err = io.StringIO()
    with pytest.raises(CommandError, match="Data integrity audit failed"):
        call_command("check_vault_integrity", stdout=out, stderr=err)

    err_output = err.getvalue()
    assert "v1 datarooms have vault_folder set" in err_output
