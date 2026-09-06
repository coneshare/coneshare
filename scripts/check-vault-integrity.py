#!/usr/bin/env python3
"""
Production Data Integrity Audit Script
=======================================
Verifies the integrity of folders, datarooms, documents, and quotas
following the Dataroom Vault Storage Refactor migrations (documents.0008, datarooms.0006).

Can be run:
  1. Directly via python: python scripts/check-vault-integrity.py
  2. Inside container: python manage.py shell < scripts/check-vault-integrity.py
  3. Via wrapper: ./scripts/check-vault-integrity.sh
"""

import os
import sys
from pathlib import Path

# Auto-configure Django environment if not already loaded
if "__file__" in globals():
    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    if backend_dir.exists() and str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

if not os.environ.get("DJANGO_SETTINGS_MODULE"):
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

try:
    import django
    django.setup()
except Exception:
    pass

from django.db.models import Q, Sum
from documents.models import Folder, Document
from datarooms.models import Dataroom
from documents.services import is_dataroom_vault_document
from core.models import User, Organization


class TermColors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


# Disable color formatting if stdout is redirected / not a tty
if not sys.stdout.isatty():
    TermColors.HEADER = ""
    TermColors.BLUE = ""
    TermColors.CYAN = ""
    TermColors.GREEN = ""
    TermColors.YELLOW = ""
    TermColors.RED = ""
    TermColors.BOLD = ""
    TermColors.RESET = ""


def print_section(title: str):
    print(f"\n{TermColors.BOLD}{TermColors.BLUE}=== {title} ==={TermColors.RESET}")


def print_pass(message: str):
    print(f"  {TermColors.GREEN}✓ [PASS]{TermColors.RESET} {message}")


def print_fail(message: str):
    print(f"  {TermColors.RED}✗ [FAIL]{TermColors.RESET} {message}")


def print_warn(message: str):
    print(f"  {TermColors.YELLOW}⚠ [WARN]{TermColors.RESET} {message}")


def print_info(message: str):
    print(f"  {TermColors.CYAN}ℹ [INFO]{TermColors.RESET} {message}")


