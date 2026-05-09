import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { DraggableItem } from "../../../components/documents/DraggableItem";

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
  created_by: { name: "Test User" },
  updated_at: new Date().toISOString(),
  file_size: 12345,
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
      <DndContext>
        <DraggableItem {...defaultProps} />
      </DndContext>
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

  it("should not navigate when rename menu item is clicked", async () => {
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
  });

  it("should not navigate when delete menu item is clicked", async () => {
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
  });
});
