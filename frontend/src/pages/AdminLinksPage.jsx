import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Link2,
  Folder,
  FileText,
  Search,
  Trash2,
  MoreVertical,
  Lock,
  Shield,
  Eye,
  Mail,
  CheckCircle2,
  XCircle,
  Copy,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';

import { FileTypeIcon } from '../components/documents/FileTypeIcon';
import { AdminNav } from '../components/admin/AdminNav';
import { AdminLinkInspectDrawer } from '../components/admin/AdminLinkInspectDrawer';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/Avatar';
import { TooltipProvider } from '../components/ui/Tooltip';
import { Select } from '../components/ui/Select';
import { Pagination } from '../components/ui/Pagination';
import { formatDate, formatRelativeTime, getAvatarInitial } from '../utils/formatters';
import {
  getAdminLinks,
  getAdminLink,
  updateAdminLink,
  deleteAdminLink,
} from '../services/api';

export function AdminLinksPage() {
  const { t } = useTranslation();

  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('created');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const [kpiMetrics, setKpiMetrics] = useState({
    totalLinks: 0,
    activeLinks: 0,
    dataroomLinks: 0,
    documentLinks: 0,
  });

  const statusLabels = {
    active: t('admin.statusActive'),
    revoked: t('admin.statusRevoked'),
    expired: t('admin.statusExpired'),
  };

  // Request tracking to prevent race conditions
  const fetchRequestIdRef = useRef(0);
  const inspectRequestIdRef = useRef(0);

  // Drawer inspection state
  const [selectedLink, setSelectedLink] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  // Deletion modal state
  const [linkToDelete, setLinkToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    const requestId = ++fetchRequestIdRef.current;
    try {
      const params = {
        page: currentPage,
        sort: sortField,
        direction: sortDirection,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }
      if (targetTypeFilter !== 'all') {
        params.target_type = targetTypeFilter;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await getAdminLinks(params);
      if (requestId !== fetchRequestIdRef.current) return;

      const data = response.data;
      setLinks(data.results || []);
      setTotalCount(data.count || 0);
      setTotalPages(data.total_pages || 1);

      if (data.metrics) {
        setKpiMetrics({
          totalLinks: data.metrics.total_links ?? 0,
          activeLinks: data.metrics.active_links ?? 0,
          dataroomLinks: data.metrics.dataroom_links ?? 0,
          documentLinks: data.metrics.document_links ?? 0,
        });
      }
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) return;
      console.error('Failed to fetch admin share links:', error);
      if (error?.response?.status === 404 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        toast.error(t('admin.fetchLinksError'));
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentPage, debouncedSearch, targetTypeFilter, statusFilter, sortField, sortDirection, t]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleInspectLink = async (link) => {
    setIsDrawerOpen(true);
    setIsLoadingDetail(true);
    setSelectedLink(link);
    const requestId = ++inspectRequestIdRef.current;
    try {
      const res = await getAdminLink(link.id);
      if (requestId === inspectRequestIdRef.current) {
        setSelectedLink(res.data);
      }
    } catch (err) {
      if (requestId === inspectRequestIdRef.current) {
        console.error('Failed to fetch link detail:', err);
        toast.error(t('admin.loadLinkDetailError'));
        setSelectedLink(null);
        setIsDrawerOpen(false);
      }
    } finally {
      if (requestId === inspectRequestIdRef.current) {
        setIsLoadingDetail(false);
      }
    }
  };

  const handleToggleActive = async (link) => {
    setIsTogglingActive(true);
    const newActiveState = !link.is_active;
    try {
      await updateAdminLink(link.id, { is_active: newActiveState });
      toast.success(
        newActiveState
          ? t('admin.linkReactivatedSuccess')
          : t('admin.linkRevokedSuccess')
      );

      // Refresh drawer state if open
      if (selectedLink && selectedLink.id === link.id) {
        setSelectedLink((prev) => (prev && prev.id === link.id ? {
          ...prev,
          is_active: newActiveState,
          status: newActiveState ? (prev.is_expired ? 'expired' : 'active') : 'revoked',
        } : prev));
      }

      fetchLinks();
    } catch (err) {
      console.error('Failed to toggle link activation:', err);
      toast.error(t('admin.linkStatusUpdateError'));
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleDeleteLink = async () => {
    if (!linkToDelete) return;
    setIsDeleting(true);
    try {
      await deleteAdminLink(linkToDelete.id);
      toast.success(t('admin.linkDeletedSuccess', { name: linkToDelete.name || linkToDelete.slug || '' }));
      setLinkToDelete(null);
      if (selectedLink?.id === linkToDelete.id) {
        setIsDrawerOpen(false);
        setSelectedLink(null);
      }
      if (links.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else {
        fetchLinks();
      }
    } catch (err) {
      console.error('Failed to delete link:', err);
      toast.error(t('admin.linkDeleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyLink = async (link) => {
    const url = `${window.location.origin}/view/${link.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('common.copied'));
    } catch (err) {
      console.error('Failed to copy link:', err);
      toast.error(t('common.copyFailed'));
    }
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <AdminNav />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('admin.linksTitle')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('admin.linksSubtitle')}
            </p>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Links */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('admin.totalLinks')}
              </span>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{kpiMetrics.totalLinks}</p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Link2 className="h-5 w-5" />
            </div>
          </div>

          {/* Active Links */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('admin.kpiActiveLinks')}
              </span>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{kpiMetrics.activeLinks}</p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          {/* Dataroom Links */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('admin.kpiDataroomLinks')}
              </span>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{kpiMetrics.dataroomLinks}</p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Folder className="h-5 w-5" />
            </div>
          </div>

          {/* Document Links */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('admin.kpiDocumentLinks')}
              </span>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{kpiMetrics.documentLinks}</p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('admin.searchLinksPlaceholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Target Type Filter */}
            <Select
              value={targetTypeFilter}
              aria-label={t('admin.filterAllTypes')}
              onChange={(e) => {
                setTargetTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-40 text-sm"
            >
              <option value="all">{t('admin.filterAllTypes')}</option>
              <option value="document">{t('admin.filterDocuments')}</option>
              <option value="dataroom">{t('admin.filterDatarooms')}</option>
            </Select>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              aria-label={t('admin.filterAllStatuses')}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-36 text-sm"
            >
              <option value="all">{t('admin.filterAllStatuses')}</option>
              <option value="active">{t('admin.statusActive')}</option>
              <option value="revoked">{t('admin.statusRevoked')}</option>
              <option value="expired">{t('admin.statusExpired')}</option>
            </Select>
          </div>
        </div>

        {/* Links Table */}
        <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground select-none">
                <tr>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2"
                      onClick={() => handleSort('name')}
                    >
                      {t('admin.link')}
                    </button>
                  </th>
                  <th className="px-4 py-3">{t('admin.creator')}</th>
                  <th className="px-4 py-3">{t('admin.securityGates')}</th>
                  <th className="px-4 py-3 text-center">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1 font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2"
                      onClick={() => handleSort('view_count')}
                    >
                      {t('admin.views')}
                    </button>
                  </th>
                  <th className="px-4 py-3">{t('common.status')}</th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2"
                      onClick={() => handleSort('created')}
                    >
                      {t('admin.created')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4"><Skeleton className="h-4 w-48" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-4 text-center"><Skeleton className="h-4 w-10 mx-auto" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-4 text-right"><Skeleton className="h-8 w-8 ml-auto" /></td>
                    </tr>
                  ))
                ) : links.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <Link2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                      <p className="font-medium">{t('admin.noLinksFound')}</p>
                      <p className="text-xs mt-1 text-muted-foreground">
                        {t('admin.noLinksFoundDesc')}
                      </p>
                    </td>
                  </tr>
                ) : (
                  links.map((link) => {
                    const isRoom = link.target_type === 'dataroom';
                    return (
                      <tr
                        key={link.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => handleInspectLink(link)}
                      >
                        {/* Link & Target info */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                              <FileTypeIcon
                                type={isRoom ? 'folder' : (link.document_type || link.target_name)}
                                className="h-4 w-4 shrink-0"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate max-w-xs sm:max-w-sm">
                                {link.name || link.slug}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs sm:max-w-sm" title={link.target_name}>
                                {link.target_name || (isRoom ? t('admin.dataroom') : t('admin.document'))}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Creator */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={link.created_by?.avatar_url} />
                              <AvatarFallback className="text-[10px]">
                                {getAvatarInitial(link.created_by?.name || link.created_by?.email || 'U')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-foreground truncate max-w-[140px]">
                              {link.created_by?.name || link.created_by?.email || '-'}
                            </span>
                          </div>
                        </td>

                        {/* Security Gates */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {link.has_password && (
                              <span title={t('admin.password')}>
                                <Lock className="h-3.5 w-3.5 text-amber-600" />
                              </span>
                            )}
                            {link.require_nda && (
                              <span title={t('admin.requireNda')}>
                                <Shield className="h-3.5 w-3.5 text-indigo-600" />
                              </span>
                            )}
                            {link.enable_watermark && (
                              <span title={t('admin.watermark')}>
                                <Eye className="h-3.5 w-3.5 text-blue-600" />
                              </span>
                            )}
                            {link.requires_email && (
                              <span title={t('admin.requiresEmail')}>
                                <Mail className="h-3.5 w-3.5 text-purple-600" />
                              </span>
                            )}
                            {!link.has_password && !link.require_nda && !link.enable_watermark && !link.requires_email && (
                              <span className="text-xs text-muted-foreground/60">—</span>
                            )}
                          </div>
                        </td>

                        {/* Views & Last Viewed */}
                        <td className="px-4 py-3 text-center">
                          <div className="font-semibold text-foreground text-xs">{link.view_count || 0}</div>
                          {link.last_viewed_at && (
                            <div className="text-[10px] text-muted-foreground">
                              {formatRelativeTime(link.last_viewed_at)}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              link.status === 'active'
                                ? 'success'
                                : link.status === 'revoked'
                                ? 'destructive'
                                : 'warning'
                            }
                            className="capitalize text-[11px]"
                          >
                            {statusLabels[link.status] || link.status}
                          </Badge>
                        </td>

                        {/* Created Date */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(link.created_at)}
                        </td>

                        {/* Row Actions */}
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                aria-label={t('common.actions')}
                              >
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">{t('common.actions')}</span>
                              </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                align="end"
                                className="w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md z-50 text-xs"
                              >
                                <DropdownMenu.Item
                                  onClick={() => handleInspectLink(link)}
                                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground outline-none"
                                >
                                  <SlidersHorizontal className="h-3.5 w-3.5" />
                                  <span>{t('admin.inspectLink')}</span>
                                </DropdownMenu.Item>

                                <DropdownMenu.Item
                                  onClick={() => handleToggleActive(link)}
                                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground outline-none"
                                >
                                  {link.is_active ? (
                                    <>
                                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                                      <span>{t('admin.revokeLink')}</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                      <span>{t('admin.reactivateLink')}</span>
                                    </>
                                  )}
                                </DropdownMenu.Item>

                                <DropdownMenu.Item
                                  onClick={() => handleCopyLink(link)}
                                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground outline-none"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>{t('common.copyLink')}</span>
                                </DropdownMenu.Item>

                                <DropdownMenu.Separator className="my-1 h-px bg-border" />

                                <DropdownMenu.Item
                                  onClick={() => setLinkToDelete(link)}
                                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm text-destructive hover:bg-destructive/10 outline-none"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>{t('common.deleteLink')}</span>
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="p-4 border-t bg-muted/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {t('admin.paginationShowing', {
                  start: (currentPage - 1) * pageSize + 1,
                  end: Math.min(currentPage * pageSize, totalCount),
                  total: totalCount,
                })}
              </span>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>

        {/* Slide-over Inspect Drawer */}
        <AdminLinkInspectDrawer
          isOpen={isDrawerOpen}
          onOpenChange={(open) => {
            setIsDrawerOpen(open);
            if (!open) {
              inspectRequestIdRef.current++;
              setSelectedLink(null);
            }
          }}
          link={selectedLink}
          isLoading={isLoadingDetail}
          onToggleActive={handleToggleActive}
          isToggling={isTogglingActive}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={!!linkToDelete}
          onOpenChange={() => setLinkToDelete(null)}
          title={t('admin.deleteLinkConfirmTitle')}
          description={t('admin.deleteLinkConfirmDesc', {
            name: linkToDelete?.name || linkToDelete?.slug || '',
          })}
          onConfirm={handleDeleteLink}
          confirmText={t('common.delete')}
          isLoading={isDeleting}
        />
      </div>
    </TooltipProvider>
  );
}

export default AdminLinksPage;
