import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumbs } from "../../../components/documents/Breadcrumbs";

// Mock lucide-react icons
vi.mock("lucide-react", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    Home: (props) => <svg {...props}>Home</svg>,
    ChevronRight: (props) => <svg {...props}>ChevronRight</svg>,
  };
});

describe("Breadcrumbs", () => {
  const renderWithRouter = (ui) => {
    return render(ui, { wrapper: MemoryRouter });
  };

  it("should render root breadcrumb when no folder is provided", () => {
    renderWithRouter(<Breadcrumbs currentFolder={null} />);
    const link = screen.getByRole("link", { name: /documents/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/documents");
  });

  it("should render breadcrumbs for a root-level folder", () => {
    const folder = {
      id: "folder1",
      name: "Reports",
      ancestors: [],
    };
    renderWithRouter(<Breadcrumbs currentFolder={folder} />);

    const rootLink = screen.getByRole("link", { name: /documents/i });
    expect(rootLink).toBeInTheDocument();

    const currentFolderText = screen.getByText("Reports");
    expect(currentFolderText).toBeInTheDocument();
  });

  it("should render breadcrumbs for a nested folder", () => {
    const folder = {
      id: "folder2",
      name: "Q1",
      ancestors: [{ id: "folder1", name: "Reports" }],
    };
    renderWithRouter(<Breadcrumbs currentFolder={folder} />);

    const rootLink = screen.getByRole("link", { name: /documents/i });
    expect(rootLink).toBeInTheDocument();

    const ancestorLink = screen.getByRole("link", { name: "Reports" });
    expect(ancestorLink).toBeInTheDocument();
    expect(ancestorLink).toHaveAttribute("href", "/documents/folders/folder1");

    const currentFolderText = screen.getByText("Q1");
    expect(currentFolderText).toBeInTheDocument();
  });
});
