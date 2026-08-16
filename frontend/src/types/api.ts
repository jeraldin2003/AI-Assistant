export type UserRole = 'admin' | 'user' | 'guest';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface ApiErrorEnvelope {
  success: false;
  statusCode: number;
  message: string | string[];
  path: string;
  timestamp: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ title?: string; text?: string; score?: number }>;
  timestamp?: string;
}

export interface ChatRequest {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
  top_k?: number;
}

export interface UserListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserListResponse {
  users: UserProfile[];
  meta: UserListMeta;
}
