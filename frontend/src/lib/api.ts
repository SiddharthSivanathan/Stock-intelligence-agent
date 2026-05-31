import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:8000/api/v1';

export const api = axios.create({ baseURL: API_BASE_URL });

// ---- Request interceptor: attach access token ----
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Response interceptor: refresh on 401 (single-flight) ----
let isRefreshing = false;
type QueuedReq = (token: string) => void;
let queue: QueuedReq[] = [];

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((newToken) => {
          original.headers = original.headers ?? {};
          (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
          resolve(api(original));
        });
      });
    }

    original._retry = true;
    isRefreshing = true;
    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });
      useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
      queue.forEach((cb) => cb(data.access_token));
      queue = [];
      original.headers = original.headers ?? {};
      (original.headers as Record<string, string>).Authorization = `Bearer ${data.access_token}`;
      return api(original);
    } catch (refreshErr) {
      useAuthStore.getState().logout();
      queue = [];
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);
