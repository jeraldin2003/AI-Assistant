'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Users,
  Shield,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
} from 'lucide-react';
import { usersApi, getErrorMessage } from '../../lib/api-client';
import { UserProfile, UserRole } from '../../types/api';
import { useAuth } from '../../context/auth-context';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user: currentUser, refreshProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsers = async (p = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await usersApi.getUsers(p, 10);
      setUsers(data.users);
      setPage(data.meta.page);
      setTotalPages(data.meta.totalPages);
      setTotalUsers(data.meta.total);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers(1);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingId(userId);
    setError(null);
    setSuccessMsg(null);
    try {
      const updatedUser = await usersApi.updateRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: updatedUser.role } : u))
      );
      setSuccessMsg(`Updated role to ${newRole.toUpperCase()} for ${updatedUser.email}`);

      if (userId === currentUser?.id) {
        refreshProfile();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (userId === currentUser?.id) {
      setError('You cannot delete your own account.');
      return;
    }

    if (!confirm(`Are you sure you want to delete user ${email}?`)) {
      return;
    }

    setUpdatingId(userId);
    setError(null);
    setSuccessMsg(null);
    try {
      await usersApi.deleteUser(userId);
      setSuccessMsg(`Deleted user ${email} successfully.`);
      fetchUsers(page);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold border border-amber-200">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-slate-800 flex items-center gap-2">
                Manage Users & Roles
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Total: {totalUsers}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Grant admin permissions, update roles, or remove accounts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Alerts */}
        <div className="p-4 space-y-3 shrink-0 border-b border-slate-200 bg-slate-50/50">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by user email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-slate-800"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
              Loading user accounts...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No user accounts found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 font-semibold">User Email</th>
                    <th className="py-2.5 px-3 font-semibold">Role</th>
                    <th className="py-2.5 px-3 font-semibold">Registered</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            {u.email}
                            {isSelf && (
                              <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">
                            {u.id}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <select
                            value={u.role}
                            disabled={updatingId === u.id}
                            onChange={(e) =>
                              handleRoleChange(u.id, e.target.value as UserRole)
                            }
                            className={`py-1 px-2.5 text-xs font-medium rounded-lg border cursor-pointer focus:outline-none focus:ring-1 ${
                              u.role === 'admin'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : u.role === 'user'
                                ? 'bg-green-50 text-green-800 border-green-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                            <option value="guest">Guest</option>
                          </select>
                        </td>

                        <td className="py-3 px-3 text-slate-500">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            disabled={isSelf || updatingId === u.id}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 cursor-pointer"
                            title={isSelf ? 'Cannot delete own account' : 'Delete user'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 shrink-0 bg-slate-50/50">
          <div className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchUsers(page - 1)}
              disabled={page <= 1 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchUsers(page + 1)}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
