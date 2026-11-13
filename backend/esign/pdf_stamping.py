from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import importlib
import io
import logging
import math
import os
import subprocess
import tempfile
import time
from typing import Any, Iterable

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

MAX_PDF_PAGES = 500
MAX_SIGNATURE_DATA_BYTES = 2 * 1024 * 1024  # 2 MB
DEFAULT_TYPED_FONT_PATHS = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
)


@dataclass(frozen=True)
class FieldStamp:
    page_number: int
    x: float
    y: float
    width: float
    height: float
    field_type: str = 'signature'
    text_value: str = ''
    image_bytes: bytes | None = None
    signer_label: str = ''


def compute_sha256(data: bytes) -> str:
    """Computes lowercase hexadecimal SHA-256 digest for canonical byte verification."""
    return hashlib.sha256(data).hexdigest()


def validate_coordinates(page_number: int, x: float, y: float, width: float, height: float, page_count: int | None = None) -> None:
    """Rejects non-finite, negative, zero-area, or out-of-bounds percentage coordinates."""
    if not isinstance(page_number, int) or isinstance(page_number, bool) or not (1 <= page_number <= MAX_PDF_PAGES):
        raise ValidationError({'page_number': 'Page number must be an integer between 1 and 500.'})
    if page_count is not None and page_number > page_count:
        raise ValidationError({'page_number': f'Page number {page_number} exceeds document page count ({page_count}).'})

    coords = (x, y, width, height)
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(float(v)) for v in coords):
        raise ValidationError({'coordinates': 'Coordinates must be finite numbers.'})

    fx, fy, fw, fh = float(x), float(y), float(width), float(height)
    if fx < 0.0 or fy < 0.0 or fw <= 0.0 or fh <= 0.0 or (fx + fw) > 100.0 + 1e-6 or (fy + fh) > 100.0 + 1e-6:
        raise ValidationError({'coordinates': 'Field coordinates must stay within [0, 100]% bounds.'})


def validate_pdf_bytes(pdf_bytes: bytes) -> int:
    """Parses PDF bytes with pypdf and returns page count if valid (1..500)."""
    if not pdf_bytes:
        raise ValidationError({'detail': 'PDF source is empty.'})
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)
    except Exception:
        raise ValidationError({'detail': 'A valid PDF source is required.'}) from None

    if not (1 <= page_count <= MAX_PDF_PAGES):
        raise ValidationError({'detail': f'PDF page count must be between 1 and {MAX_PDF_PAGES}.'})
    return page_count


def validate_signature_data_url(signature_data: str) -> bytes:
    """
    Validates a base64 PNG data URL, verifies image integrity via Pillow,
    and returns canonical decoded PNG bytes.
    """
    if not signature_data or not isinstance(signature_data, str):
        raise ValidationError({'signature_data': 'Signature image data is required.'})

    raw = signature_data.strip()
    if ',' not in raw or not raw.startswith('data:image/png;base64,'):
        raise ValidationError({'signature_data': 'Signature image must be a base64 PNG data URL.'})

    b64_part = raw.split(',', 1)[1].strip()
    if not b64_part:
        raise ValidationError({'signature_data': 'Signature image data cannot be empty.'})

    try:
        decoded = base64.b64decode(b64_part, validate=True)
    except Exception:
        raise ValidationError({'signature_data': 'Invalid base64 signature payload.'}) from None

    if not decoded or len(decoded) > MAX_SIGNATURE_DATA_BYTES:
        raise ValidationError({'signature_data': 'Signature PNG exceeds allowed size limit (2 MB).'})

    img: Image.Image | None = None
    verified_img: Image.Image | None = None
    try:
        img = Image.open(io.BytesIO(decoded))
        img.verify()
        verified_img = Image.open(io.BytesIO(decoded))
        if verified_img.format != 'PNG':
            raise ValidationError({'signature_data': 'Signature payload must be a valid PNG image.'})
    except ValidationError:
        raise
    except Exception:
        raise ValidationError({'signature_data': 'Unreadable signature PNG payload.'}) from None
    finally:
        if verified_img is not None:
            verified_img.close()
        if img is not None:
            img.close()

    return decoded


def render_typed_signature_png(name: str) -> bytes:
    """Renders a typed signer name into a crisp transparent PNG signature image."""
    clean_name = (name or '').strip()[:120]
    if not clean_name:
        raise ValidationError({'signer_name': 'Signer name is required for typed signature.'})

    width, height = 600, 160
    img = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    try:
        draw = ImageDraw.Draw(img)
        font: Any = None
        for font_path in DEFAULT_TYPED_FONT_PATHS:
            if os.path.exists(font_path):
                try:
                    font = ImageFont.truetype(font_path, 52)
                    break
                except OSError:
                    continue
        if font is None:
            font = ImageFont.load_default()

        draw.text((24, 48), clean_name, fill=(15, 23, 42, 255), font=font)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return buf.getvalue()
    finally:
        img.close()


