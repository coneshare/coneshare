import base64
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

import pytest
from django.utils import timezone
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from rest_framework import status
from rest_framework.exceptions import ValidationError

from core.authentication import generate_raw_api_key
from core.models import APIKey
from documents.models import Document, DocumentVersion
from documents.services import QuotaExceededError
from esign.models import SignatureField, SignatureRequest, SignerPageView
from esign.pdf_stamping import compute_sha256, render_typed_signature_png
from esign.services import send_signature_request, submit_signer_fields, void_signature_request


def _make_pdf(pages: int = 2) -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf)
    for idx in range(1, pages + 1):
        c.drawString(72, 720, f"Agreement Page {idx}")
        c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture
def esign_storage(monkeypatch):
    store: dict[str, bytes] = {}

    def _download(key: str) -> bytes:
        if key not in store:
            raise FileNotFoundError(key)
        return store[key]

    def _upload(key: str, data: bytes, content_type: str = "application/pdf") -> None:
        store[key] = bytes(data)

    monkeypatch.setattr("esign.services.download_storage_bytes", _download)
    monkeypatch.setattr("esign.services.upload_canonical_artifact", _upload)
    monkeypatch.setattr("esign.views.download_storage_bytes", _download)
    return store


@pytest.fixture
def pdf_document(user, organization, esign_storage):
    raw_pdf = _make_pdf(2)
    key = f"{organization.id}/agreement_src.pdf"
    esign_storage[key] = raw_pdf
    doc = Document.objects.create(
        name="Investment Agreement.pdf",
        organization=organization,
        created_by=user,
        type="pdf",
        status="ready",
        file_size=len(raw_pdf),
        num_pages=2,
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        original_storage_key=key,
        storage_key=key,
        file_size=len(raw_pdf),
        num_pages=2,
        is_primary=True,
    )
    return doc


