from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status

from documents.models import Document, DocumentVersion
from sharelinks.audience import MAX_ENTRIES, clean_entry, email_matches, normalize_entries
from sharelinks.models import EmailVerificationToken, PreviewSession, ShareLink, Viewer, ViewSession


class TestAudienceValidationAndMatching:
    def test_clean_entry_normalizes_exact_and_shorthand_patterns(self):
        assert clean_entry("  Alice@Example.COM ") == "alice@example.com"
        assert clean_entry("@LPFirm.com") == "*@lpfirm.com"
        assert clean_entry("*@Sub.LPFirm.com") == "*@sub.lpfirm.com"
        assert clean_entry("*@*.lpfirm.com") == "*@*.lpfirm.com"
        assert clean_entry("alice+*@company.co.uk") == "alice+*@company.co.uk"

    @pytest.mark.parametrize(
        "invalid_entry",
        [
            "",
            "   ",
            "@",
            "*@",
            "@*",
            "*@*",
            "alice@*",
            "*@com",
            "*@*.*",
            "*@*.com",
            "*@c*.com",
            "*@c*.io",
            "*@example.*",
            "*@*.c*",
            "*@example.a",
            "@..com",
            "@.example.com",
            "@example.com.",
            "alice@example..com",
            "alice?@example.com",
            "alice@[example].com",
            "not-an-email",
            "alice@bad@example.com",
            "alice@example.com extra",
        ],
    )
    def test_clean_entry_rejects_invalid_and_overbroad_patterns(self, invalid_entry):
        with pytest.raises(ValidationError):
            clean_entry(invalid_entry)

    def test_normalize_entries_deduplicates_and_preserves_order(self):
        entries = [
            " Alice@Example.com ",
            "",
            "   ",
            "@lpfirm.com",
            "alice@example.com",
            "*@LPFIRM.COM",
            "bob@partner.org",
        ]
        assert normalize_entries(entries) == [
            "alice@example.com",
            "*@lpfirm.com",
            "bob@partner.org",
        ]

    def test_normalize_entries_rejects_non_list_and_non_string(self):
        with pytest.raises(ValidationError):
            normalize_entries("alice@example.com")  # type: ignore[arg-type]

        with pytest.raises(ValidationError):
            normalize_entries(["alice@example.com", 123])  # type: ignore[list-item]

    def test_normalize_entries_enforces_max_entries_limit(self):
        entries = [f"user{i}@example.com" for i in range(MAX_ENTRIES + 1)]
        with pytest.raises(ValidationError):
            normalize_entries(entries)

    def test_email_matches_exact_and_wildcards(self):
        patterns = ["alice@example.com", "*@lpfirm.com", "*@*.fund.io"]
        assert email_matches("ALICE@EXAMPLE.COM", patterns) is True
        assert email_matches("partner@lpfirm.com", patterns) is True
        assert email_matches("analyst@eu.fund.io", patterns) is True
        assert email_matches("bob@example.com", patterns) is False
        assert email_matches("partner@notlpfirm.com", patterns) is False
        assert email_matches("", patterns) is False
        assert email_matches("alice@example.com", []) is False


