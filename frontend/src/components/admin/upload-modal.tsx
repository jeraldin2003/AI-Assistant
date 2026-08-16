'use client';

import React, { useState } from 'react';
import { X, UploadCloud, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { chatApi, getErrorMessage } from '../../lib/api-client';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [force, setForce] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  if (!isOpen) return null;

  const validate = (f: File): string | null => {
    if (!f.name.toLowerCase().endsWith('.pdf')) return 'Only PDF files are supported.';
    if (f.size > 50 * 1024 * 1024) return 'File must be under 50 MB.';
    return null;
  };

  const pickFile = (f: File) => {
    const err = validate(f);
    setError(err);
    setSuccess(null);
    if (!err) setFile(f);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) pickFile(e.target.files[0]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) pickFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file.'); return; }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await chatApi.uploadDocument(file, force);
      const msg =
        typeof result === 'string'
          ? result
          : (result as Record<string, string>)?.message ?? 'Document ingested successfully.';
      setSuccess(msg);
      setFile(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Upload PDF Document</h2>
            <p className="text-xs text-slate-400 mt-0.5">Index content into the RAG vector store</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleUpload} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed rounded-xl transition-colors ${
              dragging ? 'border-slate-500 bg-slate-50' : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            <input
              type="file"
              accept=".pdf"
              onChange={onFileInput}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            {file ? (
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700 max-w-[220px] truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            ) : (
              <>
                <UploadCloud className="w-8 h-8 text-slate-400" />
                <p className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">Click to choose</span> or drag & drop
                </p>
                <p className="text-xs text-slate-400">PDF files up to 50 MB</p>
              </>
            )}
          </div>

          {/* Force re-index */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 accent-slate-700"
            />
            <span className="text-xs text-slate-600">Force re-index (overwrite existing embeddings)</span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={uploading || !file}
            className="w-full py-2.5 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? 'Ingesting…' : 'Upload & Ingest'}
          </button>
        </form>
      </div>
    </div>
  );
};
