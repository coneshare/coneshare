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

  it("should show checkbox and actions dropdown on hover", async () => {
    const user = userEvent.setup();
    renderDraggableItem();

    const itemRow = screen.getByTestId(`draggable-item-${mockDocument.id}`);
    const actionsContainer = screen.getByLabelText(`Actions for ${mockDocument.name}`).closest("div[class*='opacity']");
    const checkboxContainer = screen.getByLabelText(`Select ${mockDocument.name}`).closest("div[class*='opacity']");
    
    // Initially, they should be invisible
    expect(actionsContainer).toHaveClass("opacity-0");
    expect(checkboxContainer).toHaveClass("opacity-0");

    // Simulate hover
    await user.hover(itemRow);

    // Now they should be visible
    expect(actionsContainer).toHaveClass("opacity-100");
    expect(checkboxContainer).toHaveClass("opacity-100");

    // Simulate unhover
    await user.unhover(itemRow);
    
    // They should be invisible again
    expect(actionsContainer).toHaveClass("opacity-0");
    expect(checkboxContainer).toHaveClass("opacity-0");
  });

  it("should keep actions dropdown and checkbox visible when item is selected, even without hover", () => {
    renderDraggableItem({ isSelected: true });
    
    const actionsContainer = screen.getByLabelText(`Actions for ${mockDocument.name}`).closest("div[class*='opacity']");
    const checkboxContainer = screen.getByLabelText(`Select ${mockDocument.name}`).closest("div[class*='opacity']");

    expect(actionsContainer).toHaveClass("opacity-100");
    expect(checkboxContainer).toHaveClass("opacity-100");
  });

  it("should open dropdown menu and keep it visible when actions trigger is clicked", async () => {
    const user = userEvent.setup();
    renderDraggableItem();

    const itemRow = screen.getByTestId(`draggable-item-${mockDocument.id}`);
    
    // Hover to show the trigger
    await user.hover(itemRow);

    const triggerButton = screen.getByLabelText(`Actions for ${mockDocument.name}`);
    await user.click(triggerButton);

    // The dropdown menu content should now be visible.
    const renameMenuItem = await screen.findByRole("menuitem", { name: /rename/i });
    expect(renameMenuItem).toBeVisible();

    // To ensure it stays open, we can check that the trigger area remains visible
    // even if we move the mouse away (which would fire onMouseLeave)
    await user.unhover(itemRow);
    expect(renameMenuItem).toBeVisible();
  });

  it("should not navigate when rename menu item is clicked", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderDraggableItem({ onRename });

    const itemRow = screen.getByTestId(`draggable-item-${mockDocument.id}`);
    await user.hover(itemRow);

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

    const itemRow = screen.getByTestId(`draggable-item-${mockDocument.id}`);
    await user.hover(itemRow);

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
