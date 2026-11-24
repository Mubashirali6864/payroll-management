import React, { useState, useEffect } from 'react';
import { UserRole, User } from '../types';
import { 
  Shield, 
  Radio, 
  CheckCircle2, 
  Power,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { authFetch } from '../auth/AuthContext';

interface NavbarProps {
  currentUser: User;
  onRoleSwitch: (role: UserRole) => void;
  activeDevicesCount: number;
  onLogout: () => void;
  onPunchSimulated?: () => void;
  employeesList?: any[];
  onMenuToggle?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onRoleSwitch,
  activeDevicesCount,
  onLogout,
  onMenuToggle
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { logout } = useAuth();
  const [companyLogo, setCompanyLogo] = useState<string>('');

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const res = await authFetch('/api/settings/company');
        if (res.ok) {
          const data = await res.json();
          setCompanyLogo(data.logo_url || '');
        }
      } catch (e) {
        console.error('Failed to load logo:', e);
      }
    };
    loadLogo();

    // Refresh the header logo immediately when it changes in Settings, without a page reload.
    const handleLogoUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.logo_url === 'string') {
        setCompanyLogo(detail.logo_url);
      } else {
        loadLogo();
      }
    };
    window.addEventListener('company:logo-updated', handleLogoUpdated);
    return () => window.removeEventListener('company:logo-updated', handleLogoUpdated);
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleLogout = () => {
    logout();
    onLogout();
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 px-4 md:px-6 py-3 shadow-sm flex items-center justify-between">
        {/* Left: Menu Toggle + Brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuToggle}
            className="p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Toggle sidebar menu"
            title="Toggle sidebar menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-2">
            {companyLogo && (
              <img 
                src={companyLogo} 
                alt="Company Logo" 
                className="h-8 w-auto rounded" 
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <div className="flex items-center gap-1.5">
              <h1 className="font-black text-lg md:text-xl tracking-tight text-gray-900 font-heading">
                Mohsin & Co.
              </h1>
              <span className="text-gray-500 text-xs font-semibold hidden sm:inline-block border-l border-gray-200 pl-2">
                Payroll & Attendance
              </span>
            </div>
          </div>
        </div>

        {/* Right Controls Area */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* ZKTeco Device Terminal Status Badge */}
          <div className="hidden lg:flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-md text-xs border border-blue-100 text-blue-800">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-semibold text-[11px]">
              {activeDevicesCount > 0 ? `${activeDevicesCount} Terminal Online` : 'ZKTeco ADMS Live'}
            </span>
          </div>



          {/* Logout button */}
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all rounded-full cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* Toast Notification Floating Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-4 left-4 md:right-6 md:left-auto z-50 bg-emerald-600 text-white p-3.5 rounded-lg shadow-xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="text-xs font-bold">{toastMessage}</p>
        </div>
      )}
    </>
  );
};
