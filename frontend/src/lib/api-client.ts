import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  ApiResponseEnvelope,
  AuthResponse,
  ChatRequest,
  UserListResponse,
  UserProfile,
  UserRole,
} from '../types/api';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// ── Token helpers (client-only, never called on server) ──────────────────────

export const setAccessToken = (token: string | null): void => {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('access_token', token);
  } else {
    localStorage.removeItem('access_token');
  }
};

export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
};

// ── Axios instance ────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // sends HttpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token on every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Silent token refresh on 401 ───────────────────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : token && p.resolve(token)));
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = original?.url ?? '';

    // Only attempt refresh for 401s on protected routes
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/register') &&
      !url.includes('/auth/guest-token') &&
      !url.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (original.headers) original.headers.Authorization = `Bearer ${token}`;
          return apiClient(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post<ApiResponseEnvelope<AuthResponse>>(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const { accessToken } = res.data.data;
        setAccessToken(accessToken);
        processQueue(null, accessToken);
        if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        setAccessToken(null);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Error message extractor ───────────────────────────────────────────────────

export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : String(data.message);
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
};

// ── API method wrappers ───────────────────────────────────────────────────────

export const authApi = {
  getGuestToken: async (): Promise<AuthResponse> => {
    const res = await apiClient.post<ApiResponseEnvelope<AuthResponse>>('/auth/guest-token');
    return res.data.data;
  },

  register: async (data: { email: string; password: string }): Promise<AuthResponse> => {
    const res = await apiClient.post<ApiResponseEnvelope<AuthResponse>>('/auth/register', data);
    return res.data.data;
  },

  login: async (data: { email: string; password: string }): Promise<AuthResponse> => {
    const res = await apiClient.post<ApiResponseEnvelope<AuthResponse>>('/auth/login', data);
    return res.data.data;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setAccessToken(null);
    }
  },

  getProfile: async (): Promise<UserProfile> => {
    const res = await apiClient.get<ApiResponseEnvelope<UserProfile>>('/auth/me');
    return res.data.data;
  },
};

export const chatApi = {
  sendMessage: async (
    data: ChatRequest
  ): Promise<{ response: string; rateLimitRemaining?: number; rateLimitLimit?: number }> => {
    const res = await apiClient.post<ApiResponseEnvelope<unknown>>('/chat', data);

    const remaining = res.headers['x-ratelimit-remaining'];
    const limit = res.headers['x-ratelimit-limit'];

    const raw = res.data.data;
    let text = '';
    if (typeof raw === 'string') {
      text = raw;
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      text = String(obj.answer ?? obj.response ?? obj.message ?? JSON.stringify(raw));
    }

    return {
      response: text,
      rateLimitRemaining: remaining !== undefined ? parseInt(remaining, 10) : undefined,
      rateLimitLimit: limit !== undefined ? parseInt(limit, 10) : undefined,
    };
  },

  uploadDocument: async (file: File, force = false): Promise<unknown> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<ApiResponseEnvelope<unknown>>(
      `/documents/upload?force=${force}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return res.data.data;
  },
};

export const usersApi = {
  getUsers: async (page = 1, limit = 20): Promise<UserListResponse> => {
    const res = await apiClient.get<ApiResponseEnvelope<UserListResponse>>(
      `/users?page=${page}&limit=${limit}`
    );
    return res.data.data;
  },

  updateRole: async (userId: string, role: UserRole): Promise<UserProfile> => {
    const res = await apiClient.put<ApiResponseEnvelope<UserProfile>>(
      `/users/${userId}/role`,
      { role }
    );
    return res.data.data;
  },

  deleteUser: async (userId: string): Promise<void> => {
    await apiClient.delete(`/users/${userId}`);
  },
};
