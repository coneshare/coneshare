import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { DraggableItem } from "../../../components/documents/DraggableItem";
import { TooltipProvider } from "../../../components/ui/Tooltip";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const original = await vi.importActual("react-router-dom");
  return {
    ...original,
    useNavigate: () => mockedNavigate,
  };
});

const mockDocument = {
  id: "doc_123",
  name: "Test Document.pdf",
  created_by: { name: "Test User", email: "test@example.com" },
  updated_at: new Date().toISOString(),
  file_size: 12345,
  view_count: 7,
  is_starred: false,
};

const renderDraggableItem = (props = {}) => {
  const defaultProps = {
    id: mockDocument.id,
    item: mockDocument,
    type: "document",
    isSelected: false,
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onShare: vi.fn(),
    onToggleStar: vi.fn(),
    ...props,
  };

  return render(
    <MemoryRouter>
      <TooltipProvider>
        <DndContext>
          <DraggableItem {...defaultProps} />
        </DndContext>
      </TooltipProvider>
    </MemoryRouter>
  );
};

describe("DraggableItem", () => {
  beforeEach(() => {
    mockedNavigate.mockClear();
  });

  it("should always show actions trigger", () => {
    renderDraggableItem();
    expect(screen.getByRole("button", { name: `Actions for ${mockDocument.name}` })).toBeVisible();
  });

  it("should navigate when document name is clicked", async () => {
    const user = userEvent.setup();
    renderDraggableItem();

    await user.click(screen.getByRole("button", { name: mockDocument.name }));
    expect(mockedNavigate).toHaveBeenCalledWith(`/documents/${mockDocument.id}`);
  });

  it("should select row when row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderDraggableItem({ onSelect });
    await user.click(screen.getByTestId(`draggable-item-${mockDocument.id}`));
    expect(onSelect).toHaveBeenCalled();
  });

  it("should render document view count", () => {
    renderDraggableItem();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("should render folder view count as unavailable", () => {
    renderDraggableItem({
      id: "folder_123",
      type: "folder",
      item: {
        id: "folder_123",
        name: "Test Folder",
        updated_at: new Date().toISOString(),
      },
    });

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("should not navigate and should close dropdown when rename menu item is clicked", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderDraggableItem({ onRename });

    const triggerButton = screen.getByLabelText(
      `Actions for ${mockDocument.name}`
    );
    await user.click(triggerButton);

    const renameMenuItem = await screen.findByRole("menuitem", {
      name: /rename/i,
    });
    await user.click(renameMenuItem);

    expect(onRename).toHaveBeenCalledWith(mockDocument);
    expect(mockedNavigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: /rename/i })).not.toBeInTheDocument();
  });

  it("should not navigate and should close dropdown when delete menu item is clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderDraggableItem({ onDelete });

    const triggerButton = screen.getByLabelText(
      `Actions for ${mockDocument.name}`
    );
    await user.click(triggerButton);

    const deleteMenuItem = await screen.findByRole("menuitem", {
      name: /delete/i,
    });
    await user.click(deleteMenuItem);

    expect(onDelete).toHaveBeenCalledWith(mockDocument);
    expect(mockedNavigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("should render owner avatar and name", () => {
    renderDraggableItem();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("TU")).toBeInTheDocument(); // Avatar fallback initials
  });

  it("should render folder owner avatar and name", () => {
    renderDraggableItem({
      id: "folder_123",
      type: "folder",
      item: {
        id: "folder_123",
        name: "Financials Folder",
        created_by: { name: "Carol Danvers", email: "carol@example.com" },
        updated_at: new Date().toISOString(),
      },
    });
    expect(screen.getByText("Carol Danvers")).toBeInTheDocument();
    expect(screen.getByText("CD")).toBeInTheDocument();
  });

  it("should render non-current owner string correctly without displaying me", () => {
    renderDraggableItem({
      id: "doc_999",
      item: {
        id: "doc_999",
        name: "Collaborator Shared Doc.pdf",
        created_by: "user_other_123",
        created_by_name: "Bob Smith",
        updated_at: new Date().toISOString(),
      },
    });
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
  });
});
