import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Search, Loader2, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';
import { getEligibleCollaborators, transferDataroomOwnership } from '../../services/api';
import { getAvatarInitial } from '../../utils/formatters';
import { useDebounce } from '../../hooks/useDebounce';

export function TransferOwnershipDialog({
  isOpen,
  onOpenChange,
  dataroom,
  onSuccess,
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const fetchUsers = useCallback(async (query = '') => {
    if (!dataroom?.id) return;
    setIsLoading(true);
    try {
      const res = await getEligibleCollaborators(dataroom.id, query);
      setEligibleUsers(res.data || []);
    } catch (err) {
      // Handled by api interceptor
    } finally {
      setIsLoading(false);
    }
  }, [dataroom?.id]);

  useEffect(() => {
    if (isOpen && dataroom?.id) {
      fetchUsers(debouncedSearch);
    }
  }, [isOpen, dataroom?.id, debouncedSearch, fetchUsers]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedUser(null);
    }
  }, [isOpen]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleConfirmTransfer = async () => {
    if (!selectedUser || !dataroom?.id) return;
    setIsTransferring(true);
    try {
      await transferDataroomOwnership(dataroom.id, selectedUser.id);
      toast.success(t('datarooms.transferOwnershipSuccess'));
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled by interceptor
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <ArrowRightLeft className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            {t('datarooms.transferOwnershipTitle')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {t('datarooms.transferOwnershipModalDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('datarooms.searchMembersPlaceholder')}
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-9"
              autoFocus
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('datarooms.selectNewOwner')}
            </label>
            {eligibleUsers.length === 0 && !isLoading ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                {t('datarooms.noEligibleMembersFound')}
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
                {eligibleUsers.map((u) => {
                  const isSelected = selectedUser?.id === u.id;
                  return (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={`w-full flex items-center justify-between p-3 cursor-pointer transition-colors text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                        isSelected
                          ? 'bg-primary/10 border-l-4 border-l-primary'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8">
                          {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                          <AvatarFallback className="text-xs">
                            {getAvatarInitial(u.name, u.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {u.name || u.email}
                          </p>
                          {u.name && (
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedUser && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t('datarooms.transferOwnershipConfirm')}</p>
                <p className="mt-0.5">
                  {t('datarooms.transferOwnershipDesc', {
                    name: selectedUser.name || selectedUser.email,
                  })}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isTransferring}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmTransfer}
            disabled={!selectedUser || isTransferring}
            className="gap-1.5"
          >
            {isTransferring && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('datarooms.transferOwnershipConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
