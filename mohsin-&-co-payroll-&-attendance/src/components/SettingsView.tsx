import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  UserPlus, 
  Save, 
  Trash2, 
  Edit, 
  Check, 
  X, 
  Upload, 
  Phone, 
  Mail, 
  MapPin,
  Lock,
  User as UserIcon,
  Shield,
  Key,
  Database,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { CompanySettings, SystemUser, UserRole, ROLE_PERMISSIONS_TEMPLATES } from '../types';
import { authFetch } from '../auth/AuthContext';

interface SettingsViewProps {
  currentUserRole: string;
}

const MODULES = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'employees', name: 'HR & Employees', actions: ['view', 'add', 'edit', 'delete'] },
  { id: 'attendance', name: 'Attendance & Shifts', actions: ['view', 'add', 'override', 'manage_shifts'] },
  { id: 'payroll', name: 'Payroll Engine', actions: ['view', 'calculate', 'adjustments', 'payslip'] },
  { id: 'reports', name: 'Reports & Exports', actions: ['view', 'export_excel', 'print_pdf'] },
  { id: 'settings', name: 'System Settings', actions: ['view', 'company_setup', 'user_roles'] },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUserRole }) => {
  const [activeSubTab, setActiveSubTab] = useState<'company' | 'roles' | 'database'>('company');

  // Company Settings State
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    id: 'company_1',
    company_name: 'Mohsin & Co',
    contact: '+92 300 0000000',
    address: 'Karachi, Pakistan',
    logo_url: ''
  });
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [companyMsg, setCompanyMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Database Reset & Testing State
  const [dbStats, setDbStats] = useState<{
    employeesCount: number;
    attendanceCount: number;
    payrollCount: number;
    adjustmentsCount: number;
    documentsCount: number;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [resetErrorMessage, setResetErrorMessage] = useState<string | null>(null);

  // Users State
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [selectedUserPhotoFile, setSelectedUserPhotoFile] = useState<File | null>(null);
  const [userPhotoPreview, setUserPhotoPreview] = useState<string | null>(null);

  // User Form State
  const [userFormData, setUserFormData] = useState<{
    name: string;
    email: string;
    password?: string;
    contact: string;
    role: UserRole;
    department: string;
    photo_url?: string;
    permissions: Record<string, Record<string, boolean>>;
  }>({
    name: '',
    email: '',
    password: '',
    contact: '',
    role: 'hr_admin',
    department: 'Human Resources',
    photo_url: '',
    permissions: JSON.parse(JSON.stringify(ROLE_PERMISSIONS_TEMPLATES['hr_admin'] || {}))
  });

  const [userFormError, setUserFormError] = useState<string | null>(null);

  // Fetch initial company settings, users & db stats
  useEffect(() => {
    fetchCompanySettings();
    fetchUsers();
    fetchDbStats();
  }, []);

  const fetchDbStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await authFetch('/api/settings/database-stats');
      if (res.ok) {
        const data = await res.json();
        setDbStats(data);
      }
    } catch (err) {
      console.error('Error fetching database stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleExecuteReset = async () => {
    setIsResetting(true);
    setResetErrorMessage(null);
    try {
      const res = await authFetch('/api/settings/reset-database', {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setResetSuccessMessage('Database reset successfully! Reloading application for clean testing...');
        setShowResetConfirmModal(false);
        await fetchDbStats();
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setResetErrorMessage(data.error || 'Failed to reset database');
      }
    } catch (err: any) {
      setResetErrorMessage('Network error while resetting database: ' + (err.message || String(err)));
    } finally {
      setIsResetting(false);
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const res = await authFetch('/api/settings/company');
      if (res.ok) {
        const data = await res.json();
        setCompanySettings(data);
      }
    } catch (err) {
      console.error('Error fetching company settings:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await authFetch('/api/settings/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCompany(true);
    setCompanyMsg(null);
    try {
      const res = await authFetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companySettings)
      });
      if (res.ok) {
        // Propagate any logo change (including removal) to the dashboard header.
        window.dispatchEvent(new CustomEvent('company:logo-updated', { detail: { logo_url: companySettings.logo_url } }));
        setCompanyMsg({ text: 'Company profile successfully saved!', type: 'success' });
      } else {
        setCompanyMsg({ text: 'Failed to update company settings', type: 'error' });
      }
    } catch (err) {
      setCompanyMsg({ text: 'Error saving company settings', type: 'error' });
    } finally {
      setIsSavingCompany(false);
      setTimeout(() => setCompanyMsg(null), 4000);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await authFetch('/api/settings/company/logo', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setCompanySettings({ ...companySettings, logo_url: data.logo_url });
        // Notify the dashboard header (Navbar) so it re-renders with the new logo immediately.
        window.dispatchEvent(new CustomEvent('company:logo-updated', { detail: { logo_url: data.logo_url } }));
        setCompanyMsg({ text: 'Logo uploaded successfully!', type: 'success' });
      } else {
        const err = await res.json();
        setCompanyMsg({ text: err.error || 'Failed to upload logo', type: 'error' });
      }
    } catch (err) {
      setCompanyMsg({ text: 'Error uploading logo', type: 'error' });
    } finally {
      setTimeout(() => setCompanyMsg(null), 4000);
    }
  };

  const handleOpenAddUser = () => {
    setEditingUser(null);
    setSelectedUserPhotoFile(null);
    setUserPhotoPreview(null);
    setUserFormData({
      name: '',
      email: '',
      password: '',
      contact: '',
      role: 'hr_admin',
      department: 'Human Resources',
      photo_url: '',
      permissions: JSON.parse(JSON.stringify(ROLE_PERMISSIONS_TEMPLATES['hr_admin'] || {}))
    });
    setUserFormError(null);
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (u: SystemUser) => {
    setEditingUser(u);
    setSelectedUserPhotoFile(null);
    setUserPhotoPreview(u.photo_url || null);
    setUserFormData({
      name: u.name,
      email: u.email,
      password: '',
      contact: u.contact || '',
      role: u.role,
      department: u.department || '',
      photo_url: u.photo_url || '',
      permissions: u.permissions && Object.keys(u.permissions).length > 0
        ? u.permissions
        : JSON.parse(JSON.stringify(ROLE_PERMISSIONS_TEMPLATES[u.role] || {}))
    });
    setUserFormError(null);
    setIsUserModalOpen(true);
  };

  const handleTogglePermission = (module: string, action: string) => {
    setUserFormData(prev => {
      const currentMod = prev.permissions[module] || {};
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [module]: {
            ...currentMod,
            [action]: !currentMod[action]
          }
        }
      };
    });
  };

  const handleUserPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedUserPhotoFile(file);
      const url = URL.createObjectURL(file);
      setUserPhotoPreview(url);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);

    try {
      const url = editingUser ? `/api/settings/users/${editingUser.id}` : '/api/settings/users';
      const method = editingUser ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userFormData)
      });

      if (!res.ok) {
        const errorData = await res.json();
        setUserFormError(errorData.error || 'Failed to save user');
        return;
      }

      const savedUser = await res.json().catch(() => null);
      const targetUserId = editingUser ? editingUser.id : (savedUser?.id || savedUser?.user?.id);

      if (selectedUserPhotoFile && targetUserId) {
        try {
          const photoFormData = new FormData();
          photoFormData.append('picture', selectedUserPhotoFile);
          await authFetch(`/api/settings/users/${targetUserId}/profile-picture`, {
            method: 'POST',
            body: photoFormData
          });
        } catch (photoErr) {
          console.error('Error uploading user avatar:', photoErr);
        }
      }

      setIsUserModalOpen(false);
      fetchUsers();
    } catch (err) {
      setUserFormError('Network error while saving user');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this user profile?')) return;
    try {
      const res = await authFetch(`/api/settings/users/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(data.message || 'User deleted successfully.');
        fetchUsers();
      } else {
        alert(data.error || 'Failed to delete user.');
      }
    } catch (err) {
      console.error('Delete user error:', err);
      alert('Network error while deleting user.');
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-700 tracking-tight font-heading flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" /> Settings & User Role Management
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure company branding, address, and manage granular role-based permissions (Admin, HR, Manager, Cashier)
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveSubTab('company')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'company'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" /> Company Profile & Setup
        </button>
        <button
          onClick={() => setActiveSubTab('roles')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'roles'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> User Roles & Permissions
        </button>
        <button
          onClick={() => {
            setActiveSubTab('database');
            fetchDbStats();
          }}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'database'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Database className="w-4 h-4 text-rose-600" /> Database & Testing Tools
          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Test Mode
          </span>
        </button>
      </div>

      {/* Company Setup Subtab */}
      {activeSubTab === 'company' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs max-w-3xl">
          <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" /> Organization & Company Details
          </h3>
          <p className="text-xs text-gray-500 mb-6">
            These details appear on executive PDF reports, official salary slips, and attendance exports.
          </p>

          {companyMsg && (
            <div className={`p-3 rounded-lg text-xs font-semibold mb-5 flex items-center gap-2 ${
              companyMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {companyMsg.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {companyMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveCompany} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={companySettings.company_name}
                  onChange={(e) => setCompanySettings({ ...companySettings, company_name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-bold"
                  placeholder="e.g. Mohsin & Co"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Official Contact Number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={companySettings.contact}
                    onChange={(e) => setCompanySettings({ ...companySettings, contact: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-mono"
                    placeholder="+92 300 1234567"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Head Office Address</label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <textarea
                  rows={2}
                  value={companySettings.address}
                  onChange={(e) => setCompanySettings({ ...companySettings, address: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                  placeholder="e.g. Plot 45-C, Phase 2, DHA, Karachi, Pakistan"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Company Logo</label>
              <div className="flex items-center gap-4">
                {companySettings.logo_url ? (
                  <div className="relative w-20 h-20 rounded-lg border border-gray-300 overflow-hidden bg-gray-50 flex items-center justify-center">
                    <img src={companySettings.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setCompanySettings({ ...companySettings, logo_url: '' })}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 cursor-pointer shadow-xs"
                      title="Remove Logo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400">
                    <Building2 className="w-6 h-6" />
                    <span className="text-[9px] mt-1">No Logo</span>
                  </div>
                )}

                <div className="flex-1">
                  <input
                    type="file"
                    id="company-logo-upload"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="company-logo-upload"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-xs font-semibold text-gray-700 cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Logo File
                  </label>
                  <p className="text-[10px] text-gray-400 mt-1">PNG, JPG, or SVG up to 2MB. Logo appears on all generated PDF slips & invoices.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={isSavingCompany}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {isSavingCompany ? 'Saving...' : 'Save Company Profile'}
              </button>
            </div>

            {/* Quick Testing Tools Banner */}
            <div className="mt-6 pt-5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-amber-50/70 border border-amber-200 rounded-lg p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-amber-100 rounded-md text-amber-800">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900">Developer Testing Sandbox</div>
                  <div className="text-[11px] text-gray-600">Need to start fresh? Reset all employees and payroll entries to test from scratch.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('database');
                  fetchDbStats();
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5" /> Database Reset Tool
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Role Management Subtab */}
      {activeSubTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" /> System Users & Role Permissions
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Define and enforce granular permissions for Super Admin, HR Admin, Manager, and Cashier profiles
              </p>
            </div>

            <button
              onClick={handleOpenAddUser}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Create User Profile
            </button>
          </div>

          {/* Users Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">User Profile</th>
                    <th className="p-3.5">Contact</th>
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5">Department</th>
                    <th className="p-3.5">Module Permissions Summary</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => {
                    const effectivePerms = (u.permissions && Object.keys(u.permissions).length > 0)
                      ? u.permissions
                      : (ROLE_PERMISSIONS_TEMPLATES[u.role as UserRole] || {});

                    const permKeys = Object.keys(effectivePerms).filter(k => {
                      const mod = (effectivePerms as any)[k];
                      return typeof mod === 'object' && Object.values(mod).some(Boolean);
                    });

                    return (
                      <tr key={u.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            {u.photo_url ? (
                              <img
                                src={u.photo_url}
                                alt={u.name}
                                className="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-xs shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                                {u.name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-gray-800 text-xs sm:text-sm">{u.name}</p>
                              <p className="text-[10px] text-gray-500">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 font-mono text-gray-600">{u.contact || '--'}</td>

                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            u.role === 'super_admin' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                            u.role === 'hr_admin' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            u.role === 'manager' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            <Shield className="w-3 h-3" />
                            {u.role.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="p-3.5 text-gray-600">{u.department || 'All'}</td>

                        <td className="p-3.5">
                          <div className="flex flex-wrap gap-1">
                            {u.role === 'super_admin' ? (
                              <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                Full Access (Super Admin)
                              </span>
                            ) : permKeys.length === 0 ? (
                              <span className="text-[10px] text-gray-400 italic">No Module Access</span>
                            ) : (
                              permKeys.map(k => (
                                <span key={k} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium capitalize">
                                  {k}
                                </span>
                              ))
                            )}
                          </div>
                        </td>

                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors cursor-pointer border border-gray-300"
                              title="Edit User & Permissions"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {u.role !== 'super_admin' && (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer border border-rose-200"
                                title="Delete User"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Database & Testing Tools Subtab */}
      {activeSubTab === 'database' && (
        <div className="space-y-6 max-w-4xl">
          {/* Header & Status Alerts */}
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-rose-600" /> Database & Testing Tools (Scratch Testing Mode)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              A temporary sandbox tool for developers and QA testers to cleanly purge all mock/testing data and test the system completely from scratch.
            </p>
          </div>

          {resetSuccessMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
              <Check className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>{resetSuccessMessage}</div>
            </div>
          )}

          {resetErrorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>{resetErrorMessage}</div>
            </div>
          )}

          {/* Current Database Metrics Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-blue-600" /> Live Database Record Counts
              </h4>
              <button
                type="button"
                onClick={fetchDbStats}
                disabled={isLoadingStats}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
                {isLoadingStats ? 'Refreshing...' : 'Refresh Counts'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-gray-500 text-[11px] font-medium">Employees</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  {dbStats ? dbStats.employeesCount : '...'}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-gray-500 text-[11px] font-medium">Attendance Logs</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  {dbStats ? dbStats.attendanceCount : '...'}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-gray-500 text-[11px] font-medium">Payroll Runs</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  {dbStats ? dbStats.payrollCount : '...'}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-gray-500 text-[11px] font-medium">Payroll Adjustments</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  {dbStats ? dbStats.adjustmentsCount : '...'}
                </div>
              </div>
            </div>
          </div>

          {/* Data Preservation Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4">
              <div className="font-bold text-rose-900 mb-2 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" /> What Will Be Purged (Reset to 0):
              </div>
              <ul className="space-y-1.5 text-rose-800 list-disc list-inside text-[11px]">
                <li>All Employee profiles, CNICs, phones, & base salaries</li>
                <li>All Attendance records, biometric punches, & time overrides</li>
                <li>All Monthly payroll sheets, salary calculations, & payslips</li>
                <li>All Bonuses, fines, and advance salary deductions</li>
                <li>All Uploaded employee identity/educational document files</li>
              </ul>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
              <div className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> What Will Be Preserved (Safe):
              </div>
              <ul className="space-y-1.5 text-emerald-800 list-disc list-inside text-[11px]">
                <li>Super Administrator account (<span className="font-mono font-semibold">admin@mohsinco.com</span>)</li>
                <li>Configured Shift definitions & grace period rules</li>
                <li>Company profile settings, address, and logo</li>
                <li>Pre-configured standard Departments & Designations</li>
                <li>System user login credentials and security tokens</li>
              </ul>
            </div>
          </div>

          {/* Danger Zone Reset Action */}
          <div className="bg-red-50/50 border-2 border-red-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-red-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" /> Reset All Database Records to Scratch
                </h4>
                <p className="text-xs text-red-700 mt-1 max-w-xl">
                  Clicking this will immediately wipe the employee, attendance, and payroll databases so you can verify onboarding, attendance tracking, and salary calculation as a brand-new system.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowResetConfirmModal(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-lg text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95 shrink-0"
              >
                <Trash2 className="w-4 h-4" /> Reset Database Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Database Confirmation Modal */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-red-200 rounded-xl w-full max-w-md p-6 shadow-2xl relative text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowResetConfirmModal(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 font-heading">
                  Confirm Database Reset
                </h3>
                <p className="text-xs text-gray-500">
                  Are you sure you want to test from scratch?
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-700 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200 leading-relaxed">
              This will permanently purge <strong>all employee records</strong>, <strong>attendance history</strong>, and <strong>payroll calculations</strong>. Your admin credentials and shift configurations will remain active.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 rounded-md text-xs font-semibold text-gray-600 hover:text-gray-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleExecuteReset}
                className="px-5 py-2 rounded-md text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Purging Data...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Yes, Reset to Scratch
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Create / Edit Modal with Permission Matrix */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-2xl p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsUserModalOpen(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-1 font-heading">
              {editingUser ? 'Edit User Profile & Permissions' : 'Create New System User'}
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Set role levels and toggle granular module access (allow/block specific users from editing attendance or adding employees).
            </p>

            {userFormError && (
              <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {userFormError}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              {/* User Avatar Picker */}
              <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-blue-600 bg-gray-200 shrink-0 flex items-center justify-center">
                  {userPhotoPreview ? (
                    <img src={userPhotoPreview} alt="User Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <label className="block font-semibold text-gray-700 mb-0.5">User Profile Photo</label>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-300 rounded text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer shadow-2xs">
                    <Upload className="w-3 h-3" />
                    <span>{userPhotoPreview ? 'Change Photo' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleUserPhotoSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={userFormData.name}
                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                    placeholder="e.g. Kashif Raza"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Email Address (Login ID) *</label>
                  <input
                    type="email"
                    required
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                    placeholder="e.g. kashif@mohsinco.com"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {editingUser ? 'New Password (leave blank to keep unchanged)' : 'Account Password *'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-mono"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={userFormData.contact}
                    onChange={(e) => setUserFormData({ ...userFormData, contact: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-mono"
                    placeholder="+92 300 0000000"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Role Type *</label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as UserRole;
                      const newPerms = ROLE_PERMISSIONS_TEMPLATES[newRole] || userFormData.permissions;
                      setUserFormData({
                        ...userFormData,
                        role: newRole,
                        permissions: JSON.parse(JSON.stringify(newPerms))
                      });
                    }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="super_admin">Super Administrator</option>
                    <option value="hr_admin">HR Administrator</option>
                    <option value="manager">Manager / Supervisor</option>
                    <option value="cashier">Cashier / Accounts</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={userFormData.department}
                    onChange={(e) => setUserFormData({ ...userFormData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                    placeholder="Human Resources"
                  />
                </div>
              </div>

              {/* Granular Module Permission Matrix */}
              <div className="pt-3 border-t border-gray-200">
                <h4 className="font-bold text-gray-800 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-blue-600" /> Granular Module Permissions
                </h4>
                <p className="text-[11px] text-gray-500 mb-3">
                  Check individual actions allowed for this user across each module.
                </p>

                <div className="space-y-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                  {MODULES.map(mod => {
                    const actions = mod.actions || ['view'];
                    const currentModPerms = userFormData.permissions[mod.id] || {};

                    return (
                      <div key={mod.id} className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-gray-200 last:border-0 last:pb-0 gap-2">
                        <span className="font-bold text-gray-800 text-xs">{mod.name}</span>
                        <div className="flex flex-wrap items-center gap-3">
                          {actions.map(act => (
                            <label key={act} className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(currentModPerms[act])}
                                onChange={() => handleTogglePermission(mod.id, act)}
                                className="w-3.5 h-3.5 text-blue-600 rounded cursor-pointer accent-blue-600"
                              />
                              <span className="capitalize">{act.replace('_', ' ')}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-md font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
