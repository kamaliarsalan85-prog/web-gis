import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Square3Stack3DIcon,
  TableCellsIcon,
  VariableIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  UserCircleIcon,
  ArrowRightStartOnRectangleIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

export default function Navbar({
  activePanel,
  setActivePanel,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onOpenLogin,
  onOpenAdmin
}) {
  const { user, logout, isAdmin, hasToolPermission } = useAuth();

  const tools = [
    { id: 'layers', name: 'Layers', icon: Square3Stack3DIcon, permission: 'stats' },
    { id: 'table', name: 'Attributes', icon: TableCellsIcon, permission: 'filter' },
    { id: 'spatial', name: 'Spatial Tools', icon: VariableIcon, permission: 'spatial' },
    { id: 'visual', name: 'Thematic', icon: PaintBrushIcon, permission: 'visual' },
    { id: 'draw', name: 'Draw & Edit', icon: PencilSquareIcon, permission: 'draw' },
  ];

  return (
    <header className="h-14 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 z-30 shadow-md">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-sm shadow-blue-500/20">
          GIS
        </div>
        <div>
          <h1 className="text-sm font-semibold text-white tracking-wide">GeoPlatform</h1>
          <p className="text-[10px] text-slate-400">Enterprise Spatial Engine</p>
        </div>
      </div>

      {/* Center Tools */}
      <div className="flex items-center gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50">
        {tools.map((t) => {
          const isAllowed = hasToolPermission(t.permission);
          const isActive = activePanel === t.id;
          const Icon = t.icon;

          if (!isAllowed) return null;

          return (
            <button
              key={t.id}
              onClick={() => setActivePanel(isActive ? null : t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.name}</span>
            </button>
          );
        })}
      </div>

      {/* Right Search & Auth */}
      <div className="flex items-center gap-2">
        {/* Quick Search */}
        <form onSubmit={onSearchSubmit} className="relative hidden md:block">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parcels, streets..."
            className="w-48 lg:w-64 bg-slate-800/80 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
        </form>

        {/* Admin Dashboard */}
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              activePanel === 'admin'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
            title="Admin Console"
          >
            <ShieldCheckIcon className="w-4 h-4 text-indigo-400" />
            <span className="hidden lg:inline">Admin</span>
          </button>
        )}

        {/* User Badge / Login */}
        {user ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium text-slate-200">{user.username}</p>
              <span className="text-[10px] uppercase font-semibold text-blue-400 bg-blue-950/80 px-1.5 py-0.2 rounded border border-blue-800/50">
                {user.role}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Sign Out"
            >
              <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLogin}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 shadow-sm transition-colors"
          >
            <UserCircleIcon className="w-4 h-4" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
