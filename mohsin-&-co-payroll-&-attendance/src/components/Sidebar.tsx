import React from 'react';
import { 
  Home, 
  Users2, 
  CalendarCheck2, 
  DollarSign, 
  BarChart3, 
  Settings,
  User as UserIcon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export type NavTab = 'dashboard' | 'employees' | 'attendance' | 'payroll' | 'reports' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  role: string;
  userName?: string;
  userEmail?: string;
  userPhoto?: string;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onTabChange, 
  role,
  userName = 'Demo',
  userEmail = 'admin@mohsinco.com',
  userPhoto,
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const menuItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: Home },
    { id: 'employees' as NavTab, label: 'HR Management', icon: Users2 },
    { id: 'attendance' as NavTab, label: 'Attendance & Shifts', icon: CalendarCheck2 },
    { id: 'payroll' as NavTab, label: 'Payroll Management', icon: DollarSign },
    { id: 'reports' as NavTab, label: 'Reports', icon: BarChart3 },
    { id: 'settings' as NavTab, label: 'Settings & Roles', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 md:hidden transition-opacity duration-300"
          onClick={onCloseMobile}
          aria-label="Close sidebar backdrop"
        />
      )}

      {/* Mobile Slide-in Drawer Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white border-r border-gray-200 flex flex-col p-4 shadow-2xl md:hidden transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Menu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900 tracking-tight">Mohsin & Co.</div>
              <div className="text-[10px] text-gray-500 font-medium">Payroll Navigation</div>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Card */}
        <div className="bg-gray-50/90 rounded-xl p-3 border border-gray-200/80 mb-4 flex items-center gap-3">
          {userPhoto ? (
            <img src={userPhoto} alt={userName} className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold text-sm">
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-blue-700 truncate">{userName}</div>
            <div className="text-[11px] font-semibold text-gray-800 capitalize leading-tight">{role.replace('_', ' ')}</div>
            <div className="text-[10px] text-gray-500 truncate">{userEmail}</div>
          </div>
        </div>

        {/* Mobile Navigation Menu List */}
        <div className="space-y-1.5 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  onCloseMobile?.();
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'text-white font-bold bg-blue-600 shadow-sm shadow-blue-500/20'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Desktop Vertical Sidebar */}
      <aside 
        className={`hidden md:flex ${
          isCollapsed ? 'w-[72px]' : 'w-60'
        } bg-white border-r border-gray-200 text-gray-700 flex-col shrink-0 min-h-[calc(100vh-57px)] px-3 py-4 transition-[width] duration-300 ease-in-out overflow-x-hidden`}
      >
        {/* User Profile Card */}
        <div 
          className={`rounded-xl border transition-all duration-300 ease-in-out flex items-center overflow-hidden mb-4 ${
            isCollapsed 
              ? 'bg-transparent border-transparent px-1 py-1' 
              : 'bg-gray-50/90 border-gray-200/80 px-2.5 py-2.5 gap-3'
          }`}
        >
          {userPhoto ? (
            <img 
              src={userPhoto} 
              alt={userName} 
              title={isCollapsed ? `${userName} (${role.replace('_', ' ')})` : undefined}
              className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0 shadow-xs" 
            />
          ) : (
            <div 
              title={isCollapsed ? `${userName} (${role.replace('_', ' ')})` : undefined}
              className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold text-xs border border-blue-200 shadow-xs"
            >
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <div 
            className={`min-w-0 flex-1 whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
              isCollapsed ? 'opacity-0 max-w-0 pointer-events-none' : 'opacity-100 max-w-[140px]'
            }`}
          >
            <div className="text-xs font-bold text-blue-700 truncate">{userName}</div>
            <div className="text-[11px] font-semibold text-gray-800 capitalize leading-tight">{role.replace('_', ' ')}</div>
            <div className="text-[10px] text-gray-500 truncate">{userEmail}</div>
          </div>
        </div>

        {/* Navigation Menu List */}
        <div className="space-y-1.5 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`group relative w-full h-10 flex items-center px-3 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'text-blue-700 font-bold bg-blue-50/90 border border-blue-100/80 shadow-xs'
                    : 'text-gray-700 hover:bg-gray-100/80 hover:text-gray-900 border border-transparent'
                }`}
              >
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  <Icon className={`w-4.5 h-4.5 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-500 group-hover:text-gray-700'}`} />
                </div>
                <div 
                  className={`ml-2.5 whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
                    isCollapsed ? 'opacity-0 max-w-0 pointer-events-none -translate-x-1' : 'opacity-100 max-w-[145px] translate-x-0'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                </div>

                {/* Floating Tooltip when collapsed */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded-md shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                    {item.label}
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Desktop Collapse / Expand toggle button at bottom */}
        {onToggleCollapse && (
          <div className="pt-3 border-t border-gray-100 mt-auto">
            <button
              onClick={onToggleCollapse}
              className="group relative w-full h-10 flex items-center px-3 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-600" /> : <ChevronLeft className="w-4 h-4 text-gray-600" />}
              </div>
              <div 
                className={`ml-2.5 whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out ${
                  isCollapsed ? 'opacity-0 max-w-0 pointer-events-none -translate-x-1' : 'opacity-100 max-w-[140px] translate-x-0'
                }`}
              >
                <span>Collapse Sidebar</span>
              </div>
              {isCollapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900 text-white text-[11px] font-medium rounded-md shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  Expand Sidebar
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                </div>
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

