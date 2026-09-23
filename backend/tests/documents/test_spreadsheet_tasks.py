import datetime
import io
import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import openpyxl
import pytest

from core.models import Organization, User
from documents.models import Document, DocumentVersion
from documents.spreadsheet_utils import (
    MAX_PREVIEW_COLS,
    MAX_PREVIEW_ROWS,
    parse_csv_to_preview_data,
    parse_xlsx_to_preview_data,
)
from documents.tasks import generate_spreadsheet_preview_task


@pytest.fixture
def user(db):
    org = Organization.objects.create(name="Spreadsheet Org")
    return User.objects.create_user(
        username="sheetuser",
        email="sheet@example.com",
        password="password123",
        organization=org,
    )


class TestSpreadsheetUtils:
    def test_parse_xlsx_with_8_columns_preserves_single_grid(self):
        """Validates that 8 columns (seq, first name, last name, etc.) are kept on 1 sheet without column chopping."""
        with tempfile.TemporaryDirectory() as td:
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Employees"
            headers = ["seq", "first name", "last name", "gender", "Country", "age", "data", "id"]
            ws.append(headers)
            ws.append([1, "Alice", "Smith", "F", "USA", 30, "Active", 1001])
            ws.append([2, "Bob", "Jones", "M", "UK", 42, "Pending", 1002])

            xlsx_path = os.path.join(td, "employees.xlsx")
            wb.save(xlsx_path)

            data = parse_xlsx_to_preview_data(xlsx_path, "employees.xlsx")

            assert data["version"] == 1
            assert len(data["sheets"]) == 1

            sheet = data["sheets"][0]
            assert sheet["name"] == "Employees"
            assert sheet["row_count"] == 3
            assert sheet["col_count"] == 8
            assert sheet["is_truncated"] is False
            assert len(sheet["columns"]) == 8

            # Check column headers
            col_letters = [c["name"] for c in sheet["columns"]]
            assert col_letters == ["A", "B", "C", "D", "E", "F", "G", "H"]

            # Check header values
            assert sheet["cells"]["0:0"]["v"] == "seq"
            assert sheet["cells"]["0:1"]["v"] == "first name"
            assert sheet["cells"]["0:6"]["v"] == "data"
            assert sheet["cells"]["0:7"]["v"] == "id"

            # Check row 1 data
            assert sheet["cells"]["1:1"]["v"] == "Alice"
            assert sheet["cells"]["1:7"]["v"] == "1001"

    def test_parse_xlsx_multi_sheet_and_hidden_sheets(self):
        """Validates that multi-sheet workbooks preserve visible tabs and omit hidden sheets."""
        with tempfile.TemporaryDirectory() as td:
            wb = openpyxl.Workbook()
            ws1 = wb.active
            ws1.title = "Q1"
            ws1.append(["Revenue", "Expenses"])
            ws1.append([100000, 75000])

            ws2 = wb.create_sheet(title="Q2")
            ws2.append(["Revenue", "Expenses"])
            ws2.append([120000, 80000])

            ws_hidden = wb.create_sheet(title="InternalFormulas")
            ws_hidden.sheet_state = "hidden"
            ws_hidden.append(["Raw", "Config"])

            xlsx_path = os.path.join(td, "multi.xlsx")
            wb.save(xlsx_path)

            data = parse_xlsx_to_preview_data(xlsx_path, "multi.xlsx")

            assert len(data["sheets"]) == 2
            sheet_names = [s["name"] for s in data["sheets"]]
            assert sheet_names == ["Q1", "Q2"]
            assert "InternalFormulas" not in sheet_names

    def test_parse_xlsx_truncation_limits(self):
        """Validates that sheets exceeding 2,000 rows are capped with is_truncated=True."""
        with tempfile.TemporaryDirectory() as td:
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "LargeData"
            # Fill 2005 rows
            for i in range(1, 2006):
                ws.cell(row=i, column=1, value=f"Val_{i}")

            xlsx_path = os.path.join(td, "large.xlsx")
            wb.save(xlsx_path)

            data = parse_xlsx_to_preview_data(xlsx_path, "large.xlsx")
            sheet = data["sheets"][0]
            assert sheet["row_count"] == MAX_PREVIEW_ROWS
            assert sheet["is_truncated"] is True
            assert sheet["cells"]["0:0"]["v"] == "Val_1"
            assert f"{MAX_PREVIEW_ROWS - 1}:0" in sheet["cells"]
            assert f"{MAX_PREVIEW_ROWS}:0" not in sheet["cells"]

    def test_parse_xlsx_cell_formatting_and_dates(self):
        """Validates cell type mappings, date formatting, and bold styles."""
        with tempfile.TemporaryDirectory() as td:
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Formatted"

            # Bold cell
            c_bold = ws.cell(row=1, column=1, value="BoldHeader")
            c_bold.font = openpyxl.styles.Font(bold=True)

            # Date cell
            ws.cell(row=2, column=1, value=datetime.date(2026, 9, 22))

            # Merged cell
            ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=3)
            ws.cell(row=3, column=1, value="MergedHeader")

            # Percentage cell
            c_pct = ws.cell(row=4, column=1, value=0.25)
            c_pct.number_format = "0.00%"

            # Currency cell
            c_cur = ws.cell(row=5, column=1, value=1234.5)
            c_cur.number_format = "$#,##0.00"

            # Thousands separator cell
            c_th = ws.cell(row=6, column=1, value=1000000)
            c_th.number_format = "#,##0"

            xlsx_path = os.path.join(td, "formatted.xlsx")
            wb.save(xlsx_path)

            data = parse_xlsx_to_preview_data(xlsx_path, "formatted.xlsx")
            sheet = data["sheets"][0]

            assert sheet["cells"]["0:0"]["v"] == "BoldHeader"
            assert sheet["cells"]["0:0"]["s"]["b"] is True

            assert sheet["cells"]["1:0"]["v"] == "2026-09-22"
            assert sheet["cells"]["1:0"]["t"] == "d"

            assert len(sheet["merges"]) == 1
            assert sheet["merges"][0] == {"start_row": 2, "start_col": 0, "end_row": 2, "end_col": 2}

            assert sheet["cells"]["3:0"]["v"] == "25.00%"
            assert sheet["cells"]["3:0"]["t"] == "n"

            assert sheet["cells"]["4:0"]["v"] == "$1,234.50"
            assert sheet["cells"]["4:0"]["t"] == "n"

            assert sheet["cells"]["5:0"]["v"] == "1,000,000"
            assert sheet["cells"]["5:0"]["t"] == "n"

    def test_parse_xlsx_zip_bomb_protection(self):
        """Validates that uncompressed archive size exceeding safety limits raises ValueError."""
        with tempfile.TemporaryDirectory() as td:
            invalid_path = os.path.join(td, "corrupt.xlsx")
            with open(invalid_path, "wb") as f:
                f.write(b"not a zip file content")

            with pytest.raises(ValueError, match="not a valid zip archive"):
                parse_xlsx_to_preview_data(invalid_path, "corrupt.xlsx")

            # Mock ZipFile to simulate oversized uncompressed contents
            mock_info = MagicMock()
            mock_info.file_size = 200 * 1024 * 1024  # 200 MB
            with patch("zipfile.is_zipfile", return_value=True), \
                 patch("zipfile.ZipFile") as mock_zf:
                mock_zf_inst = MagicMock()
                mock_zf_inst.__enter__.return_value = mock_zf_inst
                mock_zf_inst.infolist.return_value = [mock_info]
                mock_zf.return_value = mock_zf_inst

                with pytest.raises(ValueError, match="exceeds safety limit"):
                    parse_xlsx_to_preview_data("dummy.xlsx", "dummy.xlsx")

    def test_parse_csv_delimiter_and_encoding_auto_detection(self):
        """Validates comma, semicolon, tab delimiters and UTF-8-BOM parsing."""
        # Comma with UTF-8 BOM
        csv_comma = "\ufeffName,Role,Dept\nAlice,Engineer,Core\n".encode("utf-8")
        data1 = parse_csv_to_preview_data(csv_comma, "test.csv")
        sheet1 = data1["sheets"][0]
        assert sheet1["col_count"] == 3
        assert sheet1["cells"]["0:0"]["v"] == "Name"
        assert sheet1["cells"]["1:0"]["v"] == "Alice"

        # Semicolon delimited
        csv_semi = "City;Country;Population\nTokyo;Japan;14000000\nParis;France;2100000\n"
        data2 = parse_csv_to_preview_data(csv_semi.encode("utf-8"), "test.csv")
        sheet2 = data2["sheets"][0]
        assert sheet2["col_count"] == 3
        assert sheet2["cells"]["0:0"]["v"] == "City"
        assert sheet2["cells"]["1:0"]["v"] == "Tokyo"
        assert sheet2["cells"]["1:2"]["v"] == "14000000"

    def test_parse_csv_column_truncation(self):
        """Validates that CSVs exceeding MAX_PREVIEW_COLS (100) are truncated and flagged."""
        header = ",".join([f"Col_{i}" for i in range(105)])
        row = ",".join([str(i) for i in range(105)])
        csv_bytes = f"{header}\n{row}\n".encode("utf-8")

        data = parse_csv_to_preview_data(csv_bytes, "wide.csv")
        sheet = data["sheets"][0]
        assert sheet["col_count"] == MAX_PREVIEW_COLS
        assert sheet["is_truncated"] is True
        assert "0:99" in sheet["cells"]
        assert "0:100" not in sheet["cells"]


