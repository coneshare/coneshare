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

  it("should render synced datarooms count badge and trigger Sync to Datarooms action for source folders", async () => {
    const user = userEvent.setup();
    const onSyncDatarooms = vi.fn();
    const folderItem = {
      id: "folder_sync_1",
      name: "Legal Docs",
      synced_datarooms: [
        {
          dataroom_id: "dr_1",
          dataroom_name: "Series A",
          dataroom_folder_id: "df_1",
          dataroom_folder_path: "/Legal Docs",
        },
      ],
      updated_at: new Date().toISOString(),
    };
    renderDraggableItem({
      id: folderItem.id,
      type: "folder",
      item: folderItem,
      onSyncDatarooms,
    });

    expect(screen.getByTestId("file-type-icon-folder-sync")).toBeInTheDocument();
    const badgeButton = screen.getByRole("button", { name: "Synced with 1 dataroom" });
    await user.click(badgeButton);
    expect(onSyncDatarooms).toHaveBeenCalledWith(folderItem);

    await user.click(screen.getByLabelText("Actions for Legal Docs"));
    const syncMenuItem = await screen.findByRole("menuitem", { name: "Sync to Datarooms" });
    await user.click(syncMenuItem);
    expect(onSyncDatarooms).toHaveBeenCalledTimes(2);
  });

  it("should render Synced badge and Unlink action only for sync-root dataroom folders", async () => {
    const user = userEvent.setup();
    const onUnlink = vi.fn();
    const syncRootFolder = {
      id: "df_root",
      name: "Legal Docs",
      is_synced: true,
      is_sync_root: true,
      source_folder: "f_1",
      source_folder_name: "Legal Docs",
      source_folder_deleted: false,
      updated_at: new Date().toISOString(),
    };

    const { rerender } = renderDraggableItem({
      id: syncRootFolder.id,
      type: "folder",
      item: syncRootFolder,
      onUnlink,
    });

    expect(screen.getByTestId("file-type-icon-folder-sync")).toBeInTheDocument();
    const syncedBadge = screen.getByText("Synced").closest("[tabindex='0']");
    expect(syncedBadge).toBeInTheDocument();
    expect(syncedBadge).toHaveAttribute("tabIndex", "0");
    expect(syncedBadge.className).toContain("focus-visible:ring-2");
    await user.hover(syncedBadge);
    expect(await screen.findByRole("tooltip")).toHaveTextContent('Source: Documents / "Legal Docs"');
    await user.click(screen.getByLabelText("Actions for Legal Docs"));
    const unlinkItem = await screen.findByRole("menuitem", { name: "Unlink" });
    await user.click(unlinkItem);
    expect(onUnlink).toHaveBeenCalledWith(syncRootFolder);

    // Active non-root synced child should show regular folder icon + managed indicator, without Synced badge or Unlink action
    const activeChildFolder = {
      id: "df_active_child",
      name: "Subfolder",
      is_synced: true,
      is_sync_root: false,
      source_folder: "f_sub",
      source_folder_name: "Subfolder",
      source_folder_deleted: false,
      updated_at: new Date().toISOString(),
    };
    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <DndContext>
            <DraggableItem
              id={activeChildFolder.id}
              item={activeChildFolder}
              type="folder"
              isSelected={false}
              onSelect={vi.fn()}
              onRename={vi.fn()}
              onDelete={vi.fn()}
              onToggleStar={vi.fn()}
              onUnlink={onUnlink}
            />
          </DndContext>
        </TooltipProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId("file-type-icon-folder")).toBeInTheDocument();
    expect(screen.queryByTestId("file-type-icon-folder-sync")).not.toBeInTheDocument();
    expect(screen.queryByText("Synced")).not.toBeInTheDocument();
    const childIndicator = screen.getByRole("img", { name: "Managed by folder sync" });
    expect(childIndicator).toBeInTheDocument();
    await user.hover(childIndicator);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Managed by folder sync");
    await user.click(screen.getByLabelText("Actions for Subfolder"));
    expect(screen.queryByRole("menuitem", { name: "Unlink" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Non-root synced child should show trashed badge when deleted and omit Unlink action
    const childFolder = {
      id: "df_child",
      name: "Tax",
      is_synced: true,
      is_sync_root: false,
      source_folder: "f_2",
      source_folder_name: "Tax",
      source_folder_deleted: true,
      updated_at: new Date().toISOString(),
    };
    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <DndContext>
            <DraggableItem
              id={childFolder.id}
              item={childFolder}
              type="folder"
              isSelected={false}
              onSelect={vi.fn()}
              onRename={vi.fn()}
              onDelete={vi.fn()}
              onToggleStar={vi.fn()}
              onUnlink={onUnlink}
            />
          </DndContext>
        </TooltipProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId("file-type-icon-folder")).toBeInTheDocument();
    expect(screen.getByText("Source in Trash")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Actions for Tax"));
    expect(screen.queryByRole("menuitem", { name: "Unlink" })).not.toBeInTheDocument();
  });

  it("should render a subtle icon-only sync indicator for synced documents only", async () => {
    const user = userEvent.setup();
    const syncedDoc = {
      id: "ddoc_sync",
      name: "Synced.pdf",
      document_type: "pdf",
      is_synced: true,
      is_direct_upload: false,
      updated_at: new Date().toISOString(),
    };
    const { rerender } = renderDraggableItem({
      id: syncedDoc.id,
      type: "document",
      item: syncedDoc,
    });

    const indicator = screen.getByRole("img", { name: "Managed by folder sync" });
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("tabIndex", "0");
    expect(indicator.className).toContain("focus-visible:ring-2");
    expect(screen.queryByText("Synced")).not.toBeInTheDocument();
    await user.hover(indicator);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Managed by folder sync");

    const manualDoc = {
      ...syncedDoc,
      id: "ddoc_manual",
      name: "Direct.pdf",
      is_synced: false,
      is_direct_upload: true,
    };
    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <DndContext>
            <DraggableItem
              id={manualDoc.id}
              item={manualDoc}
              type="document"
              isSelected={false}
              onSelect={vi.fn()}
              onRename={vi.fn()}
              onDelete={vi.fn()}
              onToggleStar={vi.fn()}
            />
          </DndContext>
        </TooltipProvider>
      </MemoryRouter>
    );
    expect(screen.queryByRole("img", { name: "Managed by folder sync" })).not.toBeInTheDocument();
  });

  it("renders Add to Datarooms in ActionsDropdown for folders and documents only when onAddToDatarooms is passed", async () => {
    const user = userEvent.setup();
    const onAddToDatarooms = vi.fn();
    const folderItem = {
      id: "folder_add_1",
      name: "Board Folder",
      updated_at: new Date().toISOString(),
    };
    const docItem = {
      id: "doc_add_1",
      name: "Summary.pdf",
      updated_at: new Date().toISOString(),
    };

    const { rerender } = renderDraggableItem({
      id: folderItem.id,
      type: "folder",
      item: folderItem,
      onAddToDatarooms,
    });

    await user.click(screen.getByLabelText("Actions for Board Folder"));
    const addFolderItem = await screen.findByRole("menuitem", { name: "Add to Datarooms" });
    await user.click(addFolderItem);
    expect(onAddToDatarooms).toHaveBeenCalledWith(folderItem);

    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <DndContext>
            <DraggableItem
              id={docItem.id}
              item={docItem}
              type="document"
              isSelected={false}
              onSelect={vi.fn()}
              onRename={vi.fn()}
              onDelete={vi.fn()}
              onToggleStar={vi.fn()}
              onAddToDatarooms={onAddToDatarooms}
            />
          </DndContext>
        </TooltipProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByLabelText("Actions for Summary.pdf"));
    const addDocItem = await screen.findByRole("menuitem", { name: "Add to Datarooms" });
    await user.click(addDocItem);
    expect(onAddToDatarooms).toHaveBeenCalledWith(docItem);

    // Omitted when onAddToDatarooms is not provided (e.g. inside DataroomPage)
    rerender(
      <MemoryRouter>
        <TooltipProvider>
          <DndContext>
            <DraggableItem
              id={folderItem.id}
              item={folderItem}
              type="folder"
              isSelected={false}
              onSelect={vi.fn()}
              onRename={vi.fn()}
              onDelete={vi.fn()}
              onToggleStar={vi.fn()}
            />
          </DndContext>
        </TooltipProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByLabelText("Actions for Board Folder"));
    expect(screen.queryByRole("menuitem", { name: "Add to Datarooms" })).not.toBeInTheDocument();
  });
});
