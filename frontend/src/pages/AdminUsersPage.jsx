import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as api from '../services/api';
import { AdminNav } from '../components/admin/AdminNav';
import { Button } from '../components/ui/Button';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { Input } from '../components/ui/Input';
import { PlusIcon } from '../components/icons/PlusIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Select';
import { Pencil, Trash2, Check, X, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatBytes } from '../lib/formatters';
import { Progress } from '../components/ui/Progress';
import { Pagination } from '../components/ui/Pagination';

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
      <td className="p-4">
        <Skeleton className="h-10 w-20" />
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10; // Corresponds to backend's StandardResultsSetPagination

  useEffect(() => {
    let ignore = false;

    const fetchUsers = async (page) => {
      setIsLoading(true);
      try {
        const response = await api.getAdminUsers(page);
        if (!ignore) {
          setUsers(response.data.results);
          setTotalCount(response.data.count);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    fetchUsers(currentPage);

    return () => {
      ignore = true;
    };
  }, [currentPage]);

  const totalPages = Math.ceil(totalCount / pageSize);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

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
      setUsers((prev) => [response.data, ...prev]);
      toast.success(t('admin.userCreatedSuccess', { name: response.data.name }));
      setIsAddingUser(false);
    } catch (error) {
      // Error toast is handled by the global interceptor
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await api.deleteAdminUser(userToDelete.id);
      setUsers((prev) => prev.filter((user) => user.id !== userToDelete.id));
      toast.success(t('admin.userDeletedSuccess', { name: userToDelete.name }));
      setUserToDelete(null);
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
      await handleUpdateUser(userId, editedUserData);
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

  return (
    <div className="container mx-auto py-6">
      <ConfirmationDialog
        isOpen={!!userToDelete}
        onOpenChange={() => setUserToDelete(null)}
        title={t('admin.deleteUserTitle')}
        description={t('admin.deleteUserConfirm', { name: userToDelete?.name })}
        onConfirm={handleDeleteUser}
        confirmText={t('common.delete')}
      />
      <AdminNav />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('admin.userManagement')}</h2>
        {!isAddingUser && (
          <Button onClick={() => setIsAddingUser(true)}>
            <PlusIcon className="mr-2 h-4 w-4" /> {t('admin.addUser')}
          </Button>
        )}
      </div>

      {isAddingUser && (
        <AddUserForm
          onAddUser={handleAddUser}
          onCancel={() => setIsAddingUser(false)}
        />
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="min-w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="p-4 text-left font-semibold">{t('analytics.name')}</th>
              <th className="p-4 text-left font-semibold">{t('settings.email')}</th>
              <th className="p-4 text-left font-semibold">{t('admin.role')}</th>
              <th className="p-4 text-left font-semibold">{t('analytics.status')}</th>
              <th className="p-4 text-left font-semibold">{t('admin.groupQuota')}</th>
              <th className="p-4 text-left font-semibold">{t('analytics.created')}</th>
              <th className="p-4 text-left font-semibold">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
              : users.map((user) =>
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
                      <td className="p-4">
                        <div className="flex items-center gap-x-2">
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
                      <td className="p-4">
                        <div className="flex items-center gap-x-2">
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
                )}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
