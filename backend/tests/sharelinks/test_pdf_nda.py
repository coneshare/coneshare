import base64
from io import BytesIO
from unittest.mock import patch

import pytest
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from rest_framework import status

from core.authentication import generate_raw_api_key
from core.models import APIKey
from datarooms.models import DataroomDocument, DataroomFolder
from documents.models import Document, DocumentVersion
from esign.pdf_stamping import compute_sha256, render_typed_signature_png
from sharelinks.models import NDAAcceptance, ShareLink, ShareLinkDataroomSetting
from sharelinks.serializers import ShareLinkAcceptPDFNDASerializer


def _make_pdf_bytes(label: str = "Standard NDA") -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(72, 720, label)
    c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture
def in_memory_storage(monkeypatch):
    store: dict[str, bytes] = {}

    def _download(key: str) -> bytes:
        if key not in store:
            raise FileNotFoundError(key)
        return store[key]

    def _upload(key: str, data: bytes, content_type: str = "application/pdf") -> None:
        store[key] = bytes(data)

    monkeypatch.setattr("sharelinks.serializers.download_storage_bytes", _download)
    monkeypatch.setattr("sharelinks.views.download_storage_bytes", _download)
    monkeypatch.setattr("sharelinks.views.upload_canonical_artifact", _upload)
    return store


@pytest.fixture
def pdf_nda_template(user, organization, in_memory_storage):
    pdf_bytes = _make_pdf_bytes("Confidentiality Agreement v1")
    storage_key = f"{organization.id}/nda_template_v1.pdf"
    in_memory_storage[storage_key] = pdf_bytes
    doc = Document.objects.create(
        name="Standard Mutual NDA.pdf",
        organization=organization,
        created_by=user,
        type="pdf",
        status="ready",
        file_size=len(pdf_bytes),
        num_pages=1,
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        original_storage_key=storage_key,
        storage_key=storage_key,
        file_size=len(pdf_bytes),
        num_pages=1,
        is_primary=True,
    )
    return doc