@pytest.mark.django_db
class TestGenerateSpreadsheetPreviewTask:
    @patch("documents.tasks.requests.put")
    @patch("documents.tasks.requests.get")
    @patch("documents.tasks.fileserver_client")
    def test_generate_spreadsheet_preview_task_success(self, mock_client, mock_get, mock_put, user):
        """Validates task execution, fileserver download/upload, and metadata updates."""
        # Create a sample XLSX in memory
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "SheetA"
        ws.append(["ID", "Name"])
        ws.append([1, "ItemA"])
        buf = io.BytesIO()
        wb.save(buf)
        xlsx_bytes = buf.getvalue()

        # Mock download
        mock_client.generate_download_url.return_value = "http://fileserver/download/doc.xlsx"
        mock_get_resp = MagicMock()
        mock_get_resp.iter_content.return_value = [xlsx_bytes]
        mock_get_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_get_resp

        # Mock upload
        mock_client.generate_upload_url.return_value = "http://fileserver/upload/doc_spreadsheet.json"
        mock_put_resp = MagicMock()
        mock_put_resp.raise_for_status.return_value = None
        mock_put.return_value = mock_put_resp

        doc = Document.objects.create(
            name="data.xlsx",
            type="spreadsheet",
            created_by=user,
            organization=user.organization,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="documents/123/data.xlsx",
            type="spreadsheet",
            is_primary=True,
            render_status=DocumentVersion.RENDER_QUEUED,
        )

        generate_spreadsheet_preview_task(ver.id)

        ver.refresh_from_db()
        doc.refresh_from_db()

        assert ver.render_status == DocumentVersion.RENDER_READY
        assert ver.render_error == ""
        assert ver.storage_key == "documents/123/data_spreadsheet.json"
        assert ver.num_pages == 1
        assert ver.has_pages is False
        assert doc.num_pages == 1
        assert doc.type == "spreadsheet"

        # Verify requests timeouts
        assert mock_get.call_args[1].get("timeout") == (5, 60)
        assert mock_put.call_args[1].get("timeout") == (5, 60)

        # Verify uploaded JSON payload
        mock_put.assert_called_once()
        uploaded_bytes = mock_put.call_args[1]["data"]
        uploaded_json = json.loads(uploaded_bytes.decode("utf-8"))
        assert uploaded_json["version"] == 1
        assert uploaded_json["filename"] == "data.xlsx"
        assert len(uploaded_json["sheets"]) == 1
        assert uploaded_json["sheets"][0]["cells"]["0:0"]["v"] == "ID"
        assert uploaded_json["sheets"][0]["cells"]["1:1"]["v"] == "ItemA"

    @patch("documents.tasks.requests.put")
    @patch("documents.tasks.requests.get")
    @patch("documents.tasks.fileserver_client")
    def test_generate_spreadsheet_preview_task_csv_by_content_type(self, mock_client, mock_get, mock_put, user):
        """Validates that extensionless file with content_type='text/csv' is routed to CSV parser."""
        csv_bytes = b"ColA,ColB\n123,456\n"

        mock_client.generate_download_url.return_value = "http://fileserver/download/data_raw"
        mock_get_resp = MagicMock()
        mock_get_resp.iter_content.return_value = [csv_bytes]
        mock_get_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_get_resp

        mock_client.generate_upload_url.return_value = "http://fileserver/upload/data_raw_spreadsheet.json"
        mock_put_resp = MagicMock()
        mock_put_resp.raise_for_status.return_value = None
        mock_put.return_value = mock_put_resp

        doc = Document.objects.create(
            name="export_data",
            type="spreadsheet",
            created_by=user,
            organization=user.organization,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="documents/123/export_data",
            content_type="text/csv",
            type="spreadsheet",
            is_primary=True,
            render_status=DocumentVersion.RENDER_QUEUED,
        )

        generate_spreadsheet_preview_task(ver.id)

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_READY
        assert ver.render_error == ""

        mock_put.assert_called_once()
        uploaded_bytes = mock_put.call_args[1]["data"]
        uploaded_json = json.loads(uploaded_bytes.decode("utf-8"))
        assert len(uploaded_json["sheets"]) == 1
        assert uploaded_json["sheets"][0]["cells"]["0:0"]["v"] == "ColA"
        assert uploaded_json["sheets"][0]["cells"]["1:0"]["v"] == "123"


