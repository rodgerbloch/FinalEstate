import { useState } from 'react';
import {
  Bell,
  Bot,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  FolderLock,
  LogOut,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import type { Estate, NavSection } from '../types/estate';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  estate: Estate;
  allEstates: Array<{ id: string; title: string; isOwner: boolean; roleLabel: string }>;
  onSwitchEstate: (estateId: string) => void;
  onOpenNewTask: () => void;
  onEditEstateProfile: () => void;
  canEdit: boolean;
  isOwner: boolean;
  completedCount: number;
  totalCount: number;
  pendingInvitesCount: number;
  activeRemindersCount: number;
  userEmail: string;
  userName: string;
  userPhoto: string;
  onOpenTour: () => void;
  onSignOut: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  activeNav,
  onSelectNav,
  estate,
  allEstates,
  onSwitchEstate,
  onOpenNewTask,
  onEditEstateProfile,
  canEdit,
  isOwner,
  completedCount,
  totalCount,
  pendingInvitesCount,
  activeRemindersCount,
  userEmail,
  userName,
  userPhoto,
  onOpenTour,
  onSignOut,
}: SidebarProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const navItems: Array<{
    id: NavSection;
    label: string;
    mobileLabel: string;
    icon: typeof CheckSquare;
    badge?: number;
  }> = [
    { id: 'tasks', label: 'Master Checklist', mobileLabel: 'Tasks', icon: CheckSquare },
    { id: 'summary', label: 'Executive Summary', mobileLabel: 'Summary', icon: FileText },
    { id: 'vault', label: 'Document Vault', mobileLabel: 'Vault', icon: FolderLock },
    { id: 'sharing', label: 'Shared Access', mobileLabel: 'Sharing', icon: Users, badge: pendingInvitesCount || undefined },
    { id: 'consultant', label: 'AI Consultant', mobileLabel: 'AI', icon: Bot },
  ];

  const brandEmblem = (
    <div
      className={`${
        collapsed ? 'w-9 h-9' : 'w-10 h-10'
      } rounded-lg border border-[#D7CFC0] bg-[#F4EFE4] overflow-hidden shrink-0 flex items-center justify-center`}
    >
      {!logoError ? (
        <img
          src="/src/assets/images/estate_ledger_logo_1795459970048.jpg"
          alt="Estate Ledger archival oak emblem"
          referrerPolicy="no-referrer"
          onError={() => setLogoError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-display text-sm font-semibold text-[#1B4332]">EL</span>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop & Tablet Sidebar / Rail */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-[#F4EFE4] border-r border-[#E4DFD3] transition-all duration-200 select-none ${
          collapsed ? 'w-[76px]' : 'w-[268px]'
        } lg:${collapsed ? 'w-[76px]' : 'w-[268px]'}`}
      >
        {/* Brand & Collapse Toggle */}
        <div
          className={`px-4 py-4 border-b border-[#E4DFD3] flex ${
            collapsed ? 'flex-col items-center gap-2.5' : 'items-center justify-between gap-2.5'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {brandEmblem}
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-display text-lg font-semibold text-[#1C2420] truncate leading-tight">
                  Estate Ledger
                </div>
                <div className="text-[11px] text-[#56635C] truncate">
                  {estate.activeStage}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-lg text-[#56635C] hover:text-[#1C2420] hover:bg-[#E9E2D3] transition-colors shrink-0 cursor-pointer"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Estate Title & Switcher */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-[#E4DFD3] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[#56635C]">Active Estate</span>
              {isOwner && (
                <button
                  type="button"
                  onClick={onEditEstateProfile}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1B4332] hover:underline whitespace-nowrap cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
            {allEstates.length > 1 ? (
              <select
                value={estate.id}
                onChange={(e) => onSwitchEstate(e.target.value)}
                aria-label="Select active estate"
                className="w-full px-2.5 py-1.5 text-sm font-medium text-[#1C2420] bg-white border border-[#E4DFD3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4332]/25"
              >
                {allEstates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.roleLabel})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm font-semibold text-[#1C2420] truncate" title={estate.title}>
                {estate.title}
              </div>
            )}
            <div className="text-xs text-[#56635C] truncate">
              Principal: {estate.principalName}
            </div>
          </div>
        )}

        {/* Primary Action */}
        <div className="px-3 pt-4 pb-2">
          <button
            type="button"
            onClick={onOpenNewTask}
            disabled={!canEdit}
            title={canEdit ? 'Create new estate task' : 'View Only collaborators cannot add tasks'}
            className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-medium text-white bg-[#1B4332] hover:bg-[#255742] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              collapsed ? 'px-0' : ''
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && <span>New Task</span>}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-tour={`nav-${item.id}`}
                onClick={() => onSelectNav(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white text-[#1B4332] border border-[#E4DFD3]'
                    : 'text-[#4F5B54] hover:text-[#1C2420] hover:bg-[#EAE3D4]'
                } ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && item.badge ? (
                  <span className="font-mono text-xs tabular-nums text-[#9C7832] font-semibold">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Interactive Executor Tour Trigger */}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={onOpenTour}
            title="Start interactive executor onboarding tour"
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#1B4332] bg-[#FBF9F4] hover:bg-[#EAE3D4] border border-[#E4DFD3] transition-colors whitespace-nowrap cursor-pointer ${
              collapsed ? 'justify-center px-2' : ''
            }`}
          >
            <Compass className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Executor Tour</span>}
          </button>
        </div>

        {/* Live Estate Readiness Meter */}
        {!collapsed && (
          <div className="mx-3 mb-3 p-3.5 bg-white border border-[#E4DFD3] rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#1C2420]">Estate Readiness</span>
              <span className="font-mono font-semibold text-[#1B4332] tabular-nums">{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#EAE4D7] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1B4332] transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#56635C] tabular-nums">
              <span>{completedCount} of {totalCount} complete</span>
              {activeRemindersCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[#9C7832]">
                  <Bell className="w-3 h-3" />
                  {activeRemindersCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* User Account Menu */}
        <div className="p-3 border-t border-[#E4DFD3] relative">
          <button
            type="button"
            onClick={() => setAccountOpen((prev) => !prev)}
            className={`w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#EAE3D4] transition-colors text-left cursor-pointer ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {userPhoto ? (
              <img
                src={userPhoto}
                alt={userName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-[#E4DFD3] shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#1B4332] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {userName.slice(0, 1).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#1C2420] truncate">{userName}</div>
                <div className="text-[11px] text-[#56635C] truncate">{userEmail}</div>
              </div>
            )}
          </button>

          {accountOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-[#E4DFD3] rounded-lg p-2 z-30 shadow-sm space-y-1">
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    onEditEstateProfile();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#1C2420] hover:bg-[#F4EFE4] rounded-md whitespace-nowrap cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Estate Details
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  onSignOut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#B42318] hover:bg-[#FEF3F2] rounded-md whitespace-nowrap cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (<= 15% viewport height) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 bg-[#F4EFE4] border-t border-[#E4DFD3] z-30 flex items-center justify-around px-2 py-1.5"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-tour={`nav-${item.id}`}
              onClick={() => onSelectNav(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                active ? 'text-[#1B4332] bg-white border border-[#E4DFD3]' : 'text-[#56635C]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.mobileLabel}</span>
            </button>
          );
        })}
        {canEdit && (
          <button
            type="button"
            onClick={onOpenNewTask}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white bg-[#1B4332] whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
          </button>
        )}
      </nav>
    </>
  );
}
