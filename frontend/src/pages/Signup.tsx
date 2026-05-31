import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { API_BASE_URL, api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function Signup() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/auth/signup`, {
        email,
        password,
        full_name: fullName || null,
      });
      // Auto-login after signup
      const form = new URLSearchParams({ username: email, password });
      const { data } = await axios.post(`${API_BASE_URL}/auth/login`, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      setTokens(data.access_token, data.refresh_token);
      const me = await api.get('/auth/me');
      setUser(me.data);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Signup failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 glass">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-accent shadow-glow flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-bg" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
              <p className="text-xs text-muted">Free for development use</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-muted uppercase tracking-wide">Full name (optional)</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wide">Password (8+ chars)</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating…' : 'Create account'}
            </Button>
          </form>

          <p className="text-sm text-muted mt-6 text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