@pytest.mark.django_db
class TestSpreadsheetRendererPreviewReset:
    @patch("core.services.get_dynamic_setting")
    @patch("documents.models.get_dynamic_setting")
    def test_spreadsheet_size_limit_re_evaluation(self, mock_models_setting, mock_core_setting, user):
        """Validates dynamic is_download_only check and _on_reset_to_previewable for spreadsheets."""
        mock_models_setting.return_value = 10
        mock_core_setting.return_value = 10

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="financials.xlsx",
            type="spreadsheet",
            file_size=20 * 1024 * 1024,  # 20 MB (over 10 MB limit)
            download_only=True,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="documents/123/financials.xlsx",
            file_size=20 * 1024 * 1024,
            type="spreadsheet",
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_APPLICABLE,
        )

        from documents.renderers.spreadsheet import SpreadsheetRenderer
        renderer = SpreadsheetRenderer()

        # Above limit
        assert doc.is_download_only is True
        assert renderer.is_dynamically_previewable(ver) is False
        assert renderer.get_preview_mode(ver) == "download_only"

        # Increase limit to 50 MB
        mock_models_setting.return_value = 50
        mock_core_setting.return_value = 50

        assert doc.is_download_only is False
        assert renderer.is_dynamically_previewable(ver) is True
        assert renderer.get_preview_mode(ver) == "spreadsheet"

        # Test reset hook restores doc.download_only to False
        renderer._on_reset_to_previewable(ver)
        doc.refresh_from_db()
        assert doc.download_only is False


