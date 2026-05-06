import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function AccessOwnerCard({ publicMeta }) {
  if (!publicMeta) return null;

  const {
    owner_name: ownerName,
    owner_email_masked: ownerEmailMasked,
    owner_avatar_url: ownerAvatarUrl,
    target_type: targetType,
    target_name: targetName,
  } = publicMeta;
  const displayEmail = ownerEmailMasked;
  const actor = `${ownerName || 'Someone'}${displayEmail ? ` (${displayEmail})` : ''}`;
  const message = targetType === 'dataroom'
    ? `${actor} invited you to the dataroom "${targetName || ''}"`
    : `${actor} shared "${targetName || ''}"`;

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={ownerAvatarUrl || ''} alt={ownerName || 'Owner'} />
          <AvatarFallback>{getInitials(ownerName || 'Owner')}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{ownerName || 'Shared by owner'}</p>
          {ownerEmailMasked ? (
            <p className="truncate text-xs text-gray-600">{ownerEmailMasked}</p>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-700">{message}</p>
    </div>
  );
}
