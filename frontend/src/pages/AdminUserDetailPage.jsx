import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, HardDrive, Link as LinkIcon, FolderOpen, Calendar, Mail, ShieldAlert, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import * as api from '../services/api';
import { AdminNav } from '../components/admin/AdminNav';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Progress } from '../components/ui/Progress';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../components/ui/Table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/Tooltip';
import { formatBytes } from '../lib/formatters';

export function AdminUserDetailPage() {
  const { t } = useTranslation();
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  const [links, setLinks] = useState([]);
  const [datarooms, setDatarooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleRecalculateQuota = async () => {
    setIsRecalculating(true);
    try {
      const res = await api.recalculateAdminUserQuota(userId);
      if (res?.data?.id === userId) {
        setUser(res.data);
      }
      toast.success(t('admin.recalculateQuotaSuccess', 'Storage quota recalculated successfully.'));
    } catch (error) {
      toast.error(t('admin.recalculateQuotaError', 'Failed to recalculate storage quota.'));
    } finally {
      setIsRecalculating(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [userRes, linksRes, dataroomsRes] = await Promise.all([
          api.getAdminUserDetails(userId),
          api.getAdminUserShareLinks(userId),
          api.getAdminUserDatarooms(userId),
        ]);
        setUser(userRes.data);
        setLinks(linksRes.data.results || []);
        setDatarooms(dataroomsRes.data.results || []);
      } catch (error) {
        // error handled by interceptor
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <AdminNav />
        

        {/* Profile Header Skeleton */}
        <div className="flex items-center gap-4 border-b pb-6 mb-6">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>

        {/* Dashboard Grid Skeleton */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* List Tables Skeletons */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const totalViews = user.total_views || 0;
  const quotaMB = user.file_size_quota_mb || 0;
  const usageBytes = user.total_document_size || 0;
  const quotaBytes = quotaMB * 1024 * 1024;
  const usagePercentage = quotaMB > 0 ? Math.min((usageBytes / quotaBytes) * 100, 100) : 0;

  let indicatorColor = 'bg-emerald-500';
  if (usagePercentage > 90) {
    indicatorColor = 'bg-rose-500';
  } else if (usagePercentage > 70) {
    indicatorColor = 'bg-amber-500';
  }

  return (
    <div className="container mx-auto py-6">
      <AdminNav />

      {/* User Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{user.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {t('admin.joinedDate', { date: new Date(user.date_joined).toLocaleDateString() })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            user.is_active 
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
              : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
          }`}>
            {user.is_active ? t('common.active') : t('common.inactive')}
          </span>
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 capitalize">
            {user.role === 'admin' ? t('admin.roleAdmin') : user.role === 'member' ? t('admin.roleMember') : user.role}
          </span>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {/* Storage Quota Card */}
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                {t('admin.storageQuota')}
              </CardTitle>
              <CardDescription>
                {t('admin.storageQuotaDesc')}
              </CardDescription>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRecalculateQuota}
                    disabled={isRecalculating}
                    className="flex items-center gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                    {isRecalculating ? t('admin.recalculating', 'Recalculating...') : t('admin.recalculateQuota', 'Recalculate Usage')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-center">
                  <p>{t('admin.recalculateQuotaTip', 'Recalculate and synchronize the user\'s storage usage from all active documents in the database if the displayed quota is inaccurate.')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span className="text-muted-foreground">{t('admin.usedSpace')}</span>
                  <span>
                    {formatBytes(usageBytes)} / {quotaMB > 0 ? `${quotaMB} MB` : t('admin.unlimited')}
                  </span>
                </div>
                <Progress 
                  value={usagePercentage} 
                  className="h-2"
                  indicatorClassName={indicatorColor}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2 text-sm border-t">
                <div>
                  <span className="text-xs text-muted-foreground block">{t('admin.maxFilesPerUpload')}</span>
                  <span className="font-semibold text-foreground">{user.max_files_per_upload}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">{t('admin.storageStatus')}</span>
                  <span className="font-semibold text-foreground">
                    {quotaMB > 0 ? t('admin.pctFull', { pct: usagePercentage.toFixed(1) }) : t('admin.unlimitedQuota')}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">{t('admin.activitySummary')}</CardTitle>
            <CardDescription>{t('admin.activitySummaryDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  {t('analytics.link')}
                </span>
                <span className="text-xl font-bold text-foreground">{user.total_links || 0}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  {t('nav.datarooms')}
                </span>
                <span className="text-xl font-bold text-foreground">{user.total_datarooms || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  {t('trash.totalViews')}
                </span>
                <span className="text-xl font-bold text-foreground">{user.total_views || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Share Links Card */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold">{t('admin.shareLinksCount', { count: user.total_links || 0 })}</CardTitle>
          <CardDescription>{t('admin.shareLinksDesc', 'Public sharing links created by this user.')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">{t('analytics.name')}</TableHead>
                <TableHead>{t('trash.totalViews')}</TableHead>
                <TableHead>{t('analytics.status')}</TableHead>
                <TableHead>{t('analytics.created')}</TableHead>
                <TableHead className="text-right px-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.length === 0 ? (
                <TableRow>
                  <TableCell colSpan="5" className="h-24 text-center text-muted-foreground px-6">
                    {t('admin.noShareLinksFound')}
                  </TableCell>
                </TableRow>
              ) : (
                links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium px-6">{link.name}</TableCell>
                    <TableCell>{link.view_count || 0}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        link.is_active 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
                      }`}>
                        {link.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(link.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/view/${link.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center">
                          <ExternalLink className="h-4 w-4 mr-2" /> {t('admin.viewLink')}
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Datarooms Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-bold">{t('admin.dataroomsCount', { count: user.total_datarooms || 0 })}</CardTitle>
          <CardDescription>{t('admin.userDataroomsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">{t('analytics.name')}</TableHead>
                <TableHead>{t('analytics.created')}</TableHead>
                <TableHead className="px-6">{t('common.updated')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datarooms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan="3" className="h-24 text-center text-muted-foreground px-6">
                    {t('admin.noDataroomsFound')}
                  </TableCell>
                </TableRow>
              ) : (
                datarooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium px-6">{room.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(room.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-6">
                      {new Date(room.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminUserDetailPage;
