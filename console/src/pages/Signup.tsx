import { FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { signUp } from '../services/auth';

interface SignupProps {
  onSwitchToLogin: () => void;
  onSignedUp: () => void;
}

export default function Signup({ onSwitchToLogin, onSignedUp }: SignupProps) {
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // Single atomic call -- api/'s /auth/signup creates the org (30-day
      // trial), the ADMIN user, and the membership together and returns a
      // session token immediately. No email-confirmation step to wait on.
      await signUp(email.trim(), password, name.trim(), orgName.trim());
      onSignedUp();
    } catch (err: any) {
      setError(err?.message || 'Sign-up failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dm-app-bg dm-glow flex items-center justify-center" style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <div
        className="dm-glow-orb"
        style={{ width: 420, height: 420, top: '-10%', left: '5%', background: 'radial-gradient(circle, rgba(125,211,252,0.2), transparent 70%)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="dm-card-glass dm-animate-in"
        style={{ width: '100%', maxWidth: 400, padding: '2.5rem 2rem', position: 'relative' }}
      >
        <div className="flex items-center gap-2.5" style={{ marginBottom: 24 }}>
          <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-400)' }}>
            <ShieldCheck style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h1 className="dm-h2">Start protecting your devices</h1>
            <p className="dm-label" style={{ marginTop: 2 }}>30-day free trial · no card required</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="dm-label" style={{ padding: 0 }}>Your name</label>
            <input required autoFocus className="dm-input" placeholder="Amara Chikafu" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="dm-label" style={{ padding: 0 }}>
              Account name <span style={{ opacity: 0.6, textTransform: 'none' }}>(a business, or just your own name)</span>
            </label>
            <input required className="dm-input" placeholder="e.g. Acme Leasing, or Amara's Devices" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="dm-label" style={{ padding: 0 }}>Email</label>
            <input type="email" required className="dm-input" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="dm-label" style={{ padding: 0 }}>Password</label>
            <input type="password" required minLength={8} className="dm-input" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)' }} role="alert">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={submitting} className="dm-btn dm-btn-primary" style={{ width: '100%', marginTop: 4 }}>
            <span>{submitting ? 'Creating your account…' : 'Start free trial'}</span>
            {!submitting && <ArrowRight style={{ width: 14, height: 14 }} />}
          </button>
        </form>

        <p style={{ fontSize: '0.78rem', color: 'var(--text-mid)', textAlign: 'center', marginTop: 18 }}>
          Already have an account?{' '}
          <button onClick={onSwitchToLogin} className="dm-nums" style={{ background: 'none', border: 'none', color: 'var(--blue-400)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            Sign in
          </button>
        </p>
      </motion.div>
    </div>
  );
}
