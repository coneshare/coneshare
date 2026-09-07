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
def test_check_vault_integrity_catches_folder_invariant_violation():
    org = Organization.objects.create(name="Test Org")
    # Violate folder invariant: vault folder with no parent
    Folder.objects.create(
        name="illegal_vault",
        organization=org,
        folder_type="vault",
        parent=None,
        created_by=None,
    )

    out = io.StringIO()
    err = io.StringIO()
    with pytest.raises(CommandError, match="Data integrity audit failed"):
        call_command("check_vault_integrity", stdout=out, stderr=err)

    err_output = err.getvalue()
    assert "Vault folder invariant violated" in err_output
