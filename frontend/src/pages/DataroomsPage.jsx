import { Button } from '../components/ui/Button';
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical, Pencil, Share2, Trash2, Users, LogOut, Crown, Folder } from 'lucide-react';
import { toast } from 'sonner';
import { AddDataroomDialog } from '../components/datarooms/AddDataroomDialog';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { RenameItemDialog } from '../components/dialogs/RenameItemDialog';
import { PlusIcon } from '../components/icons/PlusIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { Badge } from '../components/ui/Badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/Avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/Tooltip';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { getDatarooms, deleteDataroom, removeDataroomCollaborator } from '../services/api';
import { useUser } from '../contexts/UserProvider';
import { formatDate, getAvatarInitial, isDataroomOwner, isDataroomCollaborator } from '../utils/formatters';

export function DataroomsPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentScope = searchParams.get('scope') || 'all';
  const [datarooms, setDatarooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDataroomOpen, setIsAddDataroomOpen] = useState(false);
  const [dataroomToDelete, setDataroomToDelete] = useState(null);
  const [dataroomToLeave, setDataroomToLeave] = useState(null);
  const [dataroomToRename, setDataroomToRename] = useState(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const fetchDatarooms = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = currentScope !== 'all' ? { scope: currentScope } : {};
      const response = await getDatarooms(params);
      setDatarooms(response.data);
    } catch (error) {
      // Error toast is handled by api interceptor
    } finally {
      setIsLoading(false);
    }
  }, [currentScope]);

  useEffect(() => {
    fetchDatarooms();
  }, [fetchDatarooms]);

  const handleScopeChange = (scope) => {
    setSearchParams(scope === 'all' ? {} : { scope });
  };

  const handleSuccess = () => {
    setIsAddDataroomOpen(false);
    fetchDatarooms();
  };

  const handleDeleteDataroom = async () => {
    if (!dataroomToDelete) return;
    try {
      await deleteDataroom(dataroomToDelete.id);
      toast.success(t('datarooms.deleteSuccess', { name: dataroomToDelete.name }));
      setDataroomToDelete(null);
      await fetchDatarooms();
    } catch (error) {
      // Error toast handled by interceptor
    }
  };

  const handleLeaveDataroom = async () => {
    if (!dataroomToLeave || !currentUser?.id) return;
    setIsLeaving(true);
    try {
      await removeDataroomCollaborator(dataroomToLeave.id, currentUser.id);
      toast.success(t('datarooms.leaveDataroomSuccess'));
      setDataroomToLeave(null);
      await fetchDatarooms();
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsLeaving(false);
    }
  };

  const isOrgAdmin = currentUser?.role === 'admin';

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('datarooms.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('datarooms.addDescription')}
          </p>
        </div>
        <Button onClick={() => setIsAddDataroomOpen(true)} className="gap-2">
          <PlusIcon className="h-4 w-4" />
          {t('datarooms.addDataroom')}
        </Button>
      </div>

      {/* Scope Filter Tabs */}
      <Tabs value={currentScope} onValueChange={handleScopeChange} className="w-full">
        <TabsList className="grid grid-cols-3 sm:inline-flex w-full sm:w-auto">
          <TabsTrigger value="all">{t('datarooms.allDatarooms')}</TabsTrigger>
          <TabsTrigger value="created_by_me">{t('datarooms.createdByMe')}</TabsTrigger>
          <TabsTrigger value="shared_with_me">{t('datarooms.sharedWithMe')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-xs space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="pt-2 flex items-center justify-between">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : datarooms.length === 0 ? (
        currentScope === 'shared_with_me' ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted bg-muted/20 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">{t('datarooms.noSharedDatarooms')}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
              {t('datarooms.noSharedDataroomsNotice')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted bg-muted/20 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
              <Folder className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">
              {currentScope === 'created_by_me' ? t('datarooms.noDatarooms') : t('datarooms.noDataroomsFound')}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
              {t('datarooms.getStartedNotice')}
            </p>
            <Button className="mt-5 gap-2" onClick={() => setIsAddDataroomOpen(true)}>
              <PlusIcon className="h-4 w-4" />
              {t('datarooms.addDataroom')}
            </Button>
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {datarooms.map((dataroom) => {
            const isOwner = isDataroomOwner(dataroom, currentUser);
            const isCollaborator = isDataroomCollaborator(dataroom, currentUser);
            const canDelete = isOwner || isOrgAdmin;

            return (
              <div
                key={dataroom.id}
                role="button"
                tabIndex={0}
                className="group relative flex flex-col justify-between cursor-pointer rounded-xl border bg-card p-5 text-card-foreground shadow-xs hover:border-primary/40 hover:shadow-md transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => navigate(`/datarooms/${dataroom.id}`)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/datarooms/${dataroom.id}`);
                  }
                }}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Folder className="h-4 w-4" />
                      </div>
                      <h3 className="font-semibold text-base truncate" title={dataroom.name}>
                        {dataroom.name}
                      </h3>
                    </div>

                    <div className="shrink-0 -mr-2 -mt-1">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">{t('common.actions')}</span>
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content
                          className="z-50 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
                          sideOffset={5}
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu.Item
                            onClick={() => setDataroomToRename(dataroom)}
                            className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                          >
                            <Pencil className="h-4 w-4" />
                            <span>{t('documents.rename')}</span>
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onClick={() => navigate(`/datarooms/${dataroom.id}?tab=links&openCreateLink=true`)}
                            className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                          >
                            <Share2 className="h-4 w-4" />
                            <span>{t('documents.share')}</span>
                          </DropdownMenu.Item>

                          <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />

                          {canDelete ? (
                            <DropdownMenu.Item
                              onClick={() => setDataroomToDelete(dataroom)}
                              className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-400 hover:dark:bg-red-900/50 focus:dark:bg-red-900/50"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>{t('common.delete')}</span>
                            </DropdownMenu.Item>
                          ) : (
                            <DropdownMenu.Item
                              onClick={() => setDataroomToLeave(dataroom)}
                              className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-400 hover:dark:bg-red-900/50 focus:dark:bg-red-900/50"
                            >
                              <LogOut className="h-4 w-4" />
                              <span>{t('datarooms.leaveDataroom')}</span>
                            </DropdownMenu.Item>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </div>

                  {/* Owner & Collaborators Information */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    {dataroom.owner ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 min-w-0 cursor-default">
                            <Avatar className="h-5 w-5 rounded-full border">
                              {dataroom.owner.avatar_url && <AvatarImage src={dataroom.owner.avatar_url} />}
                              <AvatarFallback className="text-[9px]">
                                {getAvatarInitial(dataroom.owner.name, dataroom.owner.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate max-w-[120px]">
                              {dataroom.owner.id === currentUser?.id ? t('datarooms.youBadge') : (dataroom.owner.name || dataroom.owner.email?.split('@')[0])}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs space-y-0.5">
                            <p className="font-semibold">{dataroom.owner.name || dataroom.owner.email}</p>
                            {dataroom.owner.email && <p className="text-muted-foreground">{dataroom.owner.email}</p>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span>{t('datarooms.createdOn', { date: formatDate(dataroom.created_at, 'PP') })}</span>
                    )}

                    {dataroom.collaborator_count > 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span>{dataroom.collaborator_count}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Badges */}
                <div className="flex items-center justify-between border-t pt-3 mt-4 text-xs">
                  <span className="text-muted-foreground">
                    {formatDate(dataroom.updated_at || dataroom.created_at, 'PP')}
                  </span>

                  {(isOwner || isCollaborator) && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-normal ${
                        isOwner
                          ? 'border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-indigo-500/30 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
                      }`}
                    >
                      {isOwner ? (
                        <>
                          <Crown className="h-3 w-3 mr-1 text-amber-600 dark:text-amber-400" />
                          {t('datarooms.ownerRole', { defaultValue: 'Owner' })}
                        </>
                      ) : (
                        <>
                          <Users className="h-3 w-3 mr-1 text-indigo-600 dark:text-indigo-400" />
                          {t('datarooms.collaboratorRole', { defaultValue: 'Collaborator' })}
                        </>
                      )}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddDataroomDialog
        isOpen={isAddDataroomOpen}
        onOpenChange={setIsAddDataroomOpen}
        onSuccess={handleSuccess}
      />
      <ConfirmationDialog
        isOpen={!!dataroomToDelete}
        onOpenChange={() => setDataroomToDelete(null)}
        title={t('datarooms.deleteConfirmTitle', { name: dataroomToDelete?.name })}
        description={t('datarooms.deleteConfirmDescription')}
        onConfirm={handleDeleteDataroom}
        confirmText={t('common.delete')}
      />
      <ConfirmationDialog
        isOpen={!!dataroomToLeave}
        onOpenChange={() => setDataroomToLeave(null)}
        title={t('datarooms.leaveDataroomConfirm', { name: dataroomToLeave?.name })}
        description={t('datarooms.leaveDataroomDesc')}
        onConfirm={handleLeaveDataroom}
        confirmText={t('datarooms.leaveDataroom')}
        isLoading={isLeaving}
      />
      <RenameItemDialog
        isOpen={!!dataroomToRename}
        onOpenChange={() => setDataroomToRename(null)}
        onSuccess={fetchDatarooms}
        item={dataroomToRename ? { ...dataroomToRename, type: 'Dataroom' } : null}
      />
    </div>
    </TooltipProvider>
  );
}

