import React, { useState } from 'react';
import { Shield, User, ChevronDown, Check, LogOut, Sparkles } from 'lucide-react';
import { AppUser } from '../../types';

interface UserMenuProps {
  currentUser: AppUser;
  allUsers: AppUser[];
  onSelectUser: (user: AppUser) => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ currentUser, allUsers, onSelectUser }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getRoleBadge = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'editor':
      case 'member':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="relative">
      <button
        id="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 border border-slate-200/80 transition-colors bg-white shadow-2xs"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center font-bold text-xs shadow-xs">
          {currentUser.name.charAt(0).toUpperCase()}
        </div>
        <div className="text-left hidden sm:block">
          <div className="text-xs font-semibold text-slate-800 leading-tight">
            {currentUser.name}
          </div>
          <div className="text-[10px] text-slate-500 capitalize">{currentUser.role}</div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            id="user-menu-dropdown"
            className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-1"
          >
            <div className="px-4 py-2.5 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-900">{currentUser.name}</p>
              <p className="text-[11px] text-slate-500 font-mono">{currentUser.email}</p>
              <span
                className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mt-1.5 ${getRoleBadge(
                  currentUser.role
                )}`}
              >
                Role: {currentUser.role}
              </span>
            </div>

            <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Switch Test Persona
            </div>

            <div className="px-1.5 space-y-0.5">
              {allUsers.map((u) => {
                const isSelected = u.id === currentUser.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      onSelectUser(u);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                      isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <div className="text-xs">{u.name}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{u.role}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