def _create_page_overlay(page_width: float, page_height: float, stamps: Iterable[FieldStamp]) -> io.BytesIO:
    """Builds a single-page transparent ReportLab PDF overlay positioned over the target PDF page."""
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(page_width, page_height))

    for stamp in stamps:
        box_w = max(4.0, (float(stamp.width) / 100.0) * page_width)
        box_h = max(4.0, (float(stamp.height) / 100.0) * page_height)
        pdf_x = (float(stamp.x) / 100.0) * page_width
        pdf_y = page_height - ((float(stamp.y) / 100.0) * page_height) - box_h
        pdf_y = max(0.0, min(pdf_y, page_height - box_h))

        if stamp.field_type in ('signature', 'initials'):
            if stamp.image_bytes:
                img_reader = ImageReader(io.BytesIO(stamp.image_bytes))
                img_h = max(box_h - (10.0 if stamp.signer_label else 0.0), box_h * 0.65)
                c.drawImage(
                    img_reader,
                    pdf_x,
                    pdf_y + (box_h - img_h),
                    width=box_w,
                    height=img_h,
                    preserveAspectRatio=True,
                    mask='auto',
                )
            elif stamp.text_value:
                c.setFillColor(colors.HexColor('#0f172a'))
                c.setFont('Times-BoldItalic', max(10.0, min(20.0, box_h * 0.45)))
                c.drawString(pdf_x + 2.0, pdf_y + box_h * 0.35, stamp.text_value[:80])

            if stamp.signer_label:
                c.setFillColor(colors.HexColor('#475569'))
                c.setFont('Helvetica', 6.5)
                c.drawString(pdf_x, max(2.0, pdf_y), stamp.signer_label[:90])
        elif stamp.field_type == 'checkbox':
            c.setStrokeColor(colors.HexColor('#0f172a'))
            c.setLineWidth(1.0)
            size = min(box_w, box_h, 16.0)
            c.rect(pdf_x, pdf_y + (box_h - size) / 2.0, size, size)
            if str(stamp.text_value).lower() in ('true', '1', 'yes', 'checked', 'on'):
                c.setFont('Helvetica-Bold', max(9.0, size * 0.85))
                c.drawString(pdf_x + 2.0, pdf_y + (box_h - size) / 2.0 + 2.0, 'X')
        else:
            c.setFillColor(colors.HexColor('#0f172a'))
            c.setFont('Helvetica', max(8.0, min(12.0, box_h * 0.55)))
            c.drawString(pdf_x + 2.0, pdf_y + box_h * 0.25, (stamp.text_value or '')[:120])

    c.save()
    buf.seek(0)
    return buf


