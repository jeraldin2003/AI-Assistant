'use client';

import React from 'react';
import { Menu, Plus } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useChat } from '../../context/chat-context';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { isGuest, isAdmin } = useAuth();
  const { clearChat } = useChat();

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 md:hidden sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
            AI
          </div>
          <span className="font-semibold text-sm text-slate-800">
            RAG Assistant
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
            {isAdmin ? 'Admin' : isGuest ? 'Guest' : 'User'}
          </span>
        </div>
      </div>

      <button
        onClick={clearChat}
        className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
        title="New Chat"
      >
        <Plus className="w-5 h-5" />
      </button>
    </header>
  );
};
