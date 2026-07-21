import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as api from '../services/api';
import { AdminNav } from '../components/admin/AdminNav';
import { Button } from '../components/ui/Button';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { Input } from '../components/ui/Input';
import { PlusIcon } from '../components/icons/PlusIcon';
import { Skeleton } from '../components/ui/Skeleton';
import { Select } from '../components/ui/Select';
import { Pencil, Trash2, Check, X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatBytes } from '../lib/formatters';
import { Progress } from '../components/ui/Progress';
import { Pagination } from '../components/ui/Pagination';

function AddUserForm({ onAddUser, onCancel }) {
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
      <h3 className="mb-4 text-lg font-semibold">Add New User</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Full Name
            </label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email Address
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium"
            >
              Username
            </label>
            <Input
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium"
            >
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={3}
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium">
              Role
            </label>
            <Select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <div>
            <label htmlFor="custom_file_size_quota_mb" className="mb-1 block text-sm font-medium">
              Storage Quota (MB)
            </label>
            <Input
              id="custom_file_size_quota_mb"
              name="custom_file_size_quota_mb"
              type="number"
              placeholder="Default (from settings)"
              value={formData.custom_file_size_quota_mb}
              onChange={handleChange}
              min="0"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-x-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Adding...' : 'Add User'}
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
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editedUserData, setEditedUserData] = useState({});
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
      toast.success(`User updated successfully.`);
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
      toast.success(`User '${response.data.name}' created successfully.`);
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
      toast.success(`User '${userToDelete.name}' deleted successfully.`);
      setUserToDelete(null);
    } catch (error) {
      // Error toast is handled by the global interceptor
    }
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id);
    setEditedUserData({
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      custom_file_size_quota_mb: user.custom_file_size_quota_mb !== null ? String(user.custom_file_size_quota_mb) : '',
    });
  };

  const handleCancel = () => {
    setEditingUserId(null);
    setEditedUserData({});
  };

  const handleSave = async (userId) => {
    try {
      await handleUpdateUser(userId, editedUserData);
      setEditingUserId(null);
      setEditedUserData({});
    } catch {
      // Don't exit edit mode on failure
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
        title="Delete User"
        description={`Are you sure you want to delete the user '${userToDelete?.name}'? This action cannot be undone.`}
        onConfirm={handleDeleteUser}
        confirmText="Delete"
      />
      <AdminNav />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">User Management</h2>
        {!isAddingUser && (
          <Button onClick={() => setIsAddingUser(true)}>
            <PlusIcon className="mr-2 h-4 w-4" /> Add User
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
              <th className="p-4 text-left font-semibold">Name</th>
              <th className="p-4 text-left font-semibold">Email</th>
              <th className="p-4 text-left font-semibold">Role</th>
              <th className="p-4 text-left font-semibold">Status</th>
              <th className="p-4 text-left font-semibold">Storage</th>
              <th className="p-4 text-left font-semibold">Joined</th>
              <th className="p-4 text-left font-semibold">Actions</th>
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
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </Select>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <Select
                          name="is_active"
                          value={editedUserData.is_active}
                          onChange={handleEditDataChange}
                        >
                          <option value={true}>Active</option>
                          <option value={false}>Inactive</option>
                        </Select>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <Input
                            name="custom_file_size_quota_mb"
                            type="number"
                            placeholder="Default"
                            value={editedUserData.custom_file_size_quota_mb ?? ''}
                            onChange={handleEditDataChange}
                            className="w-24 text-sm"
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
                            title="Save"
                          >
                            <Check className="h-5 w-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleCancel}
                            title="Cancel"
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
                          {user.name || 'Unnamed User'}
                        </Link>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <Link to={`/admin/users/${user.id}`} className="hover:underline text-muted-foreground">
                          {user.email}
                        </Link>
                      </td>
                      <td className="p-4 text-muted-foreground">{user.role}</td>
                      <td className="p-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            user.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
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
                            title="Edit User"
                          >
                            <Pencil className="h-5 w-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setUserToDelete(user)}
                            title="Delete User"
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
