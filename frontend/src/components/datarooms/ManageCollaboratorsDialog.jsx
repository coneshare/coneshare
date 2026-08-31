import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  UserPlus,
  Crown,
  Trash2,
  LogOut,
  Search,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';
import { useUser } from '../../contexts/UserProvider';
import {
  getDataroomCollaborators,
  addDataroomCollaborators,
  removeDataroomCollaborator,
  getEligibleCollaborators,
  getAdminDataroomCollaborators,
  addAdminDataroomCollaborators,
  removeAdminDataroomCollaborator,
  getAdminEligibleCollaborators,
} from '../../services/api';
import { getAvatarInitial, isDataroomOwner } from '../../utils/formatters';
import { useDebounce } from '../../hooks/useDebounce';

export function ManageCollaboratorsDialog({
  isOpen,
  onOpenChange,
  dataroom,
  onCollaboratorsUpdated,
  isAdmin = false,
}) {
  const { t } = useTranslation();
  const { user: currentUser } = useUser();
  const navigate = useNavigate();

  const [collaboratorsData, setCollaboratorsData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Modals for actions
  const [collabToRemove, setCollabToRemove] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isLeavingDataroom, setIsLeavingDataroom] = useState(false);

  const isOwner = isDataroomOwner(dataroom, currentUser);
  const isOrgAdmin = currentUser?.role === 'admin';
  const canManage = isOwner || isOrgAdmin || isAdmin;

  const fetchCollaborators = useCallback(async () => {
    if (!dataroom?.id) return;
    setIsLoading(true);
    try {
      const fetchFn = isAdmin ? getAdminDataroomCollaborators : getDataroomCollaborators;
      const res = await fetchFn(dataroom.id);
      setCollaboratorsData(res.data);
    } catch (err) {
      // Handled by api interceptor
    } finally {
      setIsLoading(false);
    }
  }, [dataroom?.id, isAdmin]);

  const fetchEligibleUsers = useCallback(async (q = '') => {
    if (!dataroom?.id || !canManage) return;
    setIsSearching(true);
    try {
      const fetchFn = isAdmin ? getAdminEligibleCollaborators : getEligibleCollaborators;
      const res = await fetchFn(dataroom.id, q);
      setEligibleUsers(res.data || []);
    } catch (err) {
      // Handled by api interceptor
    } finally {
      setIsSearching(false);
    }
  }, [dataroom?.id, canManage, isAdmin]);

  useEffect(() => {
    if (isOpen && dataroom?.id) {
      fetchCollaborators();
      if (canManage) {
        fetchEligibleUsers(debouncedSearch);
      }
    }
  }, [isOpen, dataroom?.id, canManage, debouncedSearch, fetchCollaborators, fetchEligibleUsers]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setSelectedUserIds([]);
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const toggleSelectUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddCollaborators = async () => {
    if (selectedUserIds.length === 0) return;
    setIsAdding(true);
    try {
      if (isAdmin) {
        await addAdminDataroomCollaborators(dataroom.id, selectedUserIds);
      } else {
        await addDataroomCollaborators(dataroom.id, { user_ids: selectedUserIds });
      }
      toast.success(t('datarooms.addedCollaboratorsSuccess'));
      setSelectedUserIds([]);
      setSearchQuery('');
      await fetchCollaborators();
      await fetchEligibleUsers('');
      if (onCollaboratorsUpdated) onCollaboratorsUpdated();
    } catch (err) {
      // Error handled by interceptor
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveCollaborator = async () => {
    if (!collabToRemove) return;
    setIsRemoving(true);
    try {
      const removeFn = isAdmin ? removeAdminDataroomCollaborator : removeDataroomCollaborator;
      await removeFn(dataroom.id, collabToRemove.user.id);
      toast.success(t('datarooms.removeCollaboratorSuccess'));
      setCollabToRemove(null);
      await fetchCollaborators();
      await fetchEligibleUsers(searchQuery);
      if (onCollaboratorsUpdated) onCollaboratorsUpdated();
    } catch (err) {
      // Handled by interceptor
    } finally {
      setIsRemoving(false);
    }
  };

  const handleLeaveDataroom = async () => {
    if (!currentUser?.id) return;
    setIsRemoving(true);
    try {
      await removeDataroomCollaborator(dataroom.id, currentUser.id);
      toast.success(t('datarooms.leaveDataroomSuccess'));
      setIsLeavingDataroom(false);
      onOpenChange(false);
      if (onCollaboratorsUpdated) onCollaboratorsUpdated();
    } catch (err) {
      // Handled by interceptor
    } finally {
      setIsRemoving(false);
    }
  };

  const owner = collaboratorsData?.owner || dataroom?.owner;
  const collaboratorsList = collaboratorsData?.collaborators || dataroom?.collaborators || [];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md md:max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              <UserPlus className="h-5 w-5 text-primary" />
              {t('datarooms.manageCollaborators')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t('datarooms.inviteCollaboratorsDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {dataroom?.storage_version === 1 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{t('datarooms.legacyStorageTitle')}</p>
                    <p className="mt-0.5 leading-relaxed">{t('datarooms.upgradeRequiredForCollaboration')}</p>
                  </div>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-7 px-2.5 text-xs border-amber-300 bg-amber-100/50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/datarooms/${dataroom.id}?tab=settings`);
                    }}
                  >
                    {t('datarooms.goToSettings')}
                  </Button>
                )}
              </div>
            )}

            {/* Add Collaborators section (Owner / Org Admin only, v2 only) */}
            {canManage && dataroom?.storage_version !== 1 && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <label className="text-sm font-medium text-foreground">
                  {t('datarooms.addCollaborator')}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('datarooms.searchMembersPlaceholder')}
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="pl-9 bg-background"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* Eligible members dropdown / multi-select list */}
                {eligibleUsers.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-background divide-y">
                    {eligibleUsers.map((u) => {
                      const isSelected = selectedUserIds.includes(u.id);
                      return (
                        <button
                          type="button"
                          key={u.id}
                          onClick={() => toggleSelectUser(u.id)}
                          className={`w-full flex items-center justify-between p-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                            isSelected ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar className="h-7 w-7 rounded-full">
                              {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                              <AvatarFallback className="text-[10px]">
                                {getAvatarInitial(u.name, u.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium truncate text-xs sm:text-sm">
                                {u.name || u.email}
                              </p>
                              {u.name && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {u.email}
                                </p>
                              )}
                            </div>
                          </div>
                          <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/40'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : searchQuery ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t('datarooms.noEligibleMembers')}
                  </p>
                ) : null}

                {/* Selected chips and Submit button */}
                {selectedUserIds.length > 0 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {selectedUserIds.length} selected
                    </span>
                    <Button
                      size="sm"
                      onClick={handleAddCollaborators}
                      disabled={isAdding}
                      className="gap-1.5"
                    >
                      {isAdding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t('datarooms.addCollaborators')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Current Members Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  {t('datarooms.collaborators')}
                </h4>
                <span className="text-xs text-muted-foreground">
                  {t('datarooms.collaboratorsCount', { count: (collaboratorsList.length || 0) + (owner ? 1 : 0) })}
                </span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="divide-y rounded-lg border bg-card">
                  {/* Owner Row */}
                  {owner && (
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar className="h-9 w-9 rounded-full border border-amber-500/50">
                            {owner.avatar_url && <AvatarImage src={owner.avatar_url} />}
                            <AvatarFallback className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-xs font-semibold">
                              {getAvatarInitial(owner.name, owner.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white">
                            <Crown className="h-2.5 w-2.5" />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate">
                              {owner.name || owner.email}
                            </span>
                            {owner.id === currentUser?.id && (
                              <Badge className="bg-muted text-[10px] py-0 px-1 font-normal text-muted-foreground">
                                {t('datarooms.youBadge')}
                              </Badge>
                            )}
                          </div>
                          {owner.name && (
                            <p className="text-xs text-muted-foreground truncate">{owner.email}</p>
                          )}
                        </div>
                      </div>
                      <Badge className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-medium gap-1">
                        <Crown className="h-3 w-3" />
                        {t('datarooms.ownerRole')}
                      </Badge>
                    </div>
                  )}

                  {/* Collaborator Rows */}
                  {collaboratorsList.map((collab) => {
                    const memberUser = collab.user || {};
                    const isSelf = memberUser.id === currentUser?.id;
                    return (
                      <div
                        key={collab.id || memberUser.id}
                        className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9 rounded-full border">
                            {memberUser.avatar_url && <AvatarImage src={memberUser.avatar_url} />}
                            <AvatarFallback className="text-xs">
                              {getAvatarInitial(memberUser.name, memberUser.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm truncate">
                                {memberUser.name || memberUser.email}
                              </span>
                              {isSelf && (
                                <Badge className="bg-muted text-[10px] py-0 px-1 font-normal text-muted-foreground">
                                  {t('datarooms.youBadge')}
                                </Badge>
                              )}
                            </div>
                            {memberUser.name && (
                              <p className="text-xs text-muted-foreground truncate">
                                {memberUser.email}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-normal">
                            {t('datarooms.collaboratorRole')}
                          </Badge>

                          {/* Action buttons */}
                          {canManage && !isSelf && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                title={t('datarooms.removeCollaborator')}
                                onClick={() => setCollabToRemove(collab)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          {isSelf && !isOwner && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 gap-1 px-2"
                              onClick={() => setIsLeavingDataroom(true)}
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              {t('datarooms.leaveDataroom')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Removing Collaborator */}
      <ConfirmationDialog
        isOpen={!!collabToRemove}
        onOpenChange={() => setCollabToRemove(null)}
        title={t('datarooms.removeCollaboratorConfirm', {
          name: collabToRemove?.user?.name || collabToRemove?.user?.email,
        })}
        description={t('datarooms.removeCollaboratorDesc')}
        onConfirm={handleRemoveCollaborator}
        confirmText={t('common.delete')}
        isLoading={isRemoving}
      />

      {/* Confirmation Dialog for Leaving Dataroom */}
      <ConfirmationDialog
        isOpen={isLeavingDataroom}
        onOpenChange={setIsLeavingDataroom}
        title={t('datarooms.leaveDataroomConfirm', { name: dataroom?.name })}
        description={t('datarooms.leaveDataroomDesc')}
        onConfirm={handleLeaveDataroom}
        confirmText={t('datarooms.leaveDataroom')}
        isLoading={isRemoving}
      />
    </>
  );
}
