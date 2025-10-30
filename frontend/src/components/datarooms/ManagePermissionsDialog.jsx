    import { useEffect, useState, useMemo } from 'react';
    import { toast } from 'sonner';
    import { getDataroom, updateDataroomLinkSettings } from '../../services/api';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/Dialog';
    import { Button } from '../ui/Button';
    import { Checkbox } from '../ui/Checkbox';
    import { Label } from '../ui/Label';
    import { FolderIcon, FileIcon, Loader2 } from 'lucide-react';
    
    function PermissionItem({ item, type, settings, onSettingChange }) {
      const setting = Object.values(settings).find(s => s.dataroom_document === item.id || s.dataroom_folder === item.id);
    
      if (!setting) {
        return null;
      }
    
      const isFolder = type === 'folder';
    
      return (
        <div className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50">
          <div className="flex items-center gap-2">
            {isFolder ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
            <span>{item.name || item.document_name}</span>
          </div>
          <div className="flex items-center gap-6">
            <Checkbox
              id={`visible-${item.id}`}
              checked={setting.is_visible}
              onCheckedChange={(checked) => onSettingChange(setting.id, 'is_visible', checked)}
            />
            <Checkbox
              id={`download-${item.id}`}
              checked={setting.allow_download}
              onCheckedChange={(checked) => onSettingChange(setting.id, 'allow_download', checked)}
            />
            <Checkbox
              id={`watermark-${item.id}`}
              checked={setting.enable_watermark}
              onCheckedChange={(checked) => onSettingChange(setting.id, 'enable_watermark', checked)}
            />
          </div>
        </div>
      );
    }
    
    export function ManagePermissionsDialog({ isOpen, onOpenChange, link }) {
      const [dataroomContent, setDataroomContent] = useState(null);
      const [isLoading, setIsLoading] = useState(true);
      const [settings, setSettings] = useState({});
      const [originalSettings, setOriginalSettings] = useState({});
    
      useEffect(() => {
        if (isOpen && link) {
          const fetchContent = async () => {
            setIsLoading(true);
            try {
              const response = await getDataroom(link.dataroom);
              setDataroomContent(response.data);
    
              const settingsMap = link.dataroom_settings.reduce((acc, setting) => {
                const key = setting.dataroom_document || setting.dataroom_folder;
                acc[key] = setting;
                return acc;
              }, {});
              setSettings(settingsMap);
              setOriginalSettings(JSON.parse(JSON.stringify(settingsMap))); // Deep copy
            } catch (error) {
              toast.error('Failed to load dataroom content.');
            } finally {
              setIsLoading(false);
            }
          };
          fetchContent();
        }
      }, [isOpen, link]);
    
      const handleSettingChange = (settingId, key, value) => {
        const itemKey = Object.keys(settings).find(k => settings[k].id === settingId);
        if (itemKey) {
          setSettings(prev => ({
            ...prev,
            [itemKey]: {
              ...prev[itemKey],
              [key]: value,
            },
          }));
        }
      };
    
      const handleSave = async () => {
        const changes = Object.values(settings).filter(current => {
          const original = Object.values(originalSettings).find(o => o.id === current.id);
          return JSON.stringify(current) !== JSON.stringify(original);
        }).map(({ id, is_visible, allow_download, enable_watermark }) => ({
          id, is_visible, allow_download, enable_watermark
        }));
    
        if (changes.length === 0) {
          onOpenChange(false);
          return;
        }
    
        try {
          await updateDataroomLinkSettings(link.id, changes);
          toast.success('Permissions updated successfully.');
          onOpenChange(false);
        } catch (error) {
          // Error toast handled by interceptor
        }
      };
    
      const contentItems = useMemo(() => {
        if (!dataroomContent) return [];
        // API only provides root-level content.
        return [
          ...dataroomContent.folders.map(f => ({ ...f, type: 'folder' })),
          ...dataroomContent.documents.map(d => ({ ...d, type: 'document' }))
        ];
      }, [dataroomContent]);
    
      return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Manage Permissions for "{link?.name || 'Untitled Link'}"</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <div className="flex items-center justify-between px-2 text-sm font-medium text-muted-foreground">
                <span>Content</span>
                <div className="flex items-center gap-6">
                  <Label>Visible</Label>
                  <Label>Download</Label>
                  <Label>Watermark</Label>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-md border p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  contentItems.map(item => (
                     <PermissionItem
                       key={item.id}
                       item={item}
                       type={item.type}
                       settings={settings}
                       onSettingChange={handleSettingChange}
                     />
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isLoading}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
