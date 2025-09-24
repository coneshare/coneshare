import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { describe, it, expect, vi } from "vitest";
import { DocumentsList } from "../../../components/documents/DocumentsList";

// Mock child components and hooks to isolate the DocumentsList component
vi.mock("../../../components/documents/DocumentCard", () => ({
  default: ({ document, onRename }) => (
    <div>
      <span>{document.name}</span>
      <button onClick={onRename}>Rename Document</button>
    </div>
  ),
}));

vi.mock("../../../components/documents/FolderCard", () => ({
  default: ({ folder, onRename }) => (
    <div>
      <span>{folder.name}</span>
      <button onClick={onRename}>Rename Folder</button>
    </div>
  ),
}));

vi.mock("../../../components/documents/DraggableItem", () => ({
  DraggableItem: ({ children }) => <div>{children}</div>,
}));

vi.mock("../../../components/documents/DroppableFolder", () => ({
  DroppableFolder: ({ children }) => <div>{children}</div>,
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
  const mockDocuments = [{ id: "doc1", name: "Test Document 1" }];
  const mockFolders = [{ id: "folder1", name: "Test Folder 1" }];

  it("should open the rename dialog when rename is clicked on a document", async () => {
    render(
      <DocumentsList
        documents={mockDocuments}
        folders={[]}
        loading={false}
        foldersLoading={false}
        onDataRefresh={() => {}}
        onFilesDrop={() => {}}
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
        documents={[]}
        folders={mockFolders}
        loading={false}
        foldersLoading={false}
        onDataRefresh={() => {}}
        onFilesDrop={() => {}}
      />
    );
    
    const renameButton = screen.getByRole("button", { name: /rename folder/i });
    await userEvent.click(renameButton);

    const dialogTitle = await screen.findByRole('heading', { name: /rename folder/i });
    expect(dialogTitle).toBeInTheDocument();    
    
    const nameInput = screen.getByDisplayValue("Test Folder 1");
    expect(nameInput).toBeInTheDocument();
  });
});
