import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Folder,
  HardDrive,
  Users,
  Search,
  ArrowRightLeft,
  Trash2,
  MoreVertical,
  ExternalLink,
  Layers,
  AlertTriangle,
  Sliders,
  Link2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';

import { AdminNav } from '../components/admin/AdminNav';
import { AdjustStorageQuotaDialog } from '../components/admin/AdjustStorageQuotaDialog';
import { TransferOwnershipDialog } from '../components/datarooms/TransferOwnershipDialog';
import { ManageCollaboratorsDialog } from '../components/datarooms/ManageCollaboratorsDialog';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/Avatar';
import { TooltipProvider } from '../components/ui/Tooltip';
import { Select } from '../components/ui/Select';
import { Progress } from '../components/ui/Progress';
import { Pagination } from '../components/ui/Pagination';
import { formatBytes } from '../lib/formatters';
import { formatDate, formatRelativeTime, getAvatarInitial } from '../utils/formatters';
import {
  getAdminDatarooms,
  deleteAdminDataroom,
  upgradeAdminDataroomStorage,
} from '../services/api';

export function AdminDataroomsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [datarooms, setDatarooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('created');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const [kpiMetrics, setKpiMetrics] = useState({
    totalRooms: 0,
    totalStorageBytes: 0,
    totalActiveLinks: 0,
  });

  // Dialog states
  const [dataroomForQuota, setDataroomForQuota] = useState(null);
  const [dataroomForTransfer, setDataroomForTransfer] = useState(null);
  const [dataroomForCollaborators, setDataroomForCollaborators] = useState(null);
  const [dataroomToDelete, setDataroomToDelete] = useState(null);
  const [dataroomToUpgrade, setDataroomToUpgrade] = useState(null);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset to page 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      const isTextColumn = field === 'name' || field === 'owner';
      setSortDirection(isTextColumn ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  const fetchDatarooms = useCallback(async (isCancelled = () => false) => {
    setIsLoading(true);
    try {
      const orderingParam = sortDirection === 'desc' ? `-${sortField}` : sortField;
      const params = {
        page: currentPage,
        page_size: pageSize,
        ordering: orderingParam,
      };
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const res = await getAdminDatarooms(params);
      if (isCancelled()) return;
      const data = res.data;

      if (data && data.results) {
        setDatarooms(data.results);
        setTotalCount(data.count ?? 0);
        setTotalPages(data.total_pages ?? 1);
        if (data.metrics) {
          setKpiMetrics({
            totalRooms: data.metrics.total_rooms ?? 0,
            totalStorageBytes: data.metrics.total_storage_bytes ?? 0,
            totalActiveLinks: data.metrics.total_active_links ?? 0,
          });
        }
      } else if (Array.isArray(data)) {
        // Fallback for non-paginated responses
        setDatarooms(data);
        setTotalCount(data.length);
        setTotalPages(Math.ceil(data.length / pageSize) || 1);
        setKpiMetrics({
          totalRooms: data.length,
          totalStorageBytes: data.reduce((acc, d) => acc + (d.storage_used_bytes || 0), 0),
          totalActiveLinks: data.reduce((acc, d) => acc + (d.active_links_count || 0), 0),
        });
      }
    } catch (err) {
      if (isCancelled()) return;
      // Handled by api interceptor
    } finally {
      if (!isCancelled()) {
        setIsLoading(false);
      }
    }
  }, [currentPage, pageSize, sortField, sortDirection, debouncedSearch, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchDatarooms(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchDatarooms]);

  const handleDeleteDataroom = async () => {
    if (!dataroomToDelete) return;
    try {
      await deleteAdminDataroom(dataroomToDelete.id);
      toast.success(t('admin.deleteDataroomSuccess'));
      setDataroomToDelete(null);
      await fetchDatarooms();
    } catch (err) {
      // Handled by api interceptor
    }
  };

  const handleUpgradeStorage = async () => {
    if (!dataroomToUpgrade) return;
    setIsUpgrading(true);
    try {
      await upgradeAdminDataroomStorage(dataroomToUpgrade.id);
      toast.success(t('admin.upgradeDataroomSuccess'));
      setDataroomToUpgrade(null);
      await fetchDatarooms();
    } catch (err) {
      // Handled by api interceptor
    } finally {
      setIsUpgrading(false);
    }
  };

  const renderSortableHeader = (field, label) => {
    const isActive = sortField === field;
    return (
      <th className="p-4">
        <button
          type="button"
          onClick={() => handleSort(field)}
          className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground uppercase text-xs hover:text-foreground transition-colors group focus:outline-none"
        >
          <span>{label}</span>
          <span className="flex items-center">
            {isActive ? (
              sortDirection === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5 text-primary" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
              )
            ) : (
              <ArrowUpDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground" />
            )}
          </span>
        </button>
      </th>
    );
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <AdminNav />

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t('admin.dataroomsTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('admin.dataroomsDesc')}
            </p>
          </div>
        </div>

        {/* Overview KPI Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {/* Total Datarooms */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('admin.kpiTotalDatarooms')}
              </span>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{kpiMetrics.totalRooms}</p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Folder className="h-5 w-5" />
            </div>
          </div>

          {/* Total Storage Consumed */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('admin.kpiTotalStorage')}
              </span>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{formatBytes(kpiMetrics.totalStorageBytes)}</p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <HardDrive className="h-5 w-5" />
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
                <p className="text-2xl font-bold text-foreground">{kpiMetrics.totalActiveLinks}</p>
              )}
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Link2 className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('admin.searchDataroomsPlaceholder')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-48 text-sm"
            >
              <option value="all">{t('admin.filterAllDatarooms')}</option>
              <option value="near_capacity">{t('admin.filterNearCapacity')}</option>
              <option value="unlimited">{t('admin.filterUnlimited')}</option>
              <option value="legacy_v1">{t('admin.filterLegacyV1')}</option>
            </Select>
          </div>
        </div>

        {/* Governance Table */}
        <div className="rounded-xl border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <tr>
                  {renderSortableHeader('name', t('admin.columnDataroomName'))}
                  {renderSortableHeader('owner', t('admin.columnOwner'))}
                  {renderSortableHeader('collaborators', t('admin.columnCollaborators'))}
                  {renderSortableHeader('active_links', t('admin.columnActiveLinks'))}
                  {renderSortableHeader('last_viewed', t('admin.columnLastViewed'))}
                  {renderSortableHeader('storage', t('admin.columnStorageQuota'))}
                  {renderSortableHeader('created', t('admin.columnCreated'))}
                  <th className="p-4 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="p-4">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-7 w-7 rounded-full" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      </td>
                      <td className="p-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-10" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                      <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="p-4 text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></td>
                    </tr>
                  ))
                ) : datarooms.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-muted-foreground">
                      <Folder className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-base font-medium text-foreground">{t('admin.noDataroomsFound')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {searchQuery || statusFilter !== 'all'
                          ? t('admin.tryAdjustingFilters')
                          : t('admin.noDataroomsInOrg')}
                      </p>
                    </td>
                  </tr>
                ) : (
                  datarooms.map((dataroom) => {
                    const quotaMb = dataroom.storage_quota_mb || 0;
                    const usedBytes = dataroom.storage_used_bytes || 0;
                    const quotaBytes = quotaMb * 1024 * 1024;
                    const usagePercentage = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;
                    const isLegacyV1 = (dataroom.storage_version ?? 2) < 2;

                    let indicatorColor = 'bg-emerald-500';
                    if (usagePercentage > 90) {
                      indicatorColor = 'bg-rose-500';
                    } else if (usagePercentage > 70) {
                      indicatorColor = 'bg-amber-500';
                    }

                    return (
                      <tr key={dataroom.id} className="hover:bg-muted/30 transition-colors">
                        {/* Name + Storage Version Badge */}
                        <td className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                              <Folder className="h-4 w-4" />
                            </div>
                            <div className="space-y-1 min-w-0">
                              <Link
                                to={`/datarooms/${dataroom.id}`}
                                className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1.5 truncate group"
                                title={dataroom.name}
                              >
                                <span>{dataroom.name}</span>
                                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                              </Link>
                              {isLegacyV1 && (
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                    <AlertTriangle className="h-2.5 w-2.5 mr-1 text-amber-600" />
                                    {t('admin.v1Legacy')}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Owner */}
                        <td className="p-4">
                          {dataroom.owner ? (
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-7 w-7 rounded-full border">
                                {dataroom.owner.avatar_url && <AvatarImage src={dataroom.owner.avatar_url} />}
                                <AvatarFallback className="text-[10px]">
                                  {getAvatarInitial(dataroom.owner.name, dataroom.owner.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 text-xs">
                                <p className="font-medium text-foreground truncate max-w-[140px]">
                                  {dataroom.owner.name || dataroom.owner.email}
                                </p>
                                {dataroom.owner.name && (
                                  <p className="text-muted-foreground truncate max-w-[140px]">{dataroom.owner.email}</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">{t('admin.unassigned')}</span>
                          )}
                        </td>

                        {/* Collaborators */}
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => setDataroomForCollaborators(dataroom)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/60 hover:bg-muted text-foreground transition-colors cursor-pointer border"
                          >
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{dataroom.collaborator_count || 0}</span>
                            <span className="text-muted-foreground text-[11px] ml-0.5">
                              {t('admin.manage')}
                            </span>
                          </button>
                        </td>

                        {/* Active Links */}
                        <td className="p-4">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Link2 className="h-3.5 w-3.5 text-blue-500" />
                            <span>{dataroom.active_links_count || 0}</span>
                          </div>
                        </td>

                        {/* Last Viewed */}
                        <td className="p-4 text-xs text-muted-foreground whitespace-nowrap">
                          {dataroom.last_viewed_at ? (
                            <span title={formatDate(dataroom.last_viewed_at, 'PPpp')}>
                              {formatRelativeTime(dataroom.last_viewed_at)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">—</span>
                          )}
                        </td>

                        {/* Storage / Quota Progress */}
                        <td className="p-4">
                          <div className="flex flex-col gap-1 w-36">
                            <div className="flex justify-between text-xs font-medium">
                              <span className="text-foreground">{formatBytes(usedBytes)}</span>
                              <span className="text-muted-foreground">
                                {quotaMb > 0 ? `${quotaMb} MB` : '∞'}
                              </span>
                            </div>
                            <Progress
                              value={quotaMb > 0 ? usagePercentage : 0}
                              className="h-1.5"
                              indicatorClassName={indicatorColor}
                            />
                            {quotaMb > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {usagePercentage.toFixed(0)}% {t('admin.used')}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Created Date */}
                        <td className="p-4 text-xs text-muted-foreground">
                          {formatDate(dataroom.created_at, 'PP')}
                        </td>

                        {/* Actions Menu */}
                        <td className="p-4 text-right">
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">{t('common.actions')}</span>
                              </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content
                              className="z-50 w-52 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
                              sideOffset={5}
                              align="end"
                            >
                              <DropdownMenu.Item
                                onClick={() => navigate(`/datarooms/${dataroom.id}`)}
                                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                              >
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                <span>{t('admin.openWorkspace')}</span>
                              </DropdownMenu.Item>

                              <DropdownMenu.Item
                                onClick={() => setDataroomForQuota(dataroom)}
                                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                              >
                                <Sliders className="h-4 w-4 text-muted-foreground" />
                                <span>{t('admin.adjustQuotaAction')}</span>
                              </DropdownMenu.Item>

                              <DropdownMenu.Item
                                onClick={() => setDataroomForTransfer(dataroom)}
                                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                              >
                                <ArrowRightLeft className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                <span>{t('datarooms.transferOwnershipTitle')}</span>
                              </DropdownMenu.Item>

                              <DropdownMenu.Item
                                onClick={() => setDataroomForCollaborators(dataroom)}
                                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                              >
                                <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                <span>{t('datarooms.manageCollaborators')}</span>
                              </DropdownMenu.Item>

                              {isLegacyV1 && (
                                <DropdownMenu.Item
                                  onClick={() => setDataroomToUpgrade(dataroom)}
                                  className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none dark:text-emerald-400 hover:dark:bg-emerald-950/40"
                                >
                                  <Layers className="h-4 w-4 text-emerald-600" />
                                  <span>{t('admin.upgradeToVault')}</span>
                                </DropdownMenu.Item>
                              )}

                              <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />

                              <DropdownMenu.Item
                                onClick={() => setDataroomToDelete(dataroom)}
                                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-400 hover:dark:bg-red-900/50 focus:dark:bg-red-900/50"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                                <span>{t('common.delete')}</span>
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
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
              <span className="text-xs text-muted-foreground">
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

        {/* Dialogs */}
        <AdjustStorageQuotaDialog
          isOpen={!!dataroomForQuota}
          onOpenChange={() => setDataroomForQuota(null)}
          dataroom={dataroomForQuota}
          onSuccess={fetchDatarooms}
        />

        <TransferOwnershipDialog
          isOpen={!!dataroomForTransfer}
          onOpenChange={() => setDataroomForTransfer(null)}
          dataroom={dataroomForTransfer}
          onSuccess={fetchDatarooms}
          isAdmin={true}
        />

        <ManageCollaboratorsDialog
          isOpen={!!dataroomForCollaborators}
          onOpenChange={() => setDataroomForCollaborators(null)}
          dataroom={dataroomForCollaborators}
          onCollaboratorsUpdated={fetchDatarooms}
          isAdmin={true}
        />

        <ConfirmationDialog
          isOpen={!!dataroomToUpgrade}
          onOpenChange={() => setDataroomToUpgrade(null)}
          title={t('admin.upgradeVaultConfirmTitle', {
            name: dataroomToUpgrade?.name,
          })}
          description={t('admin.upgradeVaultConfirmDesc')}
          onConfirm={handleUpgradeStorage}
          confirmText={t('admin.upgradeNow')}
          isLoading={isUpgrading}
        />

        <ConfirmationDialog
          isOpen={!!dataroomToDelete}
          onOpenChange={() => setDataroomToDelete(null)}
          title={t('datarooms.deleteConfirmTitle', { name: dataroomToDelete?.name })}
          description={t('datarooms.deleteConfirmDescription')}
          onConfirm={handleDeleteDataroom}
          confirmText={t('common.delete')}
        />
      </div>
    </TooltipProvider>
  );
}
