'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Copy,
  Check,
  SlidersHorizontal,
  AlertTriangle,
  Sparkles,
  User,
} from 'lucide-react';
import { useChat } from '../../context/chat-context';
import { useAuth } from '../../context/auth-context';

// ── Starter suggestion prompts ────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: 'Explain RAG Architecture', sub: 'How does retrieval-augmented generation work?' },
  { label: 'Summarize uploaded PDFs', sub: 'Give me an overview of the knowledge base.' },
  { label: 'Vector embeddings guide', sub: 'How do semantic embeddings improve answers?' },
  { label: 'Extract technical details', sub: 'Find specific specs in the uploaded documents.' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const ChatInterface: React.FC = () => {
  const { messages, isLoading, topK, setTopK, rateLimitInfo, sendMessage } = useChat();
  const { isGuest, openAuthModal } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTopK, setShowTopK] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Close Top-K popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-topk-panel]')) setShowTopK(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const submit = () => {
    if (!prompt.trim() || isLoading) return;
    sendMessage(prompt.trim());
    setPrompt('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs font-medium text-slate-500">RAG Microservice</span>
        </div>

        {/* Top-K control */}
        <div className="relative" data-topk-panel>
          <button
            onClick={() => setShowTopK((s) => !s)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Top-K: {topK}
          </button>

          {showTopK && (
            <div className="absolute right-0 top-full mt-1 w-56 p-3 bg-white border border-slate-200 rounded-lg shadow-md z-10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-slate-700">Retrieval chunks</span>
                <span className="text-xs font-mono text-slate-900">{topK}</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full accent-slate-700"
              />
              <p className="mt-1.5 text-[10px] text-slate-400 leading-snug">
                Number of document chunks retrieved from the vector store per query.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Guest rate-limit banner ───────────────────────────────────── */}
      {isGuest && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Guest: <strong>2 requests/hour</strong>
              {rateLimitInfo?.rateLimitRemaining !== undefined && (
                <> · {rateLimitInfo.rateLimitRemaining} remaining</>
              )}
            </span>
          </div>
          <button
            onClick={() => openAuthModal('register')}
            className="text-xs font-medium text-amber-700 underline hover:text-amber-900"
          >
            Register for unlimited →
          </button>
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="max-w-xl mx-auto text-center space-y-6 pt-8">
            <div className="w-12 h-12 mx-auto rounded-xl bg-slate-800 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-800">How can I help you?</h2>
              <p className="text-sm text-slate-500 mt-1">
                Ask anything about your uploaded documents.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => sendMessage(s.label)}
                  className="p-3 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-700">{s.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="max-w-2xl mx-auto space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-xs font-bold ${
                    msg.role === 'user' ? 'bg-slate-700' : 'bg-slate-800'
                  }`}
                >
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                </div>

                {/* Bubble */}
                <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-slate-800 text-white rounded-tr-sm'
                        : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                    }`}
                  >
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  </div>

                  {/* Copy + timestamp row for assistant */}
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-3 mt-1 px-1">
                      {msg.timestamp && (
                        <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                      )}
                      <button
                        onClick={() => copyText(msg.content, msg.id!)}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <><Check className="w-3 h-3 text-green-500" /><span className="text-green-500">Copied</span></>
                        ) : (
                          <><Copy className="w-3 h-3" />Copy</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading dots */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="px-4 py-3 bg-slate-100 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input area ───────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-200 bg-white shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-2 border border-slate-300 rounded-xl px-3 py-2 focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-slate-300 transition-all bg-white">
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder="Ask a question about your documents…"
            className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none py-1 leading-relaxed max-h-48 overflow-y-auto"
          />
          <button
            onClick={submit}
            disabled={!prompt.trim() || isLoading}
            className="p-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-30 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2">
          RAG Assistant · NestJS gateway · FastAPI vector search
        </p>
      </div>
    </div>
  );
};
