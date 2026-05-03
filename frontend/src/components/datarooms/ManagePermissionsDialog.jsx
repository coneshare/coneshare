import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getDataroom, updateDataroomLinkSettings } from '../../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Label } from '../ui/Label';
import { FolderIcon, FileIcon, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';

const PERMISSION_GRID_CLASS = 'grid grid-cols-[minmax(0,1fr)_6rem_6rem_6rem] items-center';

// --- Tree Building Utility ---
const buildTree = (items) => {
  const allItems = (items || []).map((item) => ({
    ...item,
    children: item.type === 'folder' ? [] : undefined,
  }));

  const itemMap = new Map(allItems.map(item => [item.id, item]));
  const tree = [];

  for (const item of allItems) {
    const parentId = item.type === 'folder' ? item.parent : item.folder;
    if (parentId && itemMap.has(parentId)) {
      itemMap.get(parentId).children.push(item);
    } else {
      tree.push(item);
    }
  }
  return tree;
};

// --- Recursive Row Component ---
function PermissionRow({ item, level, settings, onSettingChange, onBulkSettingChange, expandedFolders, toggleFolder }) {
  const setting = settings[item.id];
  const isFolder = item.type === 'folder';
  const isExpanded = isFolder && expandedFolders[item.id];

  if (!setting) {
    return null;
  }

  const handleCheckboxChange = (key, checked) => {
    onSettingChange(item.id, key, checked);
  };
  
  const handleBulkChange = (key, checked) => {
    if (isFolder) {
      onBulkSettingChange(item, key, checked);
    }
  };

  return (
    <>
      <div className={`${PERMISSION_GRID_CLASS} rounded-md p-2 hover:bg-muted/50 text-sm`}>
        <div className="flex items-center gap-2 flex-1 min-w-0" style={{ paddingLeft: `${level * 1.5}rem` }}>
          {isFolder ? (
            <button onClick={() => toggleFolder(item.id)} className="p-1 -ml-1">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-6" /> // Spacer to align with folder icons
          )}
          {isFolder ? <FolderIcon className="h-4 w-4 flex-shrink-0" /> : <FileIcon className="h-4 w-4 flex-shrink-0" />}
          <span className="truncate">{item.name}</span>
        </div>
        <div className="flex justify-center">
          {isFolder ? (
            <Checkbox checked={setting.is_visible} onCheckedChange={(checked) => handleBulkChange('is_visible', checked)} />
          ) : (
            <Checkbox id={`visible-${item.id}`} checked={setting.is_visible} onCheckedChange={(c) => handleCheckboxChange('is_visible', c)} />
          )}
        </div>
        <div className="flex justify-center">
          {isFolder ? (
            <Checkbox checked={setting.allow_download} onCheckedChange={(checked) => handleBulkChange('allow_download', checked)} />
          ) : (
            <Checkbox id={`download-${item.id}`} checked={setting.allow_download} onCheckedChange={(c) => handleCheckboxChange('allow_download', c)} />
          )}
        </div>
        <div className="flex justify-center">
          {isFolder ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Disabled elements need a wrapper for the tooltip to trigger */}
                <span tabIndex="0" className="inline-flex">
                  <Checkbox checked={setting.enable_watermark} onCheckedChange={(checked) => handleBulkChange('enable_watermark', checked)} disabled />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Watermark settings are applied to individual documents, not folders.</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Checkbox id={`watermark-${item.id}`} checked={setting.enable_watermark} onCheckedChange={(c) => handleCheckboxChange('enable_watermark', c)} />
          )}
        </div>
      </div>
      {isExpanded && item.children.map(child => (
        <PermissionRow
          key={child.id}
          item={child}
          level={level + 1}
          settings={settings}
          onSettingChange={onSettingChange}
          onBulkSettingChange={onBulkSettingChange}
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
        />
      ))}
    </>
  );
}