@pytest.mark.django_db
class TestESignWorkflowsAndAPI:
    def test_idempotency_key_and_api_key_dispatch_block(
        self, api_client, public_client, user, pdf_document, dataroom
    ):
        raw_api_key, key_prefix, hashed_key = generate_raw_api_key()
        APIKey.objects.create(
            user=user,
            name="Agent Draft Key",
            prefix=key_prefix,
            hashed_key=hashed_key,
            tier="full_access",
        )

        agent_client = public_client.__class__()
        agent_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_api_key}")

        payload = {
            "document": str(pdf_document.id),
            "dataroom": str(dataroom.id),
            "title": "SAFE Financing Agreement",
            "signing_order": "sequential",
            "idempotency_key": "draft-safe-001",
            "signers": [
                {"name": "Founder One", "email": "founder@co.com", "role": "CEO", "order_index": 1},
                {"name": "Investor Two", "email": "investor@vc.com", "role": "Partner", "order_index": 2},
            ],
            "fields": [
                {
                    "signer_index": 0,
                    "field_type": "signature",
                    "page_number": 1,
                    "x": 10.0,
                    "y": 70.0,
                    "width": 30.0,
                    "height": 8.0,
                },
                {
                    "signer_index": 1,
                    "field_type": "signature",
                    "page_number": 2,
                    "x": 55.0,
                    "y": 70.0,
                    "width": 30.0,
                    "height": 8.0,
                },
            ],
        }

        r1 = agent_client.post("/api/v1/esign/requests/", payload, format="json")
        assert r1.status_code == status.HTTP_201_CREATED, r1.data
        req_id = r1.json()["id"]

        # Repeating same idempotency_key returns existing draft without duplicating
        r2 = agent_client.post("/api/v1/esign/requests/", payload, format="json")
        assert r2.status_code == status.HTTP_200_OK
        assert r2.json()["id"] == req_id
        assert SignatureRequest.objects.count() == 1

        # Serializer never leaks signer access_token
        assert "access_token" not in r1.json()["signers"][0]

        # APIKey auth cannot trigger external email dispatch or extract raw signing links
        send_blocked = agent_client.post(f"/api/v1/esign/requests/{req_id}/send/")
        assert send_blocked.status_code == status.HTTP_403_FORBIDDEN

        links_blocked = agent_client.get(f"/api/v1/esign/requests/{req_id}/signing-links/")
        assert links_blocked.status_code == status.HTTP_403_FORBIDDEN

        # Coordinate bounds rejected cleanly
        bad_payload = dict(payload)
        bad_payload["idempotency_key"] = "bad-coords"
        bad_payload["fields"] = [
            {
                "signer_index": 0,
                "field_type": "signature",
                "page_number": 1,
                "x": 80.0,
                "y": 70.0,
                "width": 30.0,
                "height": 8.0,
            }
        ]
        bad_resp = api_client.post("/api/v1/esign/requests/", bad_payload, format="json")
        assert bad_resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_sequential_signing_cookie_exchange_seal_vault_and_state_guards(
        self,
        api_client,
        public_client,
        user,
        dataroom,
        pdf_document,
        esign_storage,
        django_capture_on_commit_callbacks,
    ):
        payload = {
            "document": str(pdf_document.id),
            "dataroom": str(dataroom.id),
            "title": "Term Sheet 2026",
            "signing_order": "sequential",
            "signers": [
                {"name": "Signer One", "email": "One@Example.com", "role": "Founder", "order_index": 1},
                {"name": "Signer Two", "email": "two@example.com", "role": "Investor", "order_index": 2},
            ],
            "fields": [
                {
                    "signer_index": 0,
                    "field_type": "signature",
                    "page_number": 1,
                    "x": 10.0,
                    "y": 75.0,
                    "width": 30.0,
                    "height": 8.0,
                },
                {
                    "signer_index": 1,
                    "field_type": "signature",
                    "page_number": 2,
                    "x": 55.0,
                    "y": 60.0,
                    "width": 30.0,
                    "height": 8.0,
                },
                {
                    "signer_index": 1,
                    "field_type": "date",
                    "page_number": 2,
                    "x": 55.0,
                    "y": 75.0,
                    "width": 25.0,
                    "height": 6.0,
                },
            ],
        }
        create_resp = api_client.post("/api/v1/esign/requests/", payload, format="json")
        assert create_resp.status_code == status.HTTP_201_CREATED, create_resp.data
        req_id = create_resp.json()["id"]

        # Send request -> dispatches invitations cleanly
        with (
            patch("esign.services.send_signer_invitation_email_task.delay") as mock_invite,
            django_capture_on_commit_callbacks(execute=True),
        ):
            send_resp = api_client.post(f"/api/v1/esign/requests/{req_id}/send/")
            assert send_resp.status_code == status.HTTP_200_OK, send_resp.data
        assert mock_invite.call_count == 1  # sequential only notifies order_index=1

        # Re-sending non-draft fails TDD guard
        sig_req = SignatureRequest.objects.get(id=req_id)
        with pytest.raises(ValidationError):
            send_signature_request(str(sig_req.id), user)

        links_resp = api_client.get(f"/api/v1/esign/requests/{req_id}/signing-links/")
        assert links_resp.status_code == status.HTTP_200_OK
        links_by_email = {item["email"]: item["signing_url"] for item in links_resp.json()["results"]}
        assert "#token=" in links_by_email["one@example.com"]
        assert "?token=" not in links_by_email["one@example.com"]

        token1 = links_by_email["one@example.com"].split("#token=", 1)[1]
        token2 = links_by_email["two@example.com"].split("#token=", 1)[1]

        # Signer 2 cannot submit before Signer 1
        c2 = public_client.__class__()
        ex2 = c2.post(f"/api/v1/esign/sign/{req_id}/exchange-token/", {"token": token2}, format="json")
        assert ex2.status_code == status.HTTP_200_OK
        s2_session = c2.get(f"/api/v1/esign/sign/{req_id}/")
        assert s2_session.status_code == status.HTTP_200_OK
        assert s2_session.json()["signer"]["can_sign"] is False

        field2_sig = SignatureField.objects.get(request=sig_req, signer__email="two@example.com", field_type="signature")
        field2_date = SignatureField.objects.get(request=sig_req, signer__email="two@example.com", field_type="date")
        early_submit = c2.post(
            f"/api/v1/esign/sign/{req_id}/submit/",
            {
                "fields": [
                    {"field_id": str(field2_sig.id), "signature_type": "type", "value": "Signer Two"},
                    {"field_id": str(field2_date.id), "value": "2026-11-14"},
                ]
            },
            format="json",
        )
        assert early_submit.status_code == status.HTTP_400_BAD_REQUEST

        # Signer 1 exchanges token -> gets HttpOnly cookie -> reads PDF, records dwell, submits signature
        c1 = public_client.__class__()
        ex1 = c1.post(f"/api/v1/esign/sign/{req_id}/exchange-token/", {"token": token1}, format="json")
        assert ex1.status_code == status.HTTP_200_OK
        s1_session = c1.get(f"/api/v1/esign/sign/{req_id}/")
        assert s1_session.status_code == status.HTTP_200_OK
        assert s1_session.json()["signer"]["can_sign"] is True
        cookie_name = f"esign_signer_{req_id}"
        assert c1.cookies[cookie_name]["httponly"]

        # Unauthenticated request without cookie cannot read PDF
        assert public_client.get(f"/api/v1/esign/sign/{req_id}/pdf/").status_code == status.HTTP_403_FORBIDDEN

        pdf_resp = c1.get(f"/api/v1/esign/sign/{req_id}/pdf/")
        assert pdf_resp.status_code == status.HTTP_200_OK
        assert pdf_resp["Content-Type"] == "application/pdf"

        pv_resp = c1.post(
            f"/api/v1/esign/sign/{req_id}/page-views/",
            {"page_number": 1, "duration_seconds": 12},
            format="json",
        )
        assert pv_resp.status_code == status.HTTP_201_CREATED
        assert SignerPageView.objects.filter(request=sig_req, page_number=1, duration_seconds=12).exists()

        png_b64 = base64.b64encode(render_typed_signature_png("Signer One")).decode("ascii")
        field1 = SignatureField.objects.get(request=sig_req, signer__email="one@example.com")
        with (
            patch("esign.services.send_signer_invitation_email_task.delay") as mock_next_invite,
            django_capture_on_commit_callbacks(execute=True),
        ):
            sub1 = c1.post(
                f"/api/v1/esign/sign/{req_id}/submit/",
                {
                    "fields": [
                        {
                            "field_id": str(field1.id),
                            "signature_type": "draw",
                            "signature_data": f"data:image/png;base64,{png_b64}",
                        }
                    ]
                },
                format="json",
            )
            assert sub1.status_code == status.HTTP_200_OK, sub1.data
            assert sub1.json()["request"]["status"] == "in_progress"
        assert mock_next_invite.call_count == 1  # Notifies Signer 2

        # Signer 2 now signs final field -> request completes, vaults to Executed/Agreements/, fires webhook
        with (
            patch("esign.services.send_signature_completed_email_task.delay") as mock_done_mail,
            patch("esign.services.dispatch_automation_event_task.delay") as mock_auto,
            django_capture_on_commit_callbacks(execute=True),
        ):
            sub2 = c2.post(
                f"/api/v1/esign/sign/{req_id}/submit/",
                {
                    "fields": [
                        {"field_id": str(field2_sig.id), "signature_type": "type", "value": "Signer Two"},
                        {"field_id": str(field2_date.id), "value": "2026-11-14"},
                    ]
                },
                format="json",
            )
            assert sub2.status_code == status.HTTP_200_OK, sub2.data
            assert sub2.json()["request"]["status"] == "completed"

        assert mock_done_mail.call_count == 1
        signed_hooks = [c for c in mock_auto.call_args_list if c.args[0] == "document_signed"]
        assert len(signed_hooks) == 1

        sig_req.refresh_from_db()
        assert sig_req.status == SignatureRequest.STATUS_COMPLETED
        assert sig_req.completed_file_sha256 == compute_sha256(
            esign_storage[sig_req.completed_file_storage_key]
        )
        assert sig_req.vault_dataroom_document is not None
        assert sig_req.vault_dataroom_document.folder.name == str(sig_req.id)
        assert sig_req.vault_dataroom_document.folder.parent.name == "Agreements"
        assert sig_req.vault_dataroom_document.folder.parent.parent.name == "Executed"

        sealed_reader = PdfReader(BytesIO(esign_storage[sig_req.completed_file_storage_key]))
        assert len(sealed_reader.pages) == 3

        # Signer download & owner download succeed with RFC 6266 header
        dl_resp = c2.get(f"/api/v1/esign/sign/{req_id}/download/")
        assert dl_resp.status_code == status.HTTP_200_OK
        assert dl_resp["Content-Type"] == "application/pdf"
        assert "filename*=UTF-8''" in dl_resp["Content-Disposition"]

        # Completed request cannot be voided
        with pytest.raises(ValidationError):
            void_signature_request(str(sig_req.id), user)

    def test_final_signer_quota_failure_remains_retryable_and_completes_on_retry(
        self, api_client, user, pdf_document, esign_storage, django_capture_on_commit_callbacks
    ):
        api_client.force_authenticate(user=user)
        create_resp = api_client.post(
            "/api/v1/esign/requests/",
            {
                "document": str(pdf_document.id),
                "title": "Quota Retry SAFE",
                "signers": [{"email": "sole@example.com", "name": "Sole Signer"}],
                "fields": [
                    {
                        "signer_email": "sole@example.com",
                        "field_type": "signature",
                        "page_number": 1,
                        "x": 10.0,
                        "y": 75.0,
                        "width": 30.0,
                        "height": 8.0,
                    }
                ],
            },
            format="json",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        req_id = create_resp.json()["id"]

        with (
            patch("esign.services.send_signer_invitation_email_task.delay"),
            django_capture_on_commit_callbacks(execute=True),
        ):
            assert api_client.post(f"/api/v1/esign/requests/{req_id}/send/").status_code == status.HTTP_200_OK

        sig_req = SignatureRequest.objects.get(id=req_id)
        signer = sig_req.signers.get()
        field = sig_req.fields.get()

        submitted = [{"field_id": str(field.id), "signature_type": "type", "value": "Sole Signer"}]
        with patch("esign.services.enforce_quota_before_artifact_creation", side_effect=QuotaExceededError("Storage full")):
            with pytest.raises(QuotaExceededError):
                submit_signer_fields(signer, submitted, ip_address="198.51.100.1", user_agent="pytest")

        # Signer must NOT be wedged as SIGNED; request stays signable for retry once quota is freed
        signer.refresh_from_db()
        sig_req.refresh_from_db()
        assert signer.status != signer.STATUS_SIGNED
        assert signer.can_sign() is True
        assert sig_req.status == SignatureRequest.STATUS_SENT
        assert sig_req.completed_file_storage_key == ""

        # Retry succeeds and marks both signer SIGNED and request COMPLETED
        with (
            patch("esign.services.send_signature_completed_email_task.delay"),
            patch("esign.services.dispatch_automation_event_task.delay"),
            django_capture_on_commit_callbacks(execute=True),
        ):
            completed_req = submit_signer_fields(signer, submitted, ip_address="198.51.100.1", user_agent="pytest")

        signer.refresh_from_db()
        assert signer.status == signer.STATUS_SIGNED
        assert completed_req.status == SignatureRequest.STATUS_COMPLETED
        assert completed_req.completed_file_storage_key in esign_storage

        # Terminal completed request rejects page-view inserts
        c_done = api_client.__class__()
        c_done.post(f"/api/v1/esign/sign/{req_id}/exchange-token/", {"token": signer.access_token}, format="json")
        done_pv = c_done.post(
            f"/api/v1/esign/sign/{req_id}/page-views/",
            {"page_number": 1, "duration_seconds": 5},
            format="json",
        )
        assert done_pv.status_code == status.HTTP_400_BAD_REQUEST
        assert SignerPageView.objects.filter(request=completed_req).count() == 0

    def test_expired_signer_session_guards_pdf_decline_and_page_views(
        self, api_client, public_client, user, pdf_document, esign_storage, django_capture_on_commit_callbacks
    ):
        api_client.force_authenticate(user=user)
        create_resp = api_client.post(
            "/api/v1/esign/requests/",
            {
                "document": str(pdf_document.id),
                "title": "Expiring NDA",
                "signers": [{"email": "exp@example.com", "name": "Exp Signer"}],
                "fields": [
                    {
                        "signer_email": "exp@example.com",
                        "field_type": "signature",
                        "page_number": 1,
                        "x": 10.0,
                        "y": 75.0,
                        "width": 30.0,
                        "height": 8.0,
                    }
                ],
            },
            format="json",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        req_id = create_resp.json()["id"]

        with (
            patch("esign.services.send_signer_invitation_email_task.delay"),
            django_capture_on_commit_callbacks(execute=True),
        ):
            assert api_client.post(f"/api/v1/esign/requests/{req_id}/send/").status_code == status.HTTP_200_OK

        sig_req = SignatureRequest.objects.get(id=req_id)
        signer = sig_req.signers.get()
        c = public_client.__class__()
        assert c.post(f"/api/v1/esign/sign/{req_id}/exchange-token/", {"token": signer.access_token}, format="json").status_code == status.HTTP_200_OK

        # Expire request after cookie is already established
        sig_req.expires_at = timezone.now() - timedelta(minutes=5)
        sig_req.save(update_fields=["expires_at"])

        assert c.get(f"/api/v1/esign/sign/{req_id}/").status_code == status.HTTP_410_GONE
        assert c.get(f"/api/v1/esign/sign/{req_id}/pdf/").status_code == status.HTTP_410_GONE
        assert c.post(
            f"/api/v1/esign/sign/{req_id}/page-views/",
            {"page_number": 1, "duration_seconds": 3},
            format="json",
        ).status_code == status.HTTP_410_GONE
        assert c.post(
            f"/api/v1/esign/sign/{req_id}/decline/",
            {"reason": "Too late"},
            format="json",
        ).status_code == status.HTTP_400_BAD_REQUEST
        assert SignerPageView.objects.filter(request=sig_req).count() == 0
