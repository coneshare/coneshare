import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  Users,
  HardDrive,
  Folder,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
} from 'lucide-react';

import * as api from '../services/api';
import { AdminNav } from '../components/admin/AdminNav';
import { Button } from '../components/ui/Button';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { Input } from '../components/ui/Input';
import { PlusIcon } from '../components/icons/PlusIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Select';
import { Progress } from '../components/ui/Progress';
import { Pagination } from '../components/ui/Pagination';
import { formatBytes } from '../lib/formatters';

function AddUserForm({ onAddUser, onCancel }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    name: '',
    password: '',
    role: 'member',
    custom_file_size_quota_mb: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        custom_file_size_quota_mb: formData.custom_file_size_quota_mb === '' ? null : parseInt(formData.custom_file_size_quota_mb, 10),
      };
      await onAddUser(payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border bg-card p-4">
      <h3 className="mb-4 text-lg font-semibold">{t('admin.addNewUser')}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              {t('admin.fullName')}
            </label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              disabled={isSaving}
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              {t('admin.emailAddress')}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              disabled={isSaving}
              required
            />
          </div>
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium"
            >
              {t('admin.username')}
            </label>
            <Input
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              disabled={isSaving}
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium"
            >
              {t('settings.password')}
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              disabled={isSaving}
              required
              minLength={3}
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium">
              {t('admin.role')}
            </label>
            <Select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={isSaving}
            >
              <option value="member">{t('admin.roleMember')}</option>
              <option value="admin">{t('admin.roleAdmin')}</option>
            </Select>
          </div>
          <div>
            <label htmlFor="custom_file_size_quota_mb" className="mb-1 block text-sm font-medium">
              {t('admin.storageQuota')}
            </label>
            <Input
              id="custom_file_size_quota_mb"
              name="custom_file_size_quota_mb"
              type="number"
              placeholder={t('common.default')}
              value={formData.custom_file_size_quota_mb}
              onChange={handleChange}
              disabled={isSaving}
              min="0"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-x-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('admin.adding')}
              </>
            ) : (
              t('admin.addUser')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b">
      <td className="p-4">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-48" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="p-4 text-right">
        <Skeleton className="h-8 w-16 ml-auto rounded-md" />
      </td>
    </tr>
  );
}

