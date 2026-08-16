'use client';

import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  UploadCloud,
  Users,
  LogIn,
  LogOut,
  Shield,
  UserCheck,
  UserX,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useChat } from '../../context/chat-context';
import { AuthModal } from '../auth/auth-modal';
import { UploadModal } from '../admin/upload-modal';
import { UserManagementModal } from '../admin/user-management-modal';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mobileOpen = false,
  onMobileClose,
}) => {
  const { user, isGuest, isAdmin, isUser, openAuthModal, logout } = useAuth();
  const { clearChat, messages } = useChat();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [userMgmtModalOpen, setUserMgmtModalOpen] = useState(false);

  const handleNewChat = () => {
    clearChat();
    onMobileClose?.();
  };

  const getInitials = () => {
    if (!user || isGuest) return 'G';
    return user.email.slice(0, 2).toUpperCase();
  };

  const roleLabel = isAdmin ? 'Admin' : isUser ? 'User' : 'Guest';
  const roleBgClass = isAdmin
    ? 'bg-amber-100 text-amber-700'
    : isUser
    ? 'bg-green-100 text-green-700'
    : 'bg-slate-100 text-slate-600';

  const activeConversationLabel =
    messages.length > 0
      ? messages[0].content.slice(0, 28) + (messages[0].content.length > 28 ? '…' : '')
      : 'New conversation';

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/*
        Desktop: static flex child (width fixed, participates in layout).
        Mobile: fixed drawer that slides in from the left.
      */}
      <aside
        className={[
          // Shared styles
          'flex flex-col w-64 shrink-0 bg-white border-r border-slate-200',
          // Mobile: fixed drawer
          'fixed inset-y-0 left-0 z-50 md:static md:z-auto',
          // Mobile open/close transition
          'transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* ── Brand header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">RAG Assistant</p>
              <p className="text-[11px] text-slate-400 leading-tight">NestJS · FastAPI</p>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── New chat ───────────────────────────────────────────────── */}
        <div className="px-3 pt-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4 text-slate-500" />
            New chat
          </button>
        </div>

        {/* ── Conversations ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 space-y-4">
          <section>
            <p className="px-1 mb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Conversations
            </p>
            <button
              onClick={onMobileClose}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 bg-slate-100 rounded-lg text-left"
            >
              <MessageSquare className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="truncate">{activeConversationLabel}</span>
            </button>
          </section>

          {/* ── Admin tools ────────────────────────────────────────── */}
          {isAdmin && (
            <section className="border-t border-slate-200 pt-4">
              <p className="px-1 mb-1 text-[11px] font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1">
                <Shield className="w-3 h-3" /> Admin
              </p>
              <div className="space-y-0.5">
                <button
                  onClick={() => { setUploadModalOpen(true); onMobileClose?.(); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-slate-500" />
                    Upload Document
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  onClick={() => { setUserMgmtModalOpen(true); onMobileClose?.(); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    Manage Users
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </section>
          )}
        </div>

        {/* ── Profile footer ────────────────────────────────────────── */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-2.5 px-2 py-2">
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-slate-700 text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {getInitials()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-800 truncate">
                {isGuest ? 'Guest User' : user?.email}
              </p>
              <span className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0 rounded ${roleBgClass}`}>
                {roleLabel}
              </span>
            </div>

            {/* Auth action */}
            {isGuest ? (
              <button
                onClick={() => openAuthModal('login')}
                title="Sign in"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <LogIn className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={logout}
                title="Sign out"
                className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Guest upsell */}
          {isGuest && (
            <button
              onClick={() => openAuthModal('register')}
              className="w-full mt-1 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              Create free account →
            </button>
          )}
        </div>
      </aside>

      {/* Modals rendered outside the sidebar to avoid z-index issues */}
      <AuthModal />
      <UploadModal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
      <UserManagementModal isOpen={userMgmtModalOpen} onClose={() => setUserMgmtModalOpen(false)} />
    </>
  );
};
