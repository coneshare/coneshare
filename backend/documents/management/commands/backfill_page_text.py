"""
Document Page Text Backfill Management Command
==============================================
Extracts line-level layout bounding boxes and text from existing document
versions using Poppler's pdftotext -bbox-layout, saving results into
DocumentPage.metadata['text_content'] without re-rendering images.

Usage:
  python manage.py backfill_page_text --all [--force]
  python manage.py backfill_page_text --document-id ID [--force]
"""

import logging
import requests
from django.core.management.base import BaseCommand
from documents.models import Document, DocumentVersion, DocumentPage
from documents.pdf_utils import extract_text_layout_for_pdf
from documents.fileserver import fileserver_client


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Backfills text layout bboxes for server-rendered document pages without regenerating images."

    def add_arguments(self, parser):
        parser.add_argument(
            "--all",
            action="store_true",
            help="Process all documents in the system.",
        )
        parser.add_argument(
            "--document-id",
            type=str,
            help="Target a specific Document ULID to process.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-extract and overwrite text_content even if already present on DocumentPage.",
        )

    def handle(self, *args, **options):
        document_id = options.get("document_id")
        process_all = options.get("all", False)
        force = options.get("force", False)

        if not document_id and not process_all:
            self.print_help("manage.py", "backfill_page_text")
            self.stderr.write(
                self.style.ERROR(
                    "\nError: Please specify either --all to process all documents or --document-id <ID> to target a specific document."
                )
            )
            return

        if document_id and process_all:
            self.stderr.write(
                self.style.ERROR("Error: Cannot specify both --all and --document-id simultaneously.")
            )
            return

        versions_qs = (
            DocumentVersion.objects.filter(
                has_pages=True,
                storage_key__iendswith=".pdf",
            )
            .exclude(render_status__in=[DocumentVersion.RENDER_FAILED, DocumentVersion.RENDER_PROCESSING])
            .exclude(type="image")
            .exclude(document__type="image")
            .select_related("document")
            .prefetch_related("pages")
        )

        if document_id:
            versions_qs = versions_qs.filter(document_id=document_id)

        total_versions = versions_qs.count()
        if total_versions == 0:
            self.stdout.write(
                self.style.WARNING("No PDF document versions found matching the criteria.")
            )
            return

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"Starting text layout extraction for {total_versions} document version(s)..."
            )
        )

        processed_count = 0
        skipped_count = 0
        error_count = 0

        for version in versions_qs:
            pages = list(version.pages.all())
            if not pages:
                skipped_count += 1
                continue

            # Skip non-PDF assets (e.g. transcoded images)
            if not version.storage_key or not version.storage_key.lower().endswith(".pdf"):
                self.stdout.write(
                    f"  {self.style.HTTP_INFO('↷ [SKIP]')} Document {version.document_id} ({version.document.name}) v{version.version_number}: not a PDF asset."
                )
                skipped_count += 1
                continue

            # Skip if all pages already have text_content and not force
            if not force and all(isinstance(p.metadata, dict) and "text_content" in p.metadata for p in pages):
                self.stdout.write(
                    f"  {self.style.HTTP_INFO('↷ [SKIP]')} Document {version.document_id} ({version.document.name}) v{version.version_number} already has text layout."
                )
                skipped_count += 1
                continue

            if not version.storage_key:
                self.stdout.write(
                    f"  {self.style.WARNING('⚠ [WARN]')} Document {version.document_id} has no storage_key."
                )
                error_count += 1
                continue

            try:
                # 1. Download PDF bytes
                download_url = fileserver_client.generate_download_url(version.storage_key)
                resp = requests.get(download_url, timeout=60)
                resp.raise_for_status()
                pdf_bytes = resp.content

                # 2. Extract text layout
                page_text_by_num = extract_text_layout_for_pdf(pdf_bytes)
                if not page_text_by_num:
                    self.stderr.write(
                        f"  {self.style.WARNING('⚠ [WARN]')} Document {version.document_id}: No text layout extracted from PDF. Skipping page update."
                    )
                    error_count += 1
                    continue

                # 3. Update each page
                updated_pages = 0
                for page in pages:
                    if page.page_number in page_text_by_num:
                        if force or not page.text_content.get("lines"):
                            page.text_content = page_text_by_num[page.page_number]
                            page.save(update_fields=["metadata", "updated_at"])
                            updated_pages += 1
                    elif not page.text_content or not page.text_content.get("lines"):
                        # If page has no existing text and extraction had no lines for it, set empty
                        page.text_content = {"lines": []}
                        page.save(update_fields=["metadata", "updated_at"])
                        updated_pages += 1

                self.stdout.write(
                    f"  {self.style.SUCCESS('✓ [OK]')} Document {version.document_id} ({version.document.name}) v{version.version_number}: updated {updated_pages} page(s)."
                )
                processed_count += 1

            except Exception as e:
                self.stderr.write(
                    f"  {self.style.ERROR('✗ [ERR]')} Document {version.document_id} failed: {e}"
                )
                error_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nFinished text extraction. Processed: {processed_count}, Skipped: {skipped_count}, Errors: {error_count}."
            )
        )