function UserStorageUsage({ user }) {
  const usageBytes = user.total_document_size || 0;
  const quotaMB = user.file_size_quota_mb || 0;
  const quotaBytes = quotaMB * 1024 * 1024;
  const usagePercentage = quotaMB > 0 ? Math.min((usageBytes / quotaBytes) * 100, 100) : 0;

  let indicatorColor = 'bg-emerald-500';
  if (usagePercentage > 90) {
    indicatorColor = 'bg-rose-500';
  } else if (usagePercentage > 70) {
    indicatorColor = 'bg-amber-500';
  }

  return (
    <div className="flex flex-col gap-1 w-32">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-foreground">{formatBytes(usageBytes)}</span>
        <span className="text-muted-foreground">
          {quotaMB > 0 ? `${quotaMB} MB` : '∞'}
        </span>
      </div>
      <Progress 
        value={usagePercentage} 
        className="h-1.5"
        indicatorClassName={indicatorColor} 
      />
    </div>
  );
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editedUserData, setEditedUserData] = useState({});
  const [savingUserId, setSavingUserId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('created');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const pageSize = 10;

  const [kpiMetrics, setKpiMetrics] = useState({
    totalUsers: 0,
    totalStorageBytes: 0,
    dataroomUsers: 0,
  });

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
      const isTextColumn = field === 'name' || field === 'role';
      setSortDirection(isTextColumn ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  const fetchUsers = useCallback(async (isCancelled = () => false) => {
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

      const response = await api.getAdminUsers(params);
      if (isCancelled()) return;
      const data = response.data;

      if (data && data.results) {
        setUsers(data.results);
        setTotalCount(data.count ?? 0);
        setTotalPages(data.total_pages ?? (Math.ceil((data.count ?? 0) / pageSize) || 1));
        if (data.metrics) {
          setKpiMetrics({
            totalUsers: data.metrics.total_users ?? 0,
            totalStorageBytes: data.metrics.total_storage_bytes ?? 0,
            dataroomUsers: data.metrics.dataroom_users ?? 0,
          });
        } else {
          setKpiMetrics({
            totalUsers: data.count ?? data.results.length,
            totalStorageBytes: data.results.reduce((acc, u) => acc + (u.total_document_size || 0), 0),
            dataroomUsers: 0,
          });
        }
      } else if (Array.isArray(data)) {
        setUsers(data);
        setTotalCount(data.length);
        setTotalPages(Math.ceil(data.length / pageSize) || 1);
        setKpiMetrics({
          totalUsers: data.length,
          totalStorageBytes: data.reduce((acc, u) => acc + (u.total_document_size || 0), 0),
          dataroomUsers: 0,
        });
      }
    } catch (error) {
      if (isCancelled()) return;
      setUsers([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      if (!isCancelled()) {
        setIsLoading(false);
      }
    }
  }, [currentPage, pageSize, sortField, sortDirection, debouncedSearch, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchUsers(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchUsers, refreshKey]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleUpdateUser = async (userId, data) => {
    try {
      const response = await api.updateAdminUser(userId, data);
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, ...response.data } : user
        )
      );
      toast.success(t('admin.userUpdatedSuccess'));
      return response.data;
    } catch (error) {
      // Error is handled by interceptor
      throw error;
    }
  };

  const handleAddUser = async (userData) => {
    try {
      const response = await api.createAdminUser(userData);
      toast.success(t('admin.userCreatedSuccess', { name: response.data.name }));
      setIsAddingUser(false);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      // Error toast is handled by the global interceptor
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await api.deleteAdminUser(userToDelete.id);
      toast.success(t('admin.userDeletedSuccess', { name: userToDelete.name }));
      setUserToDelete(null);

      // Clamp: if we deleted the last item on a page, navigate back to previous page
      const expectedNewTotal = totalCount - 1;
      const maxValidPage = Math.max(1, Math.ceil(expectedNewTotal / pageSize));
      if (currentPage > maxValidPage) {
        setCurrentPage(maxValidPage);
      } else {
        setRefreshKey((k) => k + 1);
      }
    } catch (error) {
      // Error toast is handled by the global interceptor
    }
  };

  const handleEdit = (user) => {
    if (savingUserId !== null) return;
    setEditingUserId(user.id);
    setEditedUserData({
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      custom_file_size_quota_mb: user.custom_file_size_quota_mb !== null ? String(user.custom_file_size_quota_mb) : '',
    });
  };

  const handleCancel = () => {
    if (savingUserId !== null) return;
    setEditingUserId(null);
    setEditedUserData({});
  };

  const handleSave = async (userId) => {
    if (savingUserId !== null) return;
    setSavingUserId(userId);
    try {
      const rawQuota = editedUserData.custom_file_size_quota_mb;
      const normalizedQuota =
        rawQuota === '' || rawQuota === null || rawQuota === undefined
          ? null
          : typeof rawQuota === 'string'
          ? (isNaN(parseInt(rawQuota, 10)) ? null : parseInt(rawQuota, 10))
          : rawQuota;
      const payload = {
        ...editedUserData,
        custom_file_size_quota_mb: normalizedQuota,
      };
      await handleUpdateUser(userId, payload);
      setEditingUserId(null);
      setEditedUserData({});
    } catch {
      // Don't exit edit mode on failure
    } finally {
      setSavingUserId(null);
    }
  };

  const handleEditDataChange = (e) => {
    const { name, value } = e.target;
    if (name === 'is_active') {
      setEditedUserData((prev) => ({ ...prev, [name]: value === 'true' }));
    } else if (name === 'custom_file_size_quota_mb') {
      setEditedUserData((prev) => ({
        ...prev,
        [name]: value === '' ? null : parseInt(value, 10),
      }));
    } else {
      setEditedUserData((prev) => ({ ...prev, [name]: value }));
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
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <ConfirmationDialog
        isOpen={!!userToDelete}
        onOpenChange={() => setUserToDelete(null)}
        title={t('admin.deleteUserTitle')}
        description={t('admin.deleteUserConfirm', { name: userToDelete?.name })}
        onConfirm={handleDeleteUser}
        confirmText={t('common.delete')}
      />
      <AdminNav />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('admin.userManagement')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('admin.usersDesc')}
          </p>
        </div>
        {!isAddingUser && (
          <Button onClick={() => setIsAddingUser(true)}>
            <PlusIcon className="mr-2 h-4 w-4" /> {t('admin.addUser')}
          </Button>
        )}
      </div>

      {/* Overview KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Total Users */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('admin.kpiTotalUsers')}
            </span>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{kpiMetrics.totalUsers}</p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
        </div>

        {/* Total Storage Used */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('admin.kpiTotalUserStorage')}
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

        {/* Dataroom Users */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('admin.kpiDataroomUsers')}
            </span>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{kpiMetrics.dataroomUsers}</p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Folder className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('admin.searchUsersPlaceholder')}
            aria-label={t('admin.searchUsersPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            aria-label={t('common.status')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-64 text-sm"
          >
            <option value="all">{t('admin.filterAllUsers')}</option>
            <option value="admin">{t('admin.filterAdmins')}</option>
            <option value="member">{t('admin.filterMembers')}</option>
            <option value="inactive">{t('admin.filterInactive')}</option>
            <option value="dataroom_participant">{t('admin.filterDataroomUsers')}</option>
          </Select>
        </div>
      </div>

      {isAddingUser && (
        <AddUserForm
          onAddUser={handleAddUser}
          onCancel={() => setIsAddingUser(false)}
        />
      )}

      {/* Users Table */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                {renderSortableHeader('name', t('analytics.name'))}
                <th className="p-4 font-semibold text-muted-foreground uppercase text-xs">{t('settings.email')}</th>
                {renderSortableHeader('role', t('admin.role'))}
                {renderSortableHeader('status', t('common.status'))}
                {renderSortableHeader('storage', t('admin.storageQuota'))}
                {renderSortableHeader('created', t('admin.joinedDateColumn'))}
                <th className="p-4 text-right font-semibold text-muted-foreground uppercase text-xs">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-base font-medium text-foreground">{t('admin.noUsersFound')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('admin.tryAdjustingFilters')}
                    </p>
                    {(searchQuery || statusFilter !== 'all') && (
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchQuery('');
                            setStatusFilter('all');
                            setCurrentPage(1);
                          }}
                        >
                          {t('admin.clearFilters')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                users.map((user) =>
                  editingUserId === user.id ? (
                    <tr key={user.id} className="border-b bg-muted/50">
                      <td className="p-4 font-medium">
                        <Input
                          name="name"
                          value={editedUserData.name}
                          onChange={handleEditDataChange}
                          disabled={savingUserId === user.id}
                        />
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <Select
                          name="role"
                          value={editedUserData.role}
                          onChange={handleEditDataChange}
                          disabled={savingUserId === user.id}
                        >
                          <option value="member">{t('admin.roleMember')}</option>
                          <option value="admin">{t('admin.roleAdmin')}</option>
                        </Select>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <Select
                          name="is_active"
                          value={editedUserData.is_active}
                          onChange={handleEditDataChange}
                          disabled={savingUserId === user.id}
                        >
                          <option value={true}>{t('common.active')}</option>
                          <option value={false}>{t('common.inactive')}</option>
                        </Select>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <Input
                            name="custom_file_size_quota_mb"
                            type="number"
                            placeholder={t('common.default')}
                            value={editedUserData.custom_file_size_quota_mb ?? ''}
                            onChange={handleEditDataChange}
                            className="w-24 text-sm"
                            disabled={savingUserId === user.id}
                            min="0"
                          />
                          <span className="text-xs text-muted-foreground">MB</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(user.date_joined).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSave(user.id)}
                            disabled={savingUserId === user.id}
                            title={t('common.save')}
                          >
                            {savingUserId === user.id ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Check className="h-5 w-5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleCancel}
                            disabled={savingUserId === user.id}
                            title={t('common.cancel')}
                          >
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={user.id} className="border-b">
                      <td className="p-4 font-medium">
                        <Link to={`/admin/users/${user.id}`} className="hover:underline">
                          {user.name || t('common.unnamed')}
                        </Link>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <Link to={`/admin/users/${user.id}`} className="hover:underline text-muted-foreground">
                          {user.email}
                        </Link>
                      </td>
                      <td className="p-4 text-muted-foreground capitalize">
                        {user.role === 'admin' ? t('admin.roleAdmin') : user.role === 'member' ? t('admin.roleMember') : user.role}
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            user.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {user.is_active ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="p-4">
                        <UserStorageUsage user={user} />
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(user.date_joined).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(user)}
                            disabled={savingUserId !== null}
                            title={t('common.edit')}
                          >
                            <Pencil className="h-5 w-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setUserToDelete(user)}
                            disabled={savingUserId !== null}
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )
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
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