@pytest.mark.django_db
class TestXlsSpreadsheetSupport:
    def test_xls_renderer_routing(self):
        """Validates that .xls files and application/vnd.ms-excel are claimed by SpreadsheetRenderer."""
        from documents.renderers import get_renderer_for_file
        from documents.renderers.spreadsheet import SpreadsheetRenderer

        renderer = get_renderer_for_file("application/vnd.ms-excel", "financial_report.xls")
        assert isinstance(renderer, SpreadsheetRenderer)

    @patch("documents.tasks.fileserver_client")
    @patch("documents.tasks.requests")
    @patch("subprocess.run")
    def test_xls_preview_task_converts_via_libreoffice_and_generates_json(
        self, mock_subprocess, mock_requests, mock_fileserver, user
    ):
        """Validates that .xls files are converted to .xlsx via LibreOffice and saved as spreadsheet JSON."""
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="wide_table.xls",
            type="spreadsheet",
            file_size=1024,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="documents/123/wide_table.xls",
            storage_key="documents/123/wide_table.xls",
            file_size=1024,
            type="spreadsheet",
            content_type="application/vnd.ms-excel",
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
        )

        mock_fileserver.generate_download_url.return_value = "https://files.example.com/download/wide_table.xls"
        mock_fileserver.generate_upload_url.return_value = "https://files.example.com/upload/wide_table_spreadsheet.json"

        # Mock download response
        mock_get_resp = MagicMock()
        mock_get_resp.iter_content.return_value = [b"mock xls content"]
        mock_requests.get.return_value = mock_get_resp

        # Mock upload response
        mock_put_resp = MagicMock()
        mock_put_resp.raise_for_status.return_value = None
        mock_requests.put.return_value = mock_put_resp

        # Side effect for subprocess.run: create a valid dummy .xlsx workbook with 8 columns
        def fake_subprocess_run(cmd, **kwargs):
            outdir = cmd[cmd.index("--outdir") + 1]
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "WideSheet"
            ws.append(["col1", "col2", "col3", "col4", "col5", "col6", "col7", "col8"])
            ws.append([1, 2, 3, 4, 5, 6, 7, 8])
            wb.save(os.path.join(outdir, "wide_table.xlsx"))
            return MagicMock(returncode=0)

        mock_subprocess.side_effect = fake_subprocess_run

        generate_spreadsheet_preview_task(ver.id)

        # Confirm libreoffice conversion was called with xlsx target
        mock_subprocess.assert_called_once()
        cmd = mock_subprocess.call_args[0][0]
        assert "libreoffice" in cmd
        assert "--convert-to" in cmd
        assert "xlsx" in cmd

        # Confirm JSON was uploaded to storage
        mock_requests.put.assert_called_once()
        uploaded_json_bytes = mock_requests.put.call_args[1]["data"]
        uploaded_data = json.loads(uploaded_json_bytes.decode("utf-8"))

        assert uploaded_data["version"] == 1
        assert len(uploaded_data["sheets"]) == 1
        sheet = uploaded_data["sheets"][0]
        assert sheet["name"] == "WideSheet"
        assert sheet["col_count"] == 8
        assert len(sheet["columns"]) == 8

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_READY
        assert ver.type == "spreadsheet"
        assert ver.storage_key == "documents/123/wide_table_spreadsheet.json"
        assert ver.num_pages == 1

    @patch("documents.tasks.fileserver_client")
    @patch("documents.tasks.requests")
    @patch("subprocess.run")
    def test_xls_preview_task_records_stderr_on_conversion_failure(
        self, mock_subprocess, mock_requests, mock_fileserver, user
    ):
        """Validates that LibreOffice stderr is captured and saved in render_error on failure."""
        import subprocess

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="corrupted.xls",
            type="spreadsheet",
            file_size=1024,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="documents/123/corrupted.xls",
            storage_key="documents/123/corrupted.xls",
            file_size=1024,
            type="spreadsheet",
            content_type="application/vnd.ms-excel",
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
        )

        mock_fileserver.generate_download_url.return_value = "https://files.example.com/download/corrupted.xls"
        mock_get_resp = MagicMock()
        mock_get_resp.iter_content.return_value = [b"corrupt xls content"]
        mock_requests.get.return_value = mock_get_resp

        mock_subprocess.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=["libreoffice", "--headless"],
            stderr="Error: source file could not be loaded: unsupported binary format",
        )

        generate_spreadsheet_preview_task(ver.id)

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_FAILED
        assert "unsupported binary format" in ver.render_error

    @patch("documents.tasks.fileserver_client")
    @patch("documents.tasks.requests")
    @patch("documents.spreadsheet_utils.parse_xlsx_to_preview_data")
    @patch("subprocess.run")
    def test_xls_with_xlsx_filename_uses_isolated_conversion_dir_on_no_output(
        self, mock_subprocess, mock_parse_xlsx, mock_requests, mock_fileserver, user
    ):
        """When an .xls file has an .xlsx filename and LibreOffice produces no output,
        it must raise FileNotFoundError rather than passing the raw downloaded file to parse_xlsx_to_preview_data."""
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="actual_xls_named.xlsx",
            type="spreadsheet",
            file_size=1024,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="documents/123/actual_xls_named.xlsx",
            storage_key="documents/123/actual_xls_named.xlsx",
            file_size=1024,
            type="spreadsheet",
            content_type="application/vnd.ms-excel",
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
        )

        mock_fileserver.generate_download_url.return_value = "https://files.example.com/download/actual_xls_named.xlsx"
        mock_get_resp = MagicMock()
        mock_get_resp.iter_content.return_value = [b"raw binary xls content"]
        mock_requests.get.return_value = mock_get_resp

        # LibreOffice exits 0 but produces NO output in outdir
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="")

        generate_spreadsheet_preview_task(ver.id)

        # parse_xlsx_to_preview_data should NOT have been called with the raw file
        mock_parse_xlsx.assert_not_called()

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_FAILED
        assert "LibreOffice failed to convert" in ver.render_error



