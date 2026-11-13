import base64
from io import BytesIO

import pytest
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from rest_framework.exceptions import ValidationError

from esign.pdf_stamping import (
    FieldStamp,
    compute_sha256,
    render_typed_signature_png,
    stamp_fields_and_seal_pdf,
    validate_coordinates,
    validate_pdf_bytes,
    validate_signature_data_url,
)


def _make_sample_pdf(num_pages: int = 2) -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf)
    for page in range(1, num_pages + 1):
        c.drawString(72, 720, f"Sample Contract Page {page}")
        c.showPage()
    c.save()
    return buf.getvalue()


def _make_tiny_png_data_url() -> str:
    png_bytes = render_typed_signature_png("Alice Signer")
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{b64}"


class TestPdfStampingEngine:
    def test_stamp_fields_and_seal_appends_audit_certificate_page(self):
        original = _make_sample_pdf(num_pages=2)
        sig_png = render_typed_signature_png("Alice Signer")
        stamps = [
            FieldStamp(
                page_number=2,
                x=55.0,
                y=75.0,
                width=30.0,
                height=10.0,
                field_type="signature",
                image_bytes=sig_png,
                signer_label="Alice Signer",
            ),
            FieldStamp(
                page_number=1,
                x=10.0,
                y=10.0,
                width=25.0,
                height=5.0,
                field_type="date",
                text_value="2026-11-14",
            ),
        ]

        sealed, orig_sha, signed_sha, seal_method = stamp_fields_and_seal_pdf(
            original_pdf_bytes=original,
            stamps=stamps,
            certificate_metadata={
                "document_name": "Mutual NDA 2026",
                "envelope_id": "req-12345",
                "completed_at": "2026-11-14T00:00:00+00:00",
            },
            signer_rows=[
                {
                    "name": "Alice Signer (CEO)",
                    "email": "alice@example.com",
                    "auth": "Token / IP 203.0.113.10",
                    "signed_at": "2026-11-14T00:00:00+00:00",
                }
            ],
            audit_events=[
                {
                    "timestamp": "2026-11-14T00:00:00+00:00",
                    "event_type": "Signer Completed",
                    "summary": "alice@example.com (203.0.113.10)",
                }
            ],
        )

        assert orig_sha == compute_sha256(original)
        assert signed_sha == compute_sha256(sealed)
        assert orig_sha != signed_sha
        assert seal_method in {"visual_hash", "pades_pkcs7"}

        reader = PdfReader(BytesIO(sealed))
        assert len(reader.pages) == 3
        cert_text = reader.pages[2].extract_text() or ""
        assert "Certificate of Completion" in cert_text
        assert "Mutual NDA 2026" in cert_text
        assert "alice@example.com" in cert_text
        assert orig_sha[:16] in cert_text

    def test_validate_pdf_bytes_rejects_corrupt_data(self):
        with pytest.raises(ValidationError):
            validate_pdf_bytes(b"not a pdf")
        with pytest.raises(ValidationError):
            validate_pdf_bytes(b"")

    def test_validate_signature_data_url_enforces_png_and_size(self):
        valid_url = _make_tiny_png_data_url()
        raw = validate_signature_data_url(valid_url)
        assert raw.startswith(b"\x89PNG")

        with pytest.raises(ValidationError):
            validate_signature_data_url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")

        oversized = base64.b64encode(b"x" * (2 * 1024 * 1024 + 512)).decode("ascii")
        with pytest.raises(ValidationError):
            validate_signature_data_url(f"data:image/png;base64,{oversized}")

    def test_validate_coordinates_bounds(self):
        validate_coordinates(1, 0.0, 0.0, 20.0, 10.0, page_count=2)

        for bad in [
            (0, 10.0, 10.0, 10.0, 10.0, 2),
            (3, 10.0, 10.0, 10.0, 10.0, 2),
            (1, float("nan"), 10.0, 10.0, 10.0, 2),
            (1, -1.0, 10.0, 10.0, 10.0, 2),
            (1, 90.0, 10.0, 15.0, 10.0, 2),
            (1, 10.0, 95.0, 10.0, 10.0, 2),
            (1, 10.0, 10.0, 0.0, 10.0, 2),
        ]:
            with pytest.raises(ValidationError):
                validate_coordinates(*bad)