@pytest.mark.django_db
class TestPDFNDAGatekeeper:
    def test_create_pdf_nda_share_link_pins_snapshot_and_updates_version(
        self, api_client, document, pdf_nda_template, in_memory_storage
    ):
        resp = api_client.post(
            "/api/v1/share-links/",
            {
                "document": str(document.id),
                "name": "Series A PDF NDA",
                "require_nda": True,
                "nda_type": "pdf",
                "nda_document": str(pdf_nda_template.id),
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        data = resp.json()
        assert data["nda_type"] == "pdf"
        assert data["nda_document"] == str(pdf_nda_template.id)
        assert data["nda_document_name"] == "Standard Mutual NDA.pdf"
        assert data["nda_version"] == 1
        assert data["nda_source_sha256"] == compute_sha256(
            in_memory_storage[f"{document.organization_id}/nda_template_v1.pdf"]
        )

        # Updating primary template PDF and re-pinning bumps nda_version
        new_pdf = _make_pdf_bytes("Confidentiality Agreement v2")
        new_key = f"{document.organization_id}/nda_template_v2.pdf"
        in_memory_storage[new_key] = new_pdf
        DocumentVersion.objects.filter(document=pdf_nda_template).update(is_primary=False)
        DocumentVersion.objects.create(
            document=pdf_nda_template,
            version_number=2,
            original_storage_key=new_key,
            storage_key=new_key,
            file_size=len(new_pdf),
            num_pages=1,
            is_primary=True,
        )

        patch_resp = api_client.patch(
            f"/api/v1/share-links/{data['id']}/",
            {"nda_document": str(pdf_nda_template.id)},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK
        assert patch_resp.json()["nda_version"] == 2
        assert patch_resp.json()["nda_source_sha256"] == compute_sha256(new_pdf)

    def test_accept_pdf_nda_stamps_vaults_isolates_and_downloads(
        self, api_client, public_client, dataroom, document, pdf_nda_template, in_memory_storage, user, django_capture_on_commit_callbacks
    ):
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name="Dataroom PDF NDA Link",
            allow_download=True,
        )
        sibling_link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            name="Sibling Unwalled Link",
            allow_download=True,
        )
        create_resp = api_client.patch(
            f"/api/v1/share-links/{link.id}/",
            {
                "require_nda": True,
                "nda_type": "pdf",
                "nda_document": str(pdf_nda_template.id),
            },
            format="json",
        )
        assert create_resp.status_code == status.HTTP_200_OK

        # Public meta advertises PDF NDA
        meta = public_client.get(f"/api/v1/links/{link.slug}/public-meta/").json()
        assert meta["nda_type"] == "pdf"
        assert meta["nda_document_name"] == "Standard Mutual NDA.pdf"

        # Preview works pre-acceptance when email/password gates aren't blocking
        preview = public_client.get(f"/api/v1/links/{link.slug}/nda-preview/")
        assert preview.status_code == status.HTTP_200_OK
        assert preview["Content-Type"] == "application/pdf"

        # Invalid coordinate payload rejected cleanly before signing
        bad_resp = public_client.post(
            f"/api/v1/links/{link.slug}/accept-nda/",
            {
                "signer_name": "Jane Investor",
                "signature_type": "type",
                "signature_data": "Jane Investor",
                "page_number": 1,
                "x_pct": 90.0,
                "y_pct": 10.0,
                "width_pct": 20.0,
                "height_pct": 10.0,
            },
            format="json",
        )
        assert bad_resp.status_code == status.HTTP_400_BAD_REQUEST

        # Sign via drawn PNG and dispatch automation event
        png_b64 = base64.b64encode(render_typed_signature_png("Jane Investor")).decode("ascii")
        with (
            patch("sharelinks.views._dispatch_automation_event") as mock_dispatch,
            django_capture_on_commit_callbacks(execute=True),
        ):
            accept_resp = public_client.post(
                f"/api/v1/links/{link.slug}/accept-nda/",
                {
                    "signer_name": "Jane Investor",
                    "signer_title": "Partner",
                    "signer_company": "Acme Ventures 测试",
                    "signer_email": "jane@acme.vc",
                    "signature_type": "draw",
                    "signature_data": f"data:image/png;base64,{png_b64}",
                },
                format="json",
            )
            assert accept_resp.status_code == status.HTTP_200_OK, accept_resp.data

        signed_events = [c for c in mock_dispatch.call_args_list if c.args[1] == "document_signed"]
        assert len(signed_events) == 1

        acceptance = NDAAcceptance.objects.get(share_link=link)
        assert acceptance.signer_name == "Jane Investor"
        assert acceptance.signed_doc_sha256 != acceptance.original_doc_sha256
        assert acceptance.vault_dataroom_document is not None

        # Verify vaulted PDF in Executed/NDAs/... contains Audit Certificate page
        sealed_bytes = in_memory_storage[acceptance.executed_pdf_storage_key]
        assert len(PdfReader(BytesIO(sealed_bytes)).pages) == 2

        # Accepting viewer can download their executed PDF with RFC 6266 header
        dl = public_client.get(f"/api/v1/links/{link.slug}/nda-download/")
        assert dl.status_code == status.HTTP_200_OK
        assert dl["Content-Type"] == "application/pdf"
        assert "filename*=UTF-8''" in dl["Content-Disposition"]

        # Other unauthenticated viewer cannot download by guessing acceptance_id
        other_client = public_client.__class__()
        forbidden_dl = other_client.get(
            f"/api/v1/links/{link.slug}/nda-download/?acceptance_id={acceptance.id}"
        )
        assert forbidden_dl.status_code == status.HTTP_403_FORBIDDEN

        # Even if visibility flags are forced True on Executed/NDAs, public dataroom views & downloads exclude it
        nda_folder = acceptance.vault_dataroom_document.folder
        ShareLinkDataroomSetting.objects.update_or_create(
            share_link=sibling_link,
            dataroom_folder=nda_folder,
            defaults={"is_visible": True, "allow_download": True},
        )
        ShareLinkDataroomSetting.objects.update_or_create(
            share_link=sibling_link,
            dataroom_folder=nda_folder.parent,
            defaults={"is_visible": True, "allow_download": True},
        )
        ShareLinkDataroomSetting.objects.update_or_create(
            share_link=sibling_link,
            dataroom_folder=nda_folder.parent.parent,
            defaults={"is_visible": True, "allow_download": True},
        )
        ShareLinkDataroomSetting.objects.update_or_create(
            share_link=sibling_link,
            dataroom_document=acceptance.vault_dataroom_document,
            defaults={"is_visible": True, "allow_download": True},
        )

        # Sibling viewer cannot list Executed/ folder items in view-data or download the NDA file/folder
        view_data = other_client.get(f"/api/v1/links/{sibling_link.slug}/view-data/").json()
        item_ids = {item["id"] for item in view_data.get("items", [])}
        assert str(acceptance.vault_dataroom_document_id) not in item_ids

        sub_folder_view = other_client.get(
            f"/api/v1/links/{sibling_link.slug}/view-data/?parent_id={nda_folder.id}"
        )
        assert sub_folder_view.status_code == status.HTTP_403_FORBIDDEN

        sub_doc_dl = other_client.get(
            f"/api/v1/links/{sibling_link.slug}/download-file/?dataroom_document_id={acceptance.vault_dataroom_document_id}"
        )
        assert sub_doc_dl.status_code in {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND}

        folder_zip = other_client.get(
            f"/api/v1/links/{sibling_link.slug}/download-folder/{nda_folder.id}/"
        )
        assert folder_zip.status_code == status.HTTP_403_FORBIDDEN

        # Owner acceptance summary endpoint omits raw ip_address / storage keys
        summary_resp = api_client.get(f"/api/v1/share-links/{link.id}/nda-acceptances/")
        assert summary_resp.status_code == status.HTTP_200_OK
        row = summary_resp.json()[0]
        assert row["signer_name"] == "Jane Investor"
        assert row["has_executed_pdf"] is True
        assert "ip_address" not in row
        assert "executed_pdf_storage_key" not in row

    def test_pdf_nda_preview_uses_rfc6266_header_and_rejects_tampered_sha256(
        self, api_client, public_client, user, document, pdf_nda_template, in_memory_storage
    ):
        pdf_nda_template.name = "保密协议 Mutual NDA 2026.pdf"
        pdf_nda_template.save(update_fields=["name"])

        api_client.force_authenticate(user=user)
        resp = api_client.post(
            "/api/v1/share-links/",
            {
                "name": "Unicode PDF NDA Link",
                "document": str(document.id),
                "require_nda": True,
                "nda_type": "pdf",
                "nda_document": str(pdf_nda_template.id),
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        slug = resp.json()["slug"]
        link = ShareLink.objects.get(slug=slug)

        # Preview succeeds with RFC 6266 Latin-1 safe fallback + UTF-8 filename*
        preview_resp = public_client.get(f"/api/v1/links/{slug}/nda-preview/")
        assert preview_resp.status_code == status.HTTP_200_OK
        cd = preview_resp["Content-Disposition"]
        cd.encode("latin-1")  # Must not trigger UnicodeEncodeError in WSGI servers
        assert cd.startswith('inline; filename="')
        assert "filename*=UTF-8''" in cd

        # Tamper stored bytes -> both preview and accept-nda reject with 409 Conflict
        in_memory_storage[link.nda_pdf_storage_key] = _make_pdf_bytes("Tampered NDA Template!")
        tampered_preview = public_client.get(f"/api/v1/links/{slug}/nda-preview/")
        assert tampered_preview.status_code == status.HTTP_409_CONFLICT

        tampered_accept = public_client.post(
            f"/api/v1/links/{slug}/accept-nda/",
            {
                "signer_name": "Alex Vance",
                "signature_type": "type",
                "signature_data": "Alex Vance",
            },
            format="json",
        )
        assert tampered_accept.status_code == status.HTTP_409_CONFLICT
        assert not NDAAcceptance.objects.filter(share_link=link).exists()

    def test_share_link_hides_nda_storage_key_blocks_apikey_nda_weakening_and_enforces_field_bounds(
        self, api_client, user, document, pdf_nda_template, in_memory_storage
    ):
        resp = api_client.post(
            "/api/v1/share-links/",
            {
                "name": "Guarded PDF NDA Link",
                "document": str(document.id),
                "require_nda": True,
                "nda_type": "pdf",
                "nda_document": str(pdf_nda_template.id),
            },
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        data = resp.json()
        assert "nda_pdf_storage_key" not in data
        assert data["has_nda_pdf"] is True
        link_id = data["id"]

        # APIKey may update non-NDA fields, but cannot disable or alter an active NDA gate
        raw_key, prefix, hashed_key = generate_raw_api_key()
        APIKey.objects.create(
            user=user,
            name="Agent RW Key",
            prefix=prefix,
            hashed_key=hashed_key,
            tier="read_write",
        )
        key_client = api_client.__class__()
        key_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")

        benign = key_client.patch(
            f"/api/v1/share-links/{link_id}/",
            {"name": "Renamed Via Agent"},
            format="json",
        )
        assert benign.status_code == status.HTTP_200_OK
        assert "nda_pdf_storage_key" not in benign.json()

        alt_bytes = _make_pdf_bytes("Alternate NDA Template")
        alt_key = f"{document.organization_id}/alt_nda_template.pdf"
        in_memory_storage[alt_key] = alt_bytes
        alt_nda_doc = Document.objects.create(
            name="Alternate NDA.pdf",
            organization=document.organization,
            created_by=user,
            type="pdf",
            status="ready",
            file_size=len(alt_bytes),
            num_pages=1,
        )
        DocumentVersion.objects.create(
            document=alt_nda_doc,
            version_number=1,
            original_storage_key=alt_key,
            storage_key=alt_key,
            file_size=len(alt_bytes),
            num_pages=1,
            is_primary=True,
        )

        for payload in (
            {"require_nda": False},
            {"nda_type": "text", "nda_text": "Weakened"},
            {"nda_document": str(alt_nda_doc.id)},
        ):
            blocked = key_client.patch(f"/api/v1/share-links/{link_id}/", payload, format="json")
            assert blocked.status_code == status.HTTP_403_FORBIDDEN

        # Rule 6 field-level min/max validators reject out-of-range numeric values cleanly
        ser_neg = ShareLinkAcceptPDFNDASerializer(
            data={
                "signer_name": "Alex",
                "signature_type": "type",
                "signature_data": "Alex",
                "page_number": 1,
                "x_pct": -1.0,
                "y_pct": 10.0,
                "width_pct": 20.0,
                "height_pct": 10.0,
            }
        )
        assert not ser_neg.is_valid()
        assert "x_pct" in ser_neg.errors

        ser_zero_w = ShareLinkAcceptPDFNDASerializer(
            data={
                "signer_name": "Alex",
                "signature_type": "type",
                "signature_data": "Alex",
                "page_number": 1,
                "x_pct": 10.0,
                "y_pct": 10.0,
                "width_pct": 0.0,
                "height_pct": 105.0,
            }
        )
        assert not ser_zero_w.is_valid()
        assert "width_pct" in ser_zero_w.errors
        assert "height_pct" in ser_zero_w.errors
