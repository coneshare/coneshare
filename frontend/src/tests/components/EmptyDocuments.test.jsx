import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyDocuments } from "../../components/documents/EmptyDocuments";

describe("EmptyDocuments", () => {
  it("renders the main heading", () => {
    render(<EmptyDocuments />);
    expect(
      screen.getByRole("heading", { name: /No documents/i })
    ).toBeInTheDocument();
  });

  it("renders the instructional text", () => {
    render(<EmptyDocuments />);
    expect(
      screen.getByText(/Drag and drop files or folders here/i)
    ).toBeInTheDocument();
  });
});
