import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileTypeIcon, getDocumentBadgeStyle } from "../../../components/documents/FileTypeIcon";

describe("FileTypeIcon", () => {
  it("renders folder icon for folder type", () => {
    const { rerender } = render(<FileTypeIcon type="folder" />);
    expect(screen.getByTestId("file-type-icon-folder")).toBeInTheDocument();

    rerender(<FileTypeIcon type="folder" isSynced />);
    expect(screen.getByTestId("file-type-icon-folder-sync")).toBeInTheDocument();
  });

  it("renders pdf icon for pdf type", () => {
    render(<FileTypeIcon type="pdf" />);
    expect(screen.getByTestId("file-type-icon-pdf")).toBeInTheDocument();
  });

  it("renders document icon for document/docx types", () => {
    const { rerender } = render(<FileTypeIcon type="document" />);
    expect(screen.getByTestId("file-type-icon-document")).toBeInTheDocument();

    rerender(<FileTypeIcon type="docx" />);
    expect(screen.getByTestId("file-type-icon-document")).toBeInTheDocument();
  });

  it("renders image icon for image type", () => {
    render(<FileTypeIcon type="image" />);
    expect(screen.getByTestId("file-type-icon-image")).toBeInTheDocument();
  });

  it("renders fallback icon for unknown type", () => {
    render(<FileTypeIcon type="unknown_ext" />);
    expect(screen.getByTestId("file-type-icon-unknown")).toBeInTheDocument();
  });

  it("renders spreadsheet icon for spreadsheet, xlsx, csv, and spreadsheet filenames", () => {
    const { rerender } = render(<FileTypeIcon type="spreadsheet" />);
    expect(screen.getByTestId("file-type-icon-spreadsheet")).toBeInTheDocument();

    rerender(<FileTypeIcon type="xlsx" />);
    expect(screen.getByTestId("file-type-icon-spreadsheet")).toBeInTheDocument();

    rerender(<FileTypeIcon type="csv" />);
    expect(screen.getByTestId("file-type-icon-spreadsheet")).toBeInTheDocument();

    rerender(<FileTypeIcon type="xls" />);
    expect(screen.getByTestId("file-type-icon-spreadsheet")).toBeInTheDocument();

    rerender(<FileTypeIcon type="tsv" />);
    expect(screen.getByTestId("file-type-icon-spreadsheet")).toBeInTheDocument();

    rerender(<FileTypeIcon type="financial_report.xlsx" />);
    expect(screen.getByTestId("file-type-icon-spreadsheet")).toBeInTheDocument();

    rerender(<FileTypeIcon type="data.csv" />);
    expect(screen.getByTestId("file-type-icon-spreadsheet")).toBeInTheDocument();
  });

  it("renders video icon for video type", () => {
    render(<FileTypeIcon type="video" />);
    expect(screen.getByTestId("file-type-icon-video")).toBeInTheDocument();
  });

  it("renders markdown icon for markdown type and .md/.markdown filenames", () => {
    const { rerender } = render(<FileTypeIcon type="markdown" />);
    expect(screen.getByTestId("file-type-icon-markdown")).toBeInTheDocument();

    rerender(<FileTypeIcon type="md" />);
    expect(screen.getByTestId("file-type-icon-markdown")).toBeInTheDocument();

    rerender(<FileTypeIcon type="README.md" />);
    expect(screen.getByTestId("file-type-icon-markdown")).toBeInTheDocument();

    rerender(<FileTypeIcon type="notes.markdown" />);
    expect(screen.getByTestId("file-type-icon-markdown")).toBeInTheDocument();
  });
});

describe("getDocumentBadgeStyle", () => {
  it("maps file types to DESIGN.md color tokens", () => {
    expect(getDocumentBadgeStyle("pdf")).toBe("bg-rose-50 text-rose-700 border-rose-100/80");
    expect(getDocumentBadgeStyle("report.pdf")).toBe("bg-rose-50 text-rose-700 border-rose-100/80");

    expect(getDocumentBadgeStyle("image")).toBe("bg-teal-50 text-teal-700 border-teal-100/80");
    expect(getDocumentBadgeStyle("png")).toBe("bg-teal-50 text-teal-700 border-teal-100/80");
    expect(getDocumentBadgeStyle("hero.png")).toBe("bg-teal-50 text-teal-700 border-teal-100/80");

    expect(getDocumentBadgeStyle("document")).toBe("bg-blue-50 text-blue-700 border-blue-100/80");
    expect(getDocumentBadgeStyle("contract.docx")).toBe("bg-blue-50 text-blue-700 border-blue-100/80");

    expect(getDocumentBadgeStyle("spreadsheet")).toBe("bg-emerald-50 text-emerald-700 border-emerald-100/80");
    expect(getDocumentBadgeStyle("xlsx")).toBe("bg-emerald-50 text-emerald-700 border-emerald-100/80");
    expect(getDocumentBadgeStyle("text/csv")).toBe("bg-emerald-50 text-emerald-700 border-emerald-100/80");
    expect(getDocumentBadgeStyle("budget.xlsx")).toBe("bg-emerald-50 text-emerald-700 border-emerald-100/80");

    expect(getDocumentBadgeStyle("markdown")).toBe("bg-sky-50 text-sky-700 border-sky-100/80");
    expect(getDocumentBadgeStyle("text/markdown")).toBe("bg-sky-50 text-sky-700 border-sky-100/80");
    expect(getDocumentBadgeStyle("README.md")).toBe("bg-sky-50 text-sky-700 border-sky-100/80");

    expect(getDocumentBadgeStyle("video")).toBe("bg-violet-50 text-violet-700 border-violet-100/80");
    expect(getDocumentBadgeStyle("mp4")).toBe("bg-violet-50 text-violet-700 border-violet-100/80");
    expect(getDocumentBadgeStyle("demo.mp4")).toBe("bg-violet-50 text-violet-700 border-violet-100/80");

    expect(getDocumentBadgeStyle("unknown")).toBe("bg-gray-100 text-gray-700 border-gray-200/60");
  });
});

