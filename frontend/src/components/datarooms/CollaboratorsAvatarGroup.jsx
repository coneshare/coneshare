import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Crown, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { ManageCollaboratorsDialog } from './ManageCollaboratorsDialog';
import { getAvatarInitial } from '../../utils/formatters';

export function CollaboratorsAvatarGroup({
  dataroom,
  onCollaboratorsUpdated,
  className = '',
}) {
  const { t } = useTranslation();
  const [isManageOpen, setIsManageOpen] = useState(false);

  if (!dataroom) return null;

  const owner = dataroom.owner;
  const collaborators = dataroom.collaborators || [];
  const maxVisible = 4;
  const allMembers = [
    ...(owner ? [{ ...owner, isOwner: true }] : []),
    ...collaborators.map((c) => ({
      ...(c.user || {}),
      isOwner: false,
      collaboratorRecord: c,
    })),
  ];

  const visibleMembers = allMembers.slice(0, maxVisible);
  const remainingCount = allMembers.length - visibleMembers.length;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex items-center -space-x-2 overflow-hidden py-1 cursor-pointer"
        onClick={() => setIsManageOpen(true)}
        title={t('datarooms.manageCollaborators')}
      >
        {visibleMembers.map((member, index) => {
          const initial = getAvatarInitial(member.name, member.email);
          return (
            <div
              key={member.id || index}
              className="relative transition-transform hover:scale-110 hover:z-20"
              title={`${member.name || member.email}${member.isOwner ? ` (${t('datarooms.ownerRole')})` : ` (${t('datarooms.collaboratorRole')})`}`}
            >
              <Avatar className={`h-8 w-8 rounded-full border-2 border-background ring-1 ${member.isOwner ? 'ring-amber-500/50' : 'ring-border'}`}>
                {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name || member.email} />}
                <AvatarFallback className={`text-[10px] font-medium ${member.isOwner ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>
                  {initial}
                </AvatarFallback>
              </Avatar>
              {member.isOwner && (
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
                  <Crown className="h-2 w-2" />
                </span>
              )}
            </div>
          );
        })}

        {remainingCount > 0 && (
          <div
            className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-medium text-muted-foreground ring-1 ring-border transition-transform hover:scale-110 hover:z-20"
            title={t('datarooms.moreMembers', { count: remainingCount })}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setIsManageOpen(true)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        <span>{t('datarooms.collaborators')}</span>
      </Button>

      <ManageCollaboratorsDialog
        isOpen={isManageOpen}
        onOpenChange={setIsManageOpen}
        dataroom={dataroom}
        onCollaboratorsUpdated={onCollaboratorsUpdated}
      />
    </div>
  );
}