def build_completion_certificate_pdf(
    metadata: dict[str, Any],
    signer_rows: list[dict[str, str]],
    audit_events: list[dict[str, str]],
) -> bytes:
    """Constructs the final Audit Trail & Integrity Certificate page via ReportLab."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=36, bottomMargin=36, leftMargin=40, rightMargin=40)
    styles = getSampleStyleSheet()
    elements: list[Any] = []

    elements.append(Paragraph("CONESHARE AUDIT CERTIFICATE", styles['Title']))
    elements.append(Paragraph("Certificate of Completion (Electronic Signature)", styles['Heading3']))
    elements.append(Spacer(1, 10))

    summary_data = [
        ["Document Name", str(metadata.get('document_name', ''))[:90]],
        ["Envelope / Acceptance ID", str(metadata.get('envelope_id', ''))],
        ["Status", str(metadata.get('status', 'EXECUTED & SEALED'))],
        ["Completed Timestamp (UTC)", str(metadata.get('completed_at', ''))],
        ["Original Source SHA-256", str(metadata.get('original_sha256', ''))],
        ["Intended Seal Method", str(metadata.get('seal_method', 'visual_hash'))],
    ]
    summary_table = Table(summary_data, colWidths=[170, 355])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#0f172a')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 14))

    if signer_rows:
        elements.append(Paragraph("SIGNER DETAILS", styles['Heading4']))
        table_rows = [["Name / Role", "Email", "Auth / IP", "Signed At (UTC)"]]
        for row in signer_rows:
            table_rows.append([
                row.get('name', '')[:45],
                row.get('email', '')[:45],
                row.get('auth', '')[:40],
                row.get('signed_at', '')[:32],
            ])
        signers_table = Table(table_rows, colWidths=[135, 145, 130, 115])
        signers_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(signers_table)
        elements.append(Spacer(1, 14))

    if audit_events:
        elements.append(Paragraph("CHRONOLOGICAL AUDIT LOG", styles['Heading4']))
        log_rows = [["Timestamp (UTC)", "Event", "Actor / Details"]]
        for evt in audit_events[:50]:
            log_rows.append([
                str(evt.get('timestamp', ''))[:28],
                str(evt.get('event_type', ''))[:24],
                str(evt.get('summary', ''))[:75],
            ])
        audit_table = Table(log_rows, colWidths=[135, 110, 280])
        audit_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(audit_table)

    doc.build(elements)
    return buf.getvalue()


def _apply_optional_pades_seal(pdf_bytes: bytes) -> tuple[bytes, str]:
    """
    Applies a cryptographic PAdES X.509 PDF signature via pyHanko when both
    pyHanko and signing certificate paths (ESIGN_X509_CERT_PATH / KEY_PATH)
    are available. Falls back cleanly to 'visual_hash' otherwise.
    """
    cert_path = os.environ.get('ESIGN_X509_CERT_PATH', '').strip()
    key_path = os.environ.get('ESIGN_X509_KEY_PATH', '').strip()
    if not (cert_path and key_path and os.path.exists(cert_path) and os.path.exists(key_path)):
        return pdf_bytes, 'visual_hash'

    try:
        signers_mod = importlib.import_module('pyhanko.sign.signers')
        inc_mod = importlib.import_module('pyhanko.pdf_utils.incremental_writer')
    except ImportError:
        logger.info("pyhanko not installed; retaining visual_hash PDF seal.")
        return pdf_bytes, 'visual_hash'

    passphrase_raw = os.environ.get('ESIGN_X509_KEY_PASSPHRASE')
    passphrase = passphrase_raw.encode('utf-8') if passphrase_raw else None
    signer = signers_mod.SimpleSigner.load(key_path, cert_path, key_passphrase=passphrase)
    writer = inc_mod.IncrementalPdfFileWriter(io.BytesIO(pdf_bytes))
    out = signers_mod.sign_pdf(
        writer,
        signers_mod.PdfSignatureMetadata(field_name='ConeshareSeal'),
        signer=signer,
    )
    return out.getvalue(), 'pades_x509'


def stamp_fields_and_seal_pdf(
    original_pdf_bytes: bytes,
    stamps: list[FieldStamp],
    certificate_metadata: dict[str, Any],
    signer_rows: list[dict[str, str]],
    audit_events: list[dict[str, str]],
    seal_method: str = 'visual_hash',
) -> tuple[bytes, str, str, str]:
    """
    Vector-merges visual signature/text stamps onto the original PDF pages,
    appends the Audit Certificate page, applies optional PAdES X.509 sealing,
    and returns (sealed_pdf_bytes, original_sha256, sealed_sha256, actual_seal_method).
    """
    page_count = validate_pdf_bytes(original_pdf_bytes)
    original_sha256 = compute_sha256(original_pdf_bytes)

    stamps_by_page: dict[int, list[FieldStamp]] = {}
    for stamp in stamps:
        validate_coordinates(
            stamp.page_number,
            stamp.x,
            stamp.y,
            stamp.width,
            stamp.height,
            page_count=page_count,
        )
        stamps_by_page.setdefault(stamp.page_number, []).append(stamp)

    reader = PdfReader(io.BytesIO(original_pdf_bytes))
    writer = PdfWriter()

    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        page_stamps = stamps_by_page.get(page_num)
        if page_stamps:
            page_w = float(page.mediabox.width)
            page_h = float(page.mediabox.height)
            overlay_stream = _create_page_overlay(page_w, page_h, page_stamps)
            overlay_reader = PdfReader(overlay_stream)
            page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)

    cert_meta = {**certificate_metadata, 'original_sha256': original_sha256}
    cert_pdf_bytes = build_completion_certificate_pdf(cert_meta, signer_rows, audit_events)
    cert_reader = PdfReader(io.BytesIO(cert_pdf_bytes))
    for cert_page in cert_reader.pages:
        writer.add_page(cert_page)

    merged_buf = io.BytesIO()
    writer.write(merged_buf)
    merged_bytes = merged_buf.getvalue()

    actual_seal_method = 'visual_hash'
    final_bytes = merged_bytes
    if seal_method == 'pades_x509':
        final_bytes, actual_seal_method = _apply_optional_pades_seal(merged_bytes)

    sealed_sha256 = compute_sha256(final_bytes)
    return final_bytes, original_sha256, sealed_sha256, actual_seal_method


def verify_pdf_seal(pdf_bytes: bytes, timeout: int = 15) -> dict[str, Any]:
    """
    Runs Poppler `pdfsig -nocert` on PDF bytes in a bounded subprocess to check
    whether cryptographic PDF signatures are embedded.
    """
    if not pdf_bytes:
        return {'has_cryptographic_signature': False, 'raw_output': ''}

    with tempfile.NamedTemporaryFile(suffix='.pdf') as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            try:
                proc = subprocess.Popen(['pdfsig', '-nocert', tmp.name], stdout=out, stderr=err)
            except FileNotFoundError:
                return {'has_cryptographic_signature': False, 'raw_output': 'pdfsig unavailable'}

            deadline = time.monotonic() + timeout
            try:
                while proc.poll() is None:
                    if time.monotonic() > deadline:
                        return {'has_cryptographic_signature': False, 'raw_output': 'pdfsig timeout'}
                    time.sleep(0.02)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()

            out.seek(0)
            output_text = out.read(65536).decode('utf-8', errors='replace')
            has_sig = (
                proc.returncode == 0
                and 'Signature #' in output_text
                and 'Signature is Valid' in output_text
            )
            return {'has_cryptographic_signature': has_sig, 'raw_output': output_text}
