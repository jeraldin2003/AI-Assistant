'use client';

import React, { createContext, useContext, useState } from 'react';
import { chatApi, getErrorMessage } from '../lib/api-client';
import type { ChatMessage } from '../types/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RateLimitInfo {
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
}

interface ChatContextType {
  messages: ChatMessage[];
  isLoading: boolean;
  topK: number;
  setTopK: (v: number) => void;
  rateLimitInfo: RateLimitInfo | null;
  errorMessage: string | null;
  sendMessage: (prompt: string) => Promise<void>;
  clearChat: () => void;
  dismissError: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [topK, setTopK] = useState(5);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearChat = () => {
    setMessages([]);
    setErrorMessage(null);
  };

  const dismissError = () => setErrorMessage(null);

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;

    setErrorMessage(null);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: now,
    };

    // Snapshot messages before the user message for history
    const historySnapshot = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await chatApi.sendMessage({ prompt, history: historySnapshot, top_k: topK });

      // Update rate limit display
      if (res.rateLimitRemaining !== undefined || res.rateLimitLimit !== undefined) {
        setRateLimitInfo({
          rateLimitRemaining: res.rateLimitRemaining,
          rateLimitLimit: res.rateLimitLimit,
        });
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const msg = getErrorMessage(err);
      setErrorMessage(msg);

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${msg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ChatContext.Provider
      value={{ messages, isLoading, topK, setTopK, rateLimitInfo, errorMessage, sendMessage, clearChat, dismissError }}
    >
      {children}
    </ChatContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useChat = (): ChatContextType => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};
