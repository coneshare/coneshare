import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { describe, it, expect, vi } from "vitest";
import { DocumentsList } from "../../../components/documents/DocumentsList";

// Mock child components and hooks to isolate the DocumentsList component
vi.mock("../../../components/documents/DraggableItem", () => ({
  DraggableItem: ({ item, onRename, onDelete }) => (
    <div>
      <span>{item.name}</span>
      <button onClick={() => onRename(item)}>Rename {item.type}</button>
      <button onClick={() => onDelete(item)}>Delete {item.type}</button>
    </div>
  ),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: (props) => props,
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

// Mock DndContext to just render its children and avoid drag-and-drop logic
vi.mock("@dnd-kit/core", async () => {
    const original = await vi.importActual("@dnd-kit/core");
    return {
        ...original,
        DndContext: ({ children }) => <>{children}</>,
        DragOverlay: ({ children }) => <>{children}</>,
        useSensor: vi.fn(),
        useSensors: vi.fn(),
    };
});

describe("DocumentsList", () => {
  const mockDocuments = [{ id: "doc1", name: "Test Document 1", type: "document" }];
  const mockFolders = [{ id: "folder1", name: "Test Folder 1", type: "folder" }];

  it("should open the rename dialog when rename is clicked on a document", async () => {
    render(
      <DocumentsList
        allItems={mockDocuments}
        loading={false}
        onDataRefresh={() => {}}
        onFilesDrop={() => {}}
        sortConfig={{ key: "name", direction: "ascending" }}
        selectedDocuments={[]}
        selectedFolders={[]}
      />
    );
    
    const renameButton = screen.getByRole("button", { name: /rename document/i });
    await userEvent.click(renameButton);

    const dialogTitle = await screen.findByRole('heading', { name: /rename document/i });
    expect(dialogTitle).toBeInTheDocument();    

    const nameInput = screen.getByDisplayValue("Test Document 1");
    expect(nameInput).toBeInTheDocument();
  });

  it("should open the rename dialog when rename is clicked on a folder", async () => {
    render(
      <DocumentsList
        allItems={mockFolders}
        loading={false}
        onDataRefresh={() => {}}
        onFilesDrop={() => {}}
        sortConfig={{ key: "name", direction: "ascending" }}
        selectedDocuments={[]}
        selectedFolders={[]}
      />
    );
    
    const renameButton = screen.getByRole("button", { name: /rename folder/i });
    await userEvent.click(renameButton);

    const dialogTitle = await screen.findByRole('heading', { name: /rename folder/i });
    expect(dialogTitle).toBeInTheDocument();    
    
    const nameInput = screen.getByDisplayValue("Test Folder 1");
    expect(nameInput).toBeInTheDocument();
  });

  it("should open the delete dialog when delete is clicked on a document", async () => {
    render(
      <DocumentsList
        allItems={mockDocuments}
        loading={false}
        onDataRefresh={() => {}}
        sortConfig={{ key: "name", direction: "ascending" }}
      />
    );
    
    const deleteButton = screen.getByRole("button", { name: /delete document/i });
    await userEvent.click(deleteButton);

    const dialogTitle = await screen.findByRole('heading', { name: /delete "Test Document 1"\?/i });
    expect(dialogTitle).toBeInTheDocument();
  });

  it("should render a Views tooltip trigger", () => {
    render(
      <DocumentsList
        allItems={mockDocuments}
        loading={false}
        onDataRefresh={() => {}}
        sortConfig={{ key: "name", direction: "ascending" }}
        viewsTooltip="Direct views from this document's own share links."
      />
    );

    expect(screen.getByRole("button", { name: "Views" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About Views" })).toBeInTheDocument();
  });
});

describe("DocumentsList with external handlers", () => {
  const mockDocument = { id: "doc1", name: "External Doc", type: "document" };

  it("should call external onDelete handler instead of showing a dialog", async () => {
      const mockOnDelete = vi.fn();
      render(
          <DocumentsList
              allItems={[mockDocument]}
              loading={false}
              onDelete={mockOnDelete}
              sortConfig={{ key: "name", direction: "ascending" }}
          />
      );

      const deleteButton = screen.getByRole("button", { name: /delete document/i });
      await userEvent.click(deleteButton);

      // Assert the external handler was called
      expect(mockOnDelete).toHaveBeenCalledWith(mockDocument);
      
      // Assert the internal confirmation dialog did NOT appear
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("should call external onRename handler instead of showing a dialog", async () => {
      const mockOnRename = vi.fn();
      render(
          <DocumentsList
              allItems={[mockDocument]}
              loading={false}
              onRename={mockOnRename}
              sortConfig={{ key: "name", direction: "ascending" }}
          />
      );

      const renameButton = screen.getByRole("button", { name: /rename document/i });
      await userEvent.click(renameButton);

      // Assert the external handler was called
      expect(mockOnRename).toHaveBeenCalledWith(mockDocument);
      
      // Assert the internal rename dialog did NOT appear
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
