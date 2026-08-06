import { FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { signIn } from '../services/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed. Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dm-app-bg dm-glow flex items-center justify-center" style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <div
        className="dm-glow-orb"
        style={{ width: 420, height: 420, top: '-10%', right: '5%', background: 'radial-gradient(circle, rgba(76,111,255,0.25), transparent 70%)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="dm-card-glass dm-animate-in"
        style={{ width: '100%', maxWidth: 380, padding: '2.5rem 2rem', position: 'relative' }}
      >
        <div className="flex items-center gap-2.5" style={{ marginBottom: 28 }}>
          <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
            <ShieldCheck style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h1 className="dm-h2">Device Leasing Console</h1>
            <p className="dm-label" style={{ marginTop: 2 }}>Staff sign-in</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="dm-label" style={{ padding: 0 }}>Email</label>
            <input
              type="email"
              required
              autoFocus
              className="dm-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="dm-label" style={{ padding: 0 }}>Password</label>
            <input
              type="password"
              required
              className="dm-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={submitting} className="dm-btn dm-btn-primary" style={{ width: '100%', marginTop: 4 }}>
            <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
            {!submitting && <ArrowRight style={{ width: 14, height: 14 }} />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
