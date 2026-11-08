import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Check,
  Lock,
  Shield,
  Eye,
  Clock,
  Globe,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import { FileTypeIcon } from '../documents/FileTypeIcon';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/Sheet';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { formatDate, formatRelativeTime } from '../../utils/formatters';

export function AdminLinkInspectDrawer({
  link,
  isLoading,
  isOpen,
  onOpenChange,
  onToggleActive,
  isToggling,
}) {
  const { t } = useTranslation();
  const [hasCopied, setHasCopied] = useState(false);

  const statusLabels = {
    active: t('admin.statusActive'),
    revoked: t('admin.statusRevoked'),
    expired: t('admin.statusExpired'),
  };

  if (!link && !isLoading) {
    return null;
  }

  const shareUrl = link
    ? `${window.location.origin}/view/${link.slug}`
    : '';

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setHasCopied(true);
      toast.success(t('common.copied'));
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      toast.error(t('common.copyFailed'));
    }
  };

  const isDataroom = link?.target_type === 'dataroom';

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-6 flex flex-col gap-6">
        <SheetHeader className="space-y-2 border-b pb-4">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileTypeIcon
                  type={isDataroom ? 'folder' : (link?.document_type || link?.target_name)}
                  className="h-5 w-5 shrink-0"
                />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-base font-semibold">
                  {isLoading ? <Skeleton className="h-5 w-40" /> : (link.name || link.target_name || link.slug)}
                </SheetTitle>
                <SheetDescription asChild>
                  <div className="text-xs text-muted-foreground truncate mt-1">
                    {isLoading ? <Skeleton className="h-3 w-28" /> : (link.target_name || (isDataroom ? t('admin.dataroom') : t('admin.document')))}
                  </div>
                </SheetDescription>
              </div>
            </div>

            {!isLoading && (
              <Badge
                variant={
                  link.status === 'active'
                    ? 'success'
                    : link.status === 'revoked'
                    ? 'destructive'
                    : 'warning'
                }
                className="capitalize shrink-0"
              >
                {statusLabels[link.status] || link.status}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="space-y-6 flex-1 text-sm">
            {/* Quick Link Share & Activation Bar */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('admin.shareUrl')}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="h-7 text-xs gap-1.5"
                >
                  {hasCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {hasCopied ? t('common.copied') : t('common.copyLink')}
                </Button>
              </div>
              <div className="rounded border bg-background px-2.5 py-1.5 text-xs font-mono text-muted-foreground break-all select-all">
                {shareUrl}
              </div>

              <div className="flex items-center justify-between pt-1 border-t text-xs">
                <span className="text-muted-foreground">
                  {link.status === 'expired' || link.is_expired
                    ? t('admin.linkExpiredNote')
                    : link.is_active
                    ? t('admin.linkActiveNote')
                    : t('admin.linkRevokedNote')}
                </span>
                <Button
                  size="sm"
                  variant={link.is_active ? 'destructive' : 'default'}
                  onClick={() => onToggleActive(link)}
                  disabled={isToggling}
                  className="h-7 text-xs"
                >
                  {link.is_active
                    ? t('admin.revokeLink')
                    : t('admin.reactivateLink')}
                </Button>
              </div>
            </div>

            {/* Link Metadata & Security Controls */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('admin.securityAndGates')}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between rounded border p-2.5 bg-card">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    {t('admin.password')}
                  </span>
                  <span className="font-medium">{link.has_password ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between rounded border p-2.5 bg-card">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Shield className="h-3.5 w-3.5" />
                    {t('admin.requireNda')}
                  </span>
                  <span className="font-medium">{link.require_nda ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between rounded border p-2.5 bg-card">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" />
                    {t('admin.watermark')}
                  </span>
                  <span className="font-medium">{link.enable_watermark ? t('common.yes') : t('common.no')}</span>
                </div>
                <div className="flex items-center justify-between rounded border p-2.5 bg-card">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    {t('admin.requiresEmail')}
                  </span>
                  <span className="font-medium">{link.requires_email ? t('common.yes') : t('common.no')}</span>
                </div>
              </div>
            </div>

            {/* Creator & Timeline Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('admin.linkOverview')}
              </h4>
              <div className="rounded border bg-card p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('admin.creator')}:</span>
                  <span className="font-medium text-foreground">{link.created_by?.email || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('admin.created')}:</span>
                  <span>{formatDate(link.created_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('admin.expiresAt')}:</span>
                  <span className={link.is_expired ? 'text-amber-600 font-medium' : ''}>
                    {link.expires_at ? formatDate(link.expires_at) : t('common.never')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('admin.totalViews')}:</span>
                  <span className="font-semibold text-foreground">{link.view_count || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('admin.lastViewed')}:</span>
                  <span>{link.last_viewed_at ? formatRelativeTime(link.last_viewed_at) : t('common.never')}</span>
                </div>
              </div>
            </div>

            {/* Recent View Sessions */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('admin.recentVisitors')}
              </h4>

              {(!link.recent_view_sessions || link.recent_view_sessions.length === 0) ? (
                <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
                  {t('admin.noViewsYet')}
                </div>
              ) : (
                <div className="rounded border bg-card divide-y overflow-hidden">
                  {link.recent_view_sessions.map((session) => (
                    <div key={session.id} className="p-2.5 flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {session.viewer_email || t('common.anonymous')}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                          {session.city || session.country ? (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {[session.city, session.country].filter(Boolean).join(', ')}
                            </span>
                          ) : null}
                          {session.duration_seconds > 0 ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {session.duration_seconds}s
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {formatRelativeTime(session.viewed_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
