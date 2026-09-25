"""
PDF Processing Utilities
========================
Helper utilities for extracting text layout, coordinates, and bounding boxes
from PDF documents using Poppler command line tools.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from typing import TYPE_CHECKING, Dict

if TYPE_CHECKING:
    from documents.models import PageTextContentDict

logger = logging.getLogger(__name__)

MAX_XML_BYTES = 200 * 1024 * 1024  # 200 MB safety threshold to bound memory usage


def _run_pdftotext(pdf_bytes: bytes, timeout: int = 60, max_bytes: int = MAX_XML_BYTES) -> bytes:
    """
    Executes Poppler pdftotext -bbox-layout safely:
    - Bounded execution time via a wall-clock monotonic deadline.
    - Captures stdout and stderr to temporary files to prevent POSIX pipe deadlocks.
    - Limits stdout file size to max_bytes to prevent unbounded disk/memory consumption.
    """
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()

        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            proc = subprocess.Popen(
                ["pdftotext", "-bbox-layout", tmp.name, "-"],
                stdout=out,
                stderr=err,
            )
            deadline = time.monotonic() + timeout
            try:
                while proc.poll() is None:
                    if os.fstat(out.fileno()).st_size > max_bytes:
                        logger.warning(
                            f"pdftotext layout output exceeded limit of {max_bytes} bytes; terminating."
                        )
                        return b""
                    if time.monotonic() > deadline:
                        logger.warning(f"pdftotext timed out after {timeout} seconds")
                        return b""
                    time.sleep(0.02)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()

            if proc.returncode != 0:
                err.seek(0)
                err_sample = err.read(200)
                logger.warning(
                    f"pdftotext failed with return code {proc.returncode}: {err_sample!r}"
                )
                return b""

            if os.fstat(out.fileno()).st_size > max_bytes:
                logger.warning(
                    f"pdftotext layout output exceeded limit of {max_bytes} bytes; terminating."
                )
                return b""

            out.seek(0)
            return out.read()


def extract_text_layout_for_pdf(pdf_bytes: bytes) -> Dict[int, PageTextContentDict]:
    """
    Extracts line-level bounding box coordinates and text for each page of a PDF
    using Poppler's `pdftotext -bbox-layout`.

    Returns a dict mapping 1-indexed page_num -> {"lines": [...]}.
    Each line contains:
      - text: string of line contents
      - bbox: {"left": %, "top": %, "width": %, "height": %} normalized to page dimensions
      - font_size_pt: approximate font size in points
    """
    pages_text_by_num = {}
    if not pdf_bytes:
        return pages_text_by_num

    try:
        xml_bytes = _run_pdftotext(pdf_bytes)
        if not xml_bytes:
            return pages_text_by_num

        root = ET.fromstring(xml_bytes)
        # Determine namespace once at the root to avoid repeated XPath searches
        ns = "{http://www.w3.org/1999/xhtml}" if root.tag.startswith("{http://www.w3.org/1999/xhtml}") else ""
        pages = root.findall(f".//{ns}page")

        for idx, page in enumerate(pages):
            page_num = idx + 1
            try:
                page_w = float(page.attrib.get('width', 0))
                page_h = float(page.attrib.get('height', 0))
                if page_w <= 0 or page_h <= 0:
                    continue

                lines_data = []
                xml_lines = page.findall(f".//{ns}line")

                for line in xml_lines:
                    # Words are direct children of line elements in pdftotext output
                    xml_words = line.findall(f"{ns}word") or line.findall(f".//{ns}word")

                    words_text = [w.text for w in xml_words if w.text and w.text.strip()]
                    if not words_text:
                        continue
                    line_text = " ".join(words_text)

                    # Bounding box coordinates with min/max normalization
                    raw_x_min = float(line.attrib.get('xMin', 0))
                    raw_x_max = float(line.attrib.get('xMax', 0))
                    raw_y_min = float(line.attrib.get('yMin', 0))
                    raw_y_max = float(line.attrib.get('yMax', 0))

                    x_min = min(raw_x_min, raw_x_max)
                    x_max = max(raw_x_min, raw_x_max)
                    y_min = min(raw_y_min, raw_y_max)
                    y_max = max(raw_y_min, raw_y_max)

                    left = round((x_min / page_w) * 100, 2)
                    top = round((y_min / page_h) * 100, 2)
                    width = round(((x_max - x_min) / page_w) * 100, 2)
                    height = round(((y_max - y_min) / page_h) * 100, 2)
                    font_size_pt = round(y_max - y_min, 1)

                    lines_data.append({
                        "text": line_text,
                        "bbox": {
                            "left": left,
                            "top": top,
                            "width": width,
                            "height": height,
                        },
                        "font_size_pt": font_size_pt,
                    })

                pages_text_by_num[page_num] = {"lines": lines_data}
            except (ValueError, KeyError, ZeroDivisionError) as page_err:
                logger.warning(f"Corrupt coordinates on page {page_num} during text layout extraction: {page_err}")

    except Exception as err:
        logger.warning(f"Failed to extract text layout via pdftotext: {err}")

    return pages_text_by_num
