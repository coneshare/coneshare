import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileTypeIcon } from "../../../components/documents/FileTypeIcon";

describe("FileTypeIcon", () => {
  it("renders folder icon for folder type", () => {
    render(<FileTypeIcon type="folder" />);
    expect(screen.getByTestId("file-type-icon-folder")).toBeInTheDocument();
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
});