@pytest.mark.django_db
class TestShareLinkAudienceAllowlist:
    @pytest.fixture
    def ready_document(self, user, organization):
        doc = Document.objects.create(
            name="Deck.pdf",
            type="pdf",
            created_by=user,
            organization=organization,
            status="ready",
        )
        DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            original_storage_key="org/deck.pdf",
        )
        return doc

    def test_serializer_create_update_and_public_meta_privacy(self, api_client, ready_document):
        create_resp = api_client.post(
            "/api/v1/share-links/",
            {
                "document": str(ready_document.id),
                "name": "Investor Link",
                "audience_mode": ShareLink.AUDIENCE_ALLOWLIST,
                "audience_emails": ["Alice@Example.com", "@lpfirm.com", "alice@example.com"],
                "requires_email": False,
            },
            format="json",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        data = create_resp.data
        assert data["audience_mode"] == ShareLink.AUDIENCE_ALLOWLIST
        assert data["audience_emails"] == ["alice@example.com", "*@lpfirm.com"]
        assert data["requires_email"] is True
        assert data["requires_email_verification"] is True

        link_id = data["id"]
        slug = data["slug"]

        # Partial PATCH without audience_emails preserves existing entries and keeps requires_email=True
        patch_resp = api_client.patch(
            f"/api/v1/share-links/{link_id}/",
            {"requires_email": False},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK
        assert patch_resp.data["audience_mode"] == ShareLink.AUDIENCE_ALLOWLIST
        assert patch_resp.data["audience_emails"] == ["alice@example.com", "*@lpfirm.com"]
        assert patch_resp.data["requires_email"] is True

        # Public meta never leaks audience_emails
        meta_resp = api_client.get(f"/api/v1/links/{slug}/public-meta/")
        assert meta_resp.status_code == status.HTTP_200_OK
        assert "audience_emails" not in meta_resp.data
        assert meta_resp.data["is_restricted"] is True

        # Switching back to anyone clears audience_emails
        reset_resp = api_client.patch(
            f"/api/v1/share-links/{link_id}/",
            {"audience_mode": ShareLink.AUDIENCE_ANYONE},
            format="json",
        )
        assert reset_resp.status_code == status.HTTP_200_OK
        assert reset_resp.data["audience_mode"] == ShareLink.AUDIENCE_ANYONE
        assert reset_resp.data["audience_emails"] == []

    def test_serializer_verification_default_and_explicit_override(self, api_client, ready_document):
        # Explicit requires_email_verification=False is honored and preserved on partial PATCH
        create_resp = api_client.post(
            "/api/v1/share-links/",
            {
                "document": str(ready_document.id),
                "name": "No-SMTP Allowlist",
                "audience_mode": ShareLink.AUDIENCE_ALLOWLIST,
                "audience_emails": ["@lpfirm.com"],
                "requires_email_verification": False,
            },
            format="json",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        assert create_resp.data["requires_email_verification"] is False

        patch_resp = api_client.patch(
            f"/api/v1/share-links/{create_resp.data['id']}/",
            {"name": "No-SMTP Allowlist Renamed"},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK
        assert patch_resp.data["requires_email_verification"] is False

        # Transitioning an existing 'anyone' link to 'allowlist' defaults requires_email_verification to True
        anyone_resp = api_client.post(
            "/api/v1/share-links/",
            {
                "document": str(ready_document.id),
                "name": "Open Link",
                "requires_email": False,
                "requires_email_verification": False,
            },
            format="json",
        )
        assert anyone_resp.status_code == status.HTTP_201_CREATED

        upgrade_resp = api_client.patch(
            f"/api/v1/share-links/{anyone_resp.data['id']}/",
            {
                "audience_mode": ShareLink.AUDIENCE_ALLOWLIST,
                "audience_emails": ["@lpfirm.com"],
            },
            format="json",
        )
        assert upgrade_resp.status_code == status.HTTP_200_OK
        assert upgrade_resp.data["requires_email"] is True
        assert upgrade_resp.data["requires_email_verification"] is True

    def test_serializer_rejects_empty_or_invalid_allowlist(self, api_client, ready_document):
        empty_resp = api_client.post(
            "/api/v1/share-links/",
            {
                "document": str(ready_document.id),
                "name": "Empty Allowlist",
                "audience_mode": ShareLink.AUDIENCE_ALLOWLIST,
                "audience_emails": [],
            },
            format="json",
        )
        assert empty_resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "audience_emails" in empty_resp.data

        invalid_resp = api_client.post(
            "/api/v1/share-links/",
            {
                "document": str(ready_document.id),
                "name": "Overbroad Allowlist",
                "audience_mode": ShareLink.AUDIENCE_ALLOWLIST,
                "audience_emails": ["*@*"],
            },
            format="json",
        )
        assert invalid_resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "audience_emails" in invalid_resp.data

    @patch("sharelinks.views.send_mail")
    def test_request_access_blocks_unlisted_email_before_side_effects(
        self, mock_send_mail, public_client, user, ready_document
    ):
        link = ShareLink.objects.create(
            document=ready_document,
            created_by=user,
            requires_email=True,
            requires_email_verification=True,
            audience_mode=ShareLink.AUDIENCE_ALLOWLIST,
            audience_emails=["alice@example.com", "*@lpfirm.com"],
        )

        denied = public_client.post(
            f"/api/v1/links/{link.slug}/request-access/",
            {"email": "bob@other.com"},
            format="json",
        )
        assert denied.status_code == status.HTTP_403_FORBIDDEN
        assert Viewer.objects.filter(email="bob@other.com").exists() is False
        assert EmailVerificationToken.objects.filter(share_link=link).exists() is False
        mock_send_mail.assert_not_called()

        allowed = public_client.post(
            f"/api/v1/links/{link.slug}/request-access/",
            {"email": "Partner@LPFirm.com"},
            format="json",
        )
        assert allowed.status_code == status.HTTP_200_OK
        assert allowed.data["verification_required"] is True
        assert Viewer.objects.filter(email="partner@lpfirm.com").exists() is True
        assert EmailVerificationToken.objects.filter(share_link=link, email="partner@lpfirm.com").exists() is True
        mock_send_mail.assert_called_once()

    def test_stale_access_token_rejected_on_view_data_and_confirm(self, public_client, user, ready_document):
        link = ShareLink.objects.create(
            document=ready_document,
            created_by=user,
            requires_email=True,
            requires_email_verification=True,
            audience_mode=ShareLink.AUDIENCE_ALLOWLIST,
            audience_emails=["alice@example.com"],
        )

        # Case 1: Token rejected during GET /view-data/?accessToken=... after allowlist narrowed
        token1 = EmailVerificationToken.objects.create(share_link=link, email="bob@example.com")
        view_resp = public_client.get(f"/api/v1/links/{link.slug}/view-data/?accessToken={token1.token}")
        assert view_resp.status_code == status.HTTP_403_FORBIDDEN
        assert view_resp.data["protectionType"] == "email"
        assert EmailVerificationToken.objects.filter(pk=token1.pk).exists() is False

        # Case 2: Token issued while allowed, then allowlist narrowed before POST /verify-access-token/confirm/
        link.audience_emails = ["alice@example.com", "bob@example.com"]
        link.save(update_fields=["audience_emails"])
        token2 = EmailVerificationToken.objects.create(share_link=link, email="bob@example.com")
        precheck_resp = public_client.get(f"/api/v1/links/{link.slug}/view-data/?accessToken={token2.token}")
        assert precheck_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert precheck_resp.data["requiresConfirmation"] is True

        link.audience_emails = ["alice@example.com"]
        link.save(update_fields=["audience_emails"])

        confirm_resp = public_client.post(
            f"/api/v1/links/{link.slug}/verify-access-token/confirm/",
            {"token": token2.token},
            format="json",
        )
        assert confirm_resp.status_code == status.HTTP_403_FORBIDDEN
        assert confirm_resp.data["protectionType"] == "email"
        assert EmailVerificationToken.objects.filter(pk=token2.pk).exists() is False

    def test_active_session_invalidated_when_removed_from_allowlist(self, public_client, user, ready_document):
        link = ShareLink.objects.create(
            document=ready_document,
            created_by=user,
            requires_email=True,
            requires_email_verification=False,
            password="secret",
            require_nda=True,
            nda_text="Confidential",
            audience_mode=ShareLink.AUDIENCE_ALLOWLIST,
            audience_emails=["alice@example.com"],
        )

        # Authorize external visitor session
        req_resp = public_client.post(
            f"/api/v1/links/{link.slug}/request-access/",
            {"email": "alice@example.com"},
            format="json",
        )
        assert req_resp.status_code == status.HTTP_200_OK

        # Create a view session to also test Q&A gating
        view_session = ViewSession.objects.create(share_link=link, viewer_email="alice@example.com")

        # Narrow allowlist to remove alice@example.com
        link.audience_emails = ["carol@example.com"]
        link.save(update_fields=["audience_emails"])

        # 1. Password gate prerequisite blocks removed visitor
        pwd_resp = public_client.post(
            f"/api/v1/links/{link.slug}/verify-password/",
            {"password": "secret"},
            format="json",
        )
        assert pwd_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert pwd_resp.data["protectionType"] == "email"

        # 2. NDA gate prerequisite blocks removed visitor
        nda_resp = public_client.post(
            f"/api/v1/links/{link.slug}/accept-nda/",
            {},
            format="json",
        )
        assert nda_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert nda_resp.data["protectionType"] == "email"

        # 3. Public Q&A endpoint blocks removed visitor even with existing view_session_id
        qna_resp = public_client.get(
            f"/api/v1/links/{link.slug}/qna-summary/?view_session_id={view_session.id}"
        )
        assert qna_resp.status_code == status.HTTP_403_FORBIDDEN

        # 4. view-data invalidates session email auth and returns 401 email prompt
        view_resp = public_client.get(f"/api/v1/links/{link.slug}/view-data/")
        assert view_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert view_resp.data["protectionType"] == "email"
        assert public_client.session["authorized_share_links"][str(link.id)]["email_verified"] is False

    def test_owner_preview_bypasses_allowlist(self, public_client, user, ready_document):
        link = ShareLink.objects.create(
            document=ready_document,
            created_by=user,
            requires_email=True,
            audience_mode=ShareLink.AUDIENCE_ALLOWLIST,
            audience_emails=["external@partner.com"],
        )
        preview = PreviewSession.objects.create(
            share_link=link,
            user=user,
            token="preview-token-123",
            expires_at=timezone.now() + timedelta(minutes=15),
        )

        resp = public_client.get(f"/api/v1/links/{link.slug}/view-data/?previewToken={preview.token}")
        assert resp.status_code == status.HTTP_200_OK
        assert "audience_emails" not in resp.data.get("link_settings", {})

    def test_self_reported_session_rejected_when_allowlist_enables_verification(
        self, public_client, api_client, user, ready_document
    ):
        link = ShareLink.objects.create(
            document=ready_document,
            created_by=user,
            requires_email=True,
            requires_email_verification=False,
            audience_mode=ShareLink.AUDIENCE_ANYONE,
        )

        # Visitor obtains a self-reported session before allowlist is enabled
        req_resp = public_client.post(
            f"/api/v1/links/{link.slug}/request-access/",
            {"email": "alice@example.com"},
            format="json",
        )
        assert req_resp.status_code == status.HTTP_200_OK
        assert public_client.session["authorized_share_links"][str(link.id)]["email_method"] == "self_reported"

        # Owner upgrades link to allowlist (which defaults requires_email_verification=True)
        upgrade_resp = api_client.patch(
            f"/api/v1/share-links/{link.id}/",
            {
                "audience_mode": ShareLink.AUDIENCE_ALLOWLIST,
                "audience_emails": ["alice@example.com"],
            },
            format="json",
        )
        assert upgrade_resp.status_code == status.HTTP_200_OK
        assert upgrade_resp.data["requires_email_verification"] is True

        # Existing self-reported session is rejected and invalidated
        view_resp = public_client.get(f"/api/v1/links/{link.slug}/view-data/")
        assert view_resp.status_code == status.HTTP_401_UNAUTHORIZED
        assert view_resp.data["protectionType"] == "email"
        assert public_client.session["authorized_share_links"][str(link.id)]["email_verified"] is False

    def test_removed_viewer_invalidates_cached_nda_for_replacement_viewer(
        self, public_client, user, ready_document
    ):
        link = ShareLink.objects.create(
            document=ready_document,
            created_by=user,
            requires_email=True,
            requires_email_verification=False,
            require_nda=True,
            nda_text="Confidential Terms",
            nda_version=1,
            audience_mode=ShareLink.AUDIENCE_ALLOWLIST,
            audience_emails=["alice@example.com", "bob@example.com"],
        )

        # Alice authenticates and accepts the NDA
        req_alice = public_client.post(
            f"/api/v1/links/{link.slug}/request-access/",
            {"email": "alice@example.com"},
            format="json",
        )
        assert req_alice.status_code == status.HTTP_200_OK

        nda_alice = public_client.post(
            f"/api/v1/links/{link.slug}/accept-nda/",
            {},
            format="json",
        )
        assert nda_alice.status_code == status.HTTP_200_OK

        # Owner removes Alice from the allowlist while keeping Bob
        link.audience_emails = ["bob@example.com"]
        link.save(update_fields=["audience_emails"])

        # Alice's session is invalidated and cached NDA acceptance is cleared
        rejected_view = public_client.get(f"/api/v1/links/{link.slug}/view-data/")
        assert rejected_view.status_code == status.HTTP_401_UNAUTHORIZED
        assert rejected_view.data["protectionType"] == "email"
        assert public_client.session["authorized_share_links"][str(link.id)]["nda_accepted_version"] == 0

        # Bob verifies in the same browser session and must accept the NDA himself
        req_bob = public_client.post(
            f"/api/v1/links/{link.slug}/request-access/",
            {"email": "bob@example.com"},
            format="json",
        )
        assert req_bob.status_code == status.HTTP_200_OK

        bob_view = public_client.get(f"/api/v1/links/{link.slug}/view-data/")
        assert bob_view.status_code == status.HTTP_401_UNAUTHORIZED
        assert bob_view.data["protectionType"] == "nda"
