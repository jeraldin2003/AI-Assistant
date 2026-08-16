'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, getAccessToken, setAccessToken } from '../lib/api-client';
import type { UserProfile } from '../types/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  isUser: boolean;
  authModalOpen: boolean;
  authModalTab: 'login' | 'register';
  openAuthModal: (tab?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openAuthModal = (tab: 'login' | 'register' = 'login') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => setAuthModalOpen(false);

  const applyAuth = (token: string, profile: UserProfile) => {
    setAccessToken(token);
    setUser(profile);
  };

  // Issue a fresh guest token and apply it
  const issueGuestToken = async () => {
    const res = await authApi.getGuestToken();
    applyAuth(res.accessToken, res.user);
  };

  // ── Initial auth — runs only on the client after mount ────────────────────

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setIsLoading(true);

      // Try to restore existing session from localStorage
      const existingToken = getAccessToken();
      if (existingToken) {
        try {
          const profile = await authApi.getProfile();
          if (!cancelled) {
            setUser(profile);
            setIsLoading(false);
            return;
          }
        } catch {
          // Token expired or invalid — clear it and fall through to guest
          setAccessToken(null);
        }
      }

      // No valid session → auto-issue a guest token
      try {
        const res = await authApi.getGuestToken();
        if (!cancelled) applyAuth(res.accessToken, res.user);
      } catch (err) {
        console.error('[Auth] Failed to issue guest token:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Auth actions ──────────────────────────────────────────────────────────

  const login = async (email: string, pass: string) => {
    const res = await authApi.login({ email, password: pass });
    applyAuth(res.accessToken, res.user);
    closeAuthModal();
  };

  const register = async (email: string, pass: string) => {
    const res = await authApi.register({ email, password: pass });
    applyAuth(res.accessToken, res.user);
    closeAuthModal();
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch {
      // ignore logout errors — still clear local state
    }
    setUser(null);

    // Immediately issue a new guest session after logout
    try {
      await issueGuestToken();
    } catch (err) {
      console.error('[Auth] Failed to re-issue guest token after logout:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    try {
      const profile = await authApi.getProfile();
      setUser(profile);
    } catch (err) {
      console.error('[Auth] Failed to refresh profile:', err);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const isGuest = user?.role === 'guest';
  const isAdmin = user?.role === 'admin';
  const isUser = user?.role === 'user';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isGuest,
        isAdmin,
        isUser,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