def run_audit() -> int:
    print(f"{TermColors.BOLD}{TermColors.HEADER}CONESHARE VAULT STORAGE REFACTOR - PRODUCTION INTEGRITY AUDIT{TermColors.RESET}")
    print(f"Timestamp: {django.utils.timezone.now().isoformat()}")

    violations = []
    warnings = []

    # ---------------------------------------------------------
    # 1. Folder Type & Structural Invariant Verification
    # ---------------------------------------------------------
    print_section("1. Folder Classification & Invariants")
    total_folders = Folder.objects.count()
    print_info(f"Total Folders in Database: {total_folders}")

    # Check unknown types
    unknown_types = list(Folder.objects.exclude(folder_type__in=["root", "personal", "vault"]).values_list("id", "folder_type")[:10])
    if unknown_types:
        violations.append(f"Folders with unrecognized folder_type: {unknown_types}")
        print_fail(f"Found {len(unknown_types)} folder(s) with invalid folder_type!")
    else:
        print_pass("All folders have valid folder_type ('root', 'personal', 'vault')")

    # Check root invariants
    invalid_roots = list(
        Folder.objects.filter(folder_type="root")
        .filter(Q(parent__isnull=False) | Q(created_by__isnull=False))
        .values_list("id", flat=True)[:10]
    )
    if invalid_roots:
        violations.append(f"Root folders with parent or created_by set: {invalid_roots}")
        print_fail(f"Root folder invariant violated by IDs: {invalid_roots}")
    else:
        root_count = Folder.objects.filter(folder_type="root").count()
        print_pass(f"Root folder invariants valid ({root_count} root folders)")

    # Check vault invariants
    invalid_vaults = list(
        Folder.objects.filter(folder_type="vault")
        .filter(Q(parent__isnull=True) | Q(created_by__isnull=False))
        .values_list("id", flat=True)[:10]
    )
    if invalid_vaults:
        violations.append(f"Vault folders missing parent or with created_by set: {invalid_vaults}")
        print_fail(f"Vault folder invariant violated by IDs: {invalid_vaults}")
    else:
        vault_count = Folder.objects.filter(folder_type="vault").count()
        print_pass(f"Vault folder invariants valid ({vault_count} vault folders)")

    # Check personal invariants
    invalid_personals = list(
        Folder.objects.filter(folder_type="personal")
        .filter(created_by__isnull=True)
        .values_list("id", flat=True)[:10]
    )
    if invalid_personals:
        violations.append(f"Personal folders with NULL created_by: {invalid_personals}")
        print_fail(f"Personal folder invariant violated by IDs: {invalid_personals}")
    else:
        personal_count = Folder.objects.filter(folder_type="personal").count()
        print_pass(f"Personal folder invariants valid ({personal_count} personal folders)")

    # Check system folder conventions
    sys_root_not_root = list(Folder.objects.filter(name="__root__").exclude(folder_type="root").values_list("id", flat=True)[:10])
    if sys_root_not_root:
        violations.append(f"Folders named '__root__' not typed as 'root': {sys_root_not_root}")
        print_fail(f"__root__ folders with non-root type: {sys_root_not_root}")
    else:
        print_pass("All '__root__' folders correctly marked as folder_type='root'")

    sys_datarooms_not_vault = list(Folder.objects.filter(name="__datarooms__").exclude(folder_type="vault").values_list("id", flat=True)[:10])
    if sys_datarooms_not_vault:
        violations.append(f"Folders named '__datarooms__' not typed as 'vault': {sys_datarooms_not_vault}")
        print_fail(f"__datarooms__ folders with non-vault type: {sys_datarooms_not_vault}")
    else:
        print_pass("All '__datarooms__' folders correctly marked as folder_type='vault'")

    # ---------------------------------------------------------
    # 2. Dataroom Storage & Vault Links
    # ---------------------------------------------------------
    print_section("2. Dataroom Storage & Vault Links")
    total_datarooms = Dataroom.objects.count()
    v1_count = Dataroom.objects.filter(storage_version=1).count()
    v2_count = Dataroom.objects.filter(storage_version=2).count()
    print_info(f"Total Datarooms: {total_datarooms} (v1_legacy={v1_count}, v2_vault={v2_count})")

    # v1 datarooms must NOT have vault_folder
    v1_with_vault = list(Dataroom.objects.filter(storage_version=1, vault_folder__isnull=False).values_list("id", flat=True)[:10])
    if v1_with_vault:
        violations.append(f"Legacy v1 datarooms linked to a vault_folder: {v1_with_vault}")
        print_fail(f"v1 datarooms have vault_folder set: {v1_with_vault}")
    else:
        print_pass(f"All {v1_count} v1 datarooms isolated from vault_folder links")

    # v2 datarooms check
    v2_datarooms = Dataroom.objects.filter(storage_version=2).select_related("vault_folder")
    v2_missing_links = []
    v2_inconsistent = []

    for d in v2_datarooms:
        if not d.vault_folder:
            # Check if backing folder exists unlinked
            exists_unlinked = Folder.objects.filter(
                parent__name="__datarooms__",
                name=str(d.id),
                organization=d.organization
            ).first()
            if exists_unlinked:
                v2_missing_links.append((d.id, exists_unlinked.id))
            else:
                # Lazy folder not yet materialized (allowed if no files uploaded yet)
                pass
        else:
            vf = d.vault_folder
            if vf.folder_type != "vault":
                v2_inconsistent.append(f"Dataroom {d.id}: vault_folder {vf.id} type is '{vf.folder_type}' (expected 'vault')")
            if vf.name != str(d.id):
                v2_inconsistent.append(f"Dataroom {d.id}: vault_folder name '{vf.name}' != dataroom id '{d.id}'")
            if vf.organization_id != d.organization_id:
                v2_inconsistent.append(f"Dataroom {d.id}: org {d.organization_id} != vault_folder org {vf.organization_id}")
            if vf.created_by is not None:
                v2_inconsistent.append(f"Dataroom {d.id}: vault_folder has created_by={vf.created_by_id} (expected None)")

    if v2_missing_links:
        violations.append(f"v2 datarooms with unlinked backing folder: {v2_missing_links}")
        print_fail(f"v2 datarooms missing link to existing vault folder: {v2_missing_links}")
    else:
        print_pass("No unlinked backing folders found for v2 datarooms")

    if v2_inconsistent:
        violations.extend(v2_inconsistent)
        print_fail(f"v2 dataroom / vault_folder relationship inconsistencies: {v2_inconsistent}")
    else:
        linked_v2 = sum(1 for d in v2_datarooms if d.vault_folder)
        print_pass(f"All linked v2 datarooms ({linked_v2}) have consistent vault_folder references")

    # ---------------------------------------------------------
    # 3. Document Classification & Vault Scoping
    # ---------------------------------------------------------
    print_section("3. Document Classification & Scoping")
    total_docs = Document.objects.count()
    print_info(f"Total Documents in Database: {total_docs}")

    # Check documents in vault folders
    vault_doc_issues = []
    vault_docs = Document.objects.filter(folder__folder_type="vault").select_related("folder")
    for doc in vault_docs:
        if not is_dataroom_vault_document(doc):
            vault_doc_issues.append(doc.id)
            if len(vault_doc_issues) >= 10:
                break

    if vault_doc_issues:
        violations.append(f"Documents in vault folder misclassified by is_dataroom_vault_document(): {vault_doc_issues}")
        print_fail(f"Documents in vault folders misclassified: {vault_doc_issues}")
    else:
        print_pass(f"All documents in vault folders ({vault_docs.count()}) pass is_dataroom_vault_document()")

    # Check documents in personal folders
    personal_doc_issues = []
    personal_docs = Document.objects.filter(folder__folder_type="personal").select_related("folder")
    for doc in personal_docs:
        if is_dataroom_vault_document(doc):
            personal_doc_issues.append(doc.id)
            if len(personal_doc_issues) >= 10:
                break

    if personal_doc_issues:
        violations.append(f"Documents in personal folder falsely identified as vault documents: {personal_doc_issues}")
        print_fail(f"Documents in personal folders misclassified as vault: {personal_doc_issues}")
    else:
        print_pass(f"All documents in personal folders ({personal_docs.count()}) correctly identified as non-vault")

    # ---------------------------------------------------------
    # 4. Storage Quota Sanity Check
    # ---------------------------------------------------------
    print_section("4. Storage Quota Sanity")
    quota_mismatches = []
    for user in User.objects.filter(total_document_size__gt=0):
        # Calculate expected non-vault size
        expected_size = (
            Document.objects.active()
            .filter(created_by=user)
            .exclude(folder__folder_type="vault")
            .aggregate(total=Sum("file_size"))["total"]
            or 0
        )

        if user.total_document_size != expected_size:
            quota_mismatches.append(
                f"User {user.email} (id={user.id}): recorded={user.total_document_size}B vs expected={expected_size}B"
            )
            if len(quota_mismatches) >= 5:
                break

    if quota_mismatches:
        warnings.append(f"User quota mismatches: {quota_mismatches}")
        print_warn(f"Found {len(quota_mismatches)} user(s) with personal quota drift (may need recalculate_user_document_size):")
        for qm in quota_mismatches:
            print_warn(f"  {qm}")
    else:
        print_pass("User personal storage quotas cleanly exclude vault documents")

    # ---------------------------------------------------------
    # Final Summary
    # ---------------------------------------------------------
    print_section("AUDIT SUMMARY")
    if violations:
        print(f"{TermColors.BOLD}{TermColors.RED}AUDIT FAILED! Found {len(violations)} data integrity violation(s):{TermColors.RESET}")
        for v in violations:
            print(f"  - {v}")
        return 1
    elif warnings:
        print(f"{TermColors.BOLD}{TermColors.YELLOW}AUDIT PASSED WITH WARNINGS (No structural corruption detected).{TermColors.RESET}")
        for w in warnings:
            print(f"  - {w}")
        return 0
    else:
        print(f"{TermColors.BOLD}{TermColors.GREEN}✓ AUDIT PASSED! All data structures, relationships, and invariants are 100% clean and consistent.{TermColors.RESET}\n")
        return 0


if __name__ in ("__main__", "django.core.management.commands.shell", "builtins", "__builtin__") or "__file__" not in globals():
    exit_code = run_audit()
    if __name__ == "__main__":
        sys.exit(exit_code)
    elif exit_code != 0:
        raise SystemExit(exit_code)
