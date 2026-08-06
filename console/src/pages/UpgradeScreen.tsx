import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, LogOut, ArrowRight } from 'lucide-react';
import { Organization } from '../types';
import { startCheckout } from '../services/organizations';
import { signOut } from '../services/auth';

interface UpgradeScreenProps {
  organization: Organization;
  onSignOut: () => void;
}

const COPY: Record<Organization['subscription_status'], { title: string; body: string }> = {
  TRIALING: {
    title: 'Your free trial has ended',
    body: "Your 30-day trial of {org} is over. Subscribe to keep flagging devices, sending commands, and viewing location history — nothing about your devices or their history is deleted.",
  },
  PAST_DUE: {
    title: 'Payment past due',
    body: 'The last payment for {org} didn\'t go through. Update your billing details to restore access.',
  },
  CANCELED: {
    title: 'Subscription canceled',
    body: 'The subscription for {org} has been canceled. Resubscribe to regain access — your devices and their history are still here.',
  },
  ACTIVE: { title: '', body: '' }, // unreachable: ACTIVE always has access, see hasAccess()
};

export default function UpgradeScreen({ organization, onSignOut }: UpgradeScreenProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const copy = COPY[organization.subscription_status];

  const handleSubscribe = async () => {
    setError('');
    setSubmitting(true);
    try {
      const url = await startCheckout();
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message || 'Could not start checkout. Try again in a moment.');
      setSubmitting(false);
    }
  };

  return (
    <div className="dm-app-bg dm-glow flex items-center justify-center" style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="dm-card-glass dm-animate-in flex flex-col items-center text-center"
        style={{ width: '100%', maxWidth: 440, padding: '3rem 2.25rem' }}
      >
        <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--warning-bg)', color: 'var(--warning)', marginBottom: 20 }}>
          <ShieldAlert style={{ width: 24, height: 24 }} />
        </div>
        <h1 className="dm-h1" style={{ marginBottom: 10 }}>{copy.title}</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-mid)', marginBottom: 24 }}>
          {copy.body.replace('{org}', organization.name)}
        </p>

        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)', marginBottom: 16, width: '100%' }} role="alert">
            <span>{error}</span>
          </div>
        )}

        <button onClick={handleSubscribe} disabled={submitting} className="dm-btn dm-btn-primary" style={{ width: '100%' }}>
          <span>{submitting ? 'Opening checkout…' : 'Subscribe'}</span>
          {!submitting && <ArrowRight style={{ width: 14, height: 14 }} />}
        </button>
        <button onClick={() => { signOut(); onSignOut(); }} className="dm-btn dm-btn-ghost" style={{ width: '100%', marginTop: 10 }}>
          <LogOut style={{ width: 14, height: 14 }} />
          <span>Sign out</span>
        </button>
      </motion.div>
    </div>
  );
}