// --- Main Dialog Component ---
export function ManagePermissionsDialog({ isOpen, onOpenChange, link, onSuccess }) {
  const [dataroomTree, setDataroomTree] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [originalSettings, setOriginalSettings] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});

  useEffect(() => {
    if (isOpen && link) {
      const fetchContentAndBuildTree = async () => {
        setIsLoading(true);
        try {
          // The getDataroom endpoint returns a mixed `items` list for full content.
          const response = await getDataroom(link.dataroom, { content: 'full' });
          const { items = [] } = response.data;
          const tree = buildTree(items);
          setDataroomTree(tree);

          const settingsMap = link.dataroom_settings.reduce((acc, setting) => {
            const key = setting.dataroom_document || setting.dataroom_folder;
            acc[key] = setting;
            return acc;
          }, {});
          setSettings(settingsMap);
          setOriginalSettings(JSON.parse(JSON.stringify(settingsMap))); // Deep copy

          // Expand all folders by default
          const allFolderIds = items
            .filter((item) => item.type === 'folder')
            .reduce((acc, folder) => ({ ...acc, [folder.id]: true }), {});
          setExpandedFolders(allFolderIds);

        } catch (error) {
          toast.error('Failed to load dataroom content.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchContentAndBuildTree();
    }
  }, [isOpen, link]);
  
  const toggleFolder = useCallback((folderId) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  }, []);

  const handleSettingChange = (itemKey, key, value) => {
    setSettings(prev => ({
      ...prev,
      [itemKey]: {
        ...prev[itemKey],
        [key]: value,
      },
    }));
  };  

  const handleBulkSettingChange = useCallback((startFolder, key, value) => {
    let newSettings = { ...settings };

    const applyRecursively = (folder) => {
      // Apply to the folder itself
      if (newSettings[folder.id]) {
        newSettings[folder.id] = { ...newSettings[folder.id], [key]: value };
      }
      // Apply to its children
      for (const child of folder.children) {
        if (child.type === 'folder') {
          applyRecursively(child);
        } else if (newSettings[child.id]) {
          newSettings[child.id] = { ...newSettings[child.id], [key]: value };
        }
      }
    };
    applyRecursively(startFolder);
    setSettings(newSettings);
  }, [settings]);

  const handleSave = async () => {
    const changes = Object.keys(settings)
      .filter(key => JSON.stringify(settings[key]) !== JSON.stringify(originalSettings[key]))
      .map(key => {
        const { id, is_visible, allow_download, enable_watermark } = settings[key];
        return { id, is_visible, allow_download, enable_watermark };
      });    

    if (changes.length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      await updateDataroomLinkSettings(link.id, changes);
      toast.success('Permissions updated successfully.');
      onSuccess();
    } catch (error) {
      // Error toast handled by interceptor
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <TooltipProvider>
          <DialogHeader>
            <DialogTitle>Manage Permissions for "{link?.name || 'Untitled Link'}"</DialogTitle>
          <DialogDescription>
            Set visibility, download, and watermark permissions for each item. Changes apply only to
            this link.
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            Folder permission changes apply recursively to all nested folders and documents.
          </p>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <div className={`${PERMISSION_GRID_CLASS} px-2 text-sm font-medium text-muted-foreground`}>
            <span>Content</span>
            <Label className="text-center">Visible</Label>
            <Label className="text-center">Download</Label>
            <Label className="text-center">Watermark</Label>
          </div>
          {/* <div className={`${PERMISSION_GRID_CLASS} px-2 text-xs font-medium text-muted-foreground bg-muted/50 rounded-md py-1`}> */}
          {/*   <span className="ml-8">Folder controls (recursive):</span> */}
          {/*   <Label className="text-center">Visible</Label> */}
          {/*   <Label className="text-center">Download</Label> */}
          {/*   <Label className="text-center">Watermark</Label> */}
          {/* </div> */}
          <div className="max-h-[50vh] overflow-y-auto rounded-md border p-2">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              dataroomTree.map(item => (
                 <PermissionRow
                   key={item.id}
                   item={item}
                   level={0}
                   settings={settings}
                   onSettingChange={handleSettingChange}
                   onBulkSettingChange={handleBulkSettingChange}
                   expandedFolders={expandedFolders}
                   toggleFolder={toggleFolder}
                 />
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>Save Changes</Button>
        </DialogFooter>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
