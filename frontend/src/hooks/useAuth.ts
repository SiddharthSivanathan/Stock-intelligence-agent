import { useAuthStore } from '@/stores/auth';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  return {
    user,
    accessToken,
    logout,
    isAuthenticated: Boolean(accessToken),
  };
}
