import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';
import { FileText, Folder } from 'lucide-react';

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

  return (
    <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50/50 p-5">
      {/* Owner Section */}
      <div className="flex items-center gap-3 mb-4">
        <Avatar className="h-10 w-10 ring-2 ring-gray-100">
          <AvatarImage src={ownerAvatarUrl || ''} alt={ownerName || 'Owner'} />
          <AvatarFallback>{getInitials(ownerName || 'Owner')}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Owner</p>
          <p className="truncate text-sm font-semibold text-gray-900">{ownerName || 'Document Owner'}</p>
          {ownerEmailMasked && (
            <p className="truncate text-xs text-gray-500">{ownerEmailMasked}</p>
          )}
        </div>
      </div>
      
      {/* Target Document Section */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          {targetType === 'dataroom' ? 'Dataroom Access' : 'Document Preview'}
        </p>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
            {targetType === 'dataroom' ? (
              <Folder className="h-5 w-5" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 truncate flex-1" title={targetName}>
            {targetName || 'Untitled Link'}
          </p>
        </div>
      </div>
    </div>
  );
}
