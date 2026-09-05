import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { FileTypeIcon } from '../documents/FileTypeIcon';
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
function PermissionRow({ item, level, settings, onSettingChange, onBulkSettingChange, expandedFolders, toggleFolder, isSaving = false }) {
  const { t } = useTranslation();
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
            <button onClick={() => toggleFolder(item.id)} className="p-1 -ml-1 flex-shrink-0">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-6 flex-shrink-0" /> // Spacer to align with folder icons
          )}
          <FileTypeIcon type={isFolder ? 'folder' : item.document_type || 'document'} className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{item.name}</span>
        </div>
        <div className="flex justify-center">
          {isFolder ? (
            <Checkbox checked={setting.is_visible} onCheckedChange={(checked) => handleBulkChange('is_visible', checked)} disabled={isSaving} />
          ) : (
            <Checkbox id={`visible-${item.id}`} checked={setting.is_visible} onCheckedChange={(c) => handleCheckboxChange('is_visible', c)} disabled={isSaving} />
          )}
        </div>
        <div className="flex justify-center">
          {isFolder ? (
            <Checkbox checked={setting.allow_download} onCheckedChange={(checked) => handleBulkChange('allow_download', checked)} disabled={isSaving} />
          ) : (
            <Checkbox id={`download-${item.id}`} checked={setting.allow_download} onCheckedChange={(c) => handleCheckboxChange('allow_download', c)} disabled={isSaving} />
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
                <p>{t('datarooms.watermarkFolderHelp')}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Checkbox id={`watermark-${item.id}`} checked={setting.enable_watermark} onCheckedChange={(c) => handleCheckboxChange('enable_watermark', c)} disabled={isSaving} />
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
          isSaving={isSaving}
        />
      ))}
    </>
  );
}


// --- Main Dialog Component ---
export function ManagePermissionsDialog({ isOpen, onOpenChange, link, onSuccess }) {
  const { t } = useTranslation();
  const [dataroomTree, setDataroomTree] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({});
  const [originalSettings, setOriginalSettings] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});

  useEffect(() => {
    if (!isOpen) {
      setIsSaving(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && link) {
      const fetchContentAndBuildTree = async () => {
        setIsLoading(true);
        try {
          // The getDataroom endpoint returns a mixed `items` list for full content.
          const response = await getDataroom(link.dataroom, { content: 'full' });
          const items = response.data.items || [
            ...(response.data.folders || []).map((f) => ({ ...f, type: 'folder' })),
            ...(response.data.documents || []).map((d) => ({ ...d, type: 'document', name: d.name || d.document_name })),
          ];
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

    setIsSaving(true);
    try {
      await updateDataroomLinkSettings(link.id, changes);
      toast.success(t('datarooms.permissionsUpdated'));
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isSaving) {
        onOpenChange(open);
      }
    }}>
      <DialogContent className="sm:max-w-4xl">
        <TooltipProvider>
          <DialogHeader>
            <DialogTitle>{t('datarooms.managePermissionsTitle', { name: link?.name || t('links.untitledLink') })}</DialogTitle>
          <DialogDescription>
            {t('datarooms.managePermissionsDescription')}
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            {t('datarooms.managePermissionsHelp')}
          </p>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <div className={`${PERMISSION_GRID_CLASS} px-2 text-sm font-medium text-muted-foreground`}>
            <span>{t('datarooms.contentColumn')}</span>
            <Label className="text-center">{t('datarooms.visibleColumn')}</Label>
            <Label className="text-center">{t('datarooms.downloadColumn')}</Label>
            <Label className="text-center">{t('datarooms.watermarkColumn')}</Label>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border p-2">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : dataroomTree.length === 0 ? (
              <p className="text-center p-4 text-sm text-muted-foreground">{t('datarooms.dataroomEmpty')}</p>
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
                   isSaving={isSaving}
                 />
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!isSaving) {
                onOpenChange(false);
              }
            }}
            disabled={isSaving}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('common.save')
            )}
          </Button>
        </DialogFooter>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
