import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { describe, it, expect, vi } from "vitest";
import { DocumentsList } from "../../../components/documents/DocumentsList";

// Mock child components and hooks to isolate the DocumentsList component
vi.mock("../../../components/documents/DraggableItem", () => ({
  DraggableItem: ({ item, onRename, onDelete, showIndex, itemIndex }) => (
    <div>
      {showIndex && <span data-testid={`row-index-${item.id}`}>{itemIndex}</span>}
      <span>{item.name}</span>
      <button onClick={() => onRename(item)}>Rename {item.type}</button>
      <button onClick={() => onDelete(item)}>Delete {item.type}</button>
    </div>
  ),
}));

let mockCapturedOptions = null;
vi.mock("react-dropzone", () => ({
  useDropzone: (options) => {
    mockCapturedOptions = options;
    return {
      getRootProps: (props) => props,
      getInputProps: () => ({}),
      isDragActive: false,
    };
  },
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

  it("should render the read-only index header when showIndex is enabled", () => {
    render(
      <DocumentsList
        allItems={mockDocuments}
        loading={false}
        isReadOnly
        showIndex
        sortConfig={{ key: "name", direction: "ascending" }}
      />
    );

    expect(screen.getByText("#")).toBeInTheDocument();
    expect(screen.getByTestId("row-index-doc1")).toHaveTextContent("1");
  });

  it("should not render a read-only leading index header when showIndex is disabled", () => {
    render(
      <DocumentsList
        allItems={mockDocuments}
        loading={false}
        isReadOnly
        sortConfig={{ key: "name", direction: "ascending" }}
      />
    );

    expect(screen.queryByText("#")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-index-doc1")).not.toBeInTheDocument();
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

describe("DocumentsList Drag and Drop folder parsing", () => {
  it("should parse files and folders recursively using webkitGetAsEntry", async () => {
    render(
      <DocumentsList
        allItems={[]}
        loading={false}
        onDataRefresh={() => {}}
        onFilesDrop={() => {}}
        sortConfig={{ key: "name", direction: "ascending" }}
      />
    );

    expect(mockCapturedOptions).not.toBeNull();
    expect(mockCapturedOptions.getFilesFromEvent).toBeTypeOf("function");

    const file1 = new File(["content1"], "file1.txt", { type: "text/plain" });
    const file2 = new File(["content2"], "file2.txt", { type: "text/plain" });
    const file3 = new File(["content3"], "file3.txt", { type: "text/plain" });

    // Mock FileSystemEntry nodes
    const entryFile3 = {
      isFile: true,
      isDirectory: false,
      name: "file3.txt",
      file: (cb) => cb(file3),
    };

    const entryFile2 = {
      isFile: true,
      isDirectory: false,
      name: "file2.txt",
      file: (cb) => cb(file2),
    };

    const entryFolderB = {
      isFile: false,
      isDirectory: true,
      name: "folderB",
      createReader: () => {
        let read = false;
        return {
          readEntries: (cb) => {
            if (!read) {
              read = true;
              cb([entryFile2]);
            } else {
              cb([]);
            }
          },
        };
      },
    };

    const entryFile1 = {
      isFile: true,
      isDirectory: false,
      name: "file1.txt",
      file: (cb) => cb(file1),
    };

    const entryFolderA = {
      isFile: false,
      isDirectory: true,
      name: "folderA",
      createReader: () => {
        let read = false;
        return {
          readEntries: (cb) => {
            if (!read) {
              read = true;
              cb([entryFile1, entryFolderB]);
            } else {
              cb([]);
            }
          },
        };
      },
    };

    const mockEvent = {
      type: "drop",
      dataTransfer: {
        items: [
          {
            kind: "file",
            webkitGetAsEntry: () => entryFolderA,
          },
          {
            kind: "file",
            webkitGetAsEntry: () => entryFile3,
          },
        ],
      },
    };

    const parsedFiles = await mockCapturedOptions.getFilesFromEvent(mockEvent);

    expect(parsedFiles).toHaveLength(3);

    // Verify relative paths
    const f1 = parsedFiles.find((f) => f.name === "file1.txt");
    const f2 = parsedFiles.find((f) => f.name === "file2.txt");
    const f3 = parsedFiles.find((f) => f.name === "file3.txt");

    expect(f1).toBeDefined();
    expect(f1.webkitRelativePath).toBe("folderA/file1.txt");

    expect(f2).toBeDefined();
    expect(f2.webkitRelativePath).toBe("folderA/folderB/file2.txt");

    expect(f3).toBeDefined();
    expect(f3.webkitRelativePath).toBe("file3.txt");
  });

  it("should fallback to dataTransfer.files if items are not available", async () => {
    render(
      <DocumentsList
        allItems={[]}
        loading={false}
        onDataRefresh={() => {}}
        onFilesDrop={() => {}}
        sortConfig={{ key: "name", direction: "ascending" }}
      />
    );

    const file = new File(["content"], "simple.txt", { type: "text/plain" });
    const mockEvent = {
      type: "drop",
      dataTransfer: {
        files: [file],
      },
    };

    const parsedFiles = await mockCapturedOptions.getFilesFromEvent(mockEvent);
    expect(parsedFiles).toHaveLength(1);
    expect(parsedFiles[0].name).toBe("simple.txt");
  });

  it("should handle non-drop events like input change", async () => {
    render(
      <DocumentsList
        allItems={[]}
        loading={false}
        onDataRefresh={() => {}}
        onFilesDrop={() => {}}
        sortConfig={{ key: "name", direction: "ascending" }}
      />
    );

    const file = new File(["content"], "input.txt", { type: "text/plain" });
    const mockEvent = {
      type: "change",
      target: {
        files: [file],
      },
    };

    const parsedFiles = await mockCapturedOptions.getFilesFromEvent(mockEvent);
    expect(parsedFiles).toHaveLength(1);
    expect(parsedFiles[0].name).toBe("input.txt");
  });
});

