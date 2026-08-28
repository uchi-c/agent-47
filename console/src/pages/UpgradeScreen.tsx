import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, LogOut, ArrowRight, Check } from 'lucide-react';
import { Organization, PERSONAL_PLAN_DEVICE_LIMIT } from '../types';
import { startCheckout, fetchPlans, Plans, PlanPrice } from '../services/organizations';
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

function formatPrice(price: PlanPrice): string {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency.toUpperCase() }).format(price.amount / 100);
  return `${amount}/${price.interval}`;
}

interface PlanOption {
  id: 'personal' | 'business';
  name: string;
  blurb: string;
  features: string[];
}

const PLAN_OPTIONS: PlanOption[] = [
  {
    id: 'personal',
    name: 'Personal',
    blurb: 'For your own devices.',
    features: [`Up to ${PERSONAL_PLAN_DEVICE_LIMIT} devices`, 'Flag, lock, and recover', 'Location history'],
  },
  {
    id: 'business',
    name: 'Business',
    blurb: 'For devices issued to customers or staff.',
    features: ['Unlimited devices', 'Customer/lease tracking', 'Staff seats'],
  },
];

export default function UpgradeScreen({ organization, onSignOut }: UpgradeScreenProps) {
  const [submittingPlan, setSubmittingPlan] = useState<'personal' | 'business' | null>(null);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<Plans | null>(null);

  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .catch(() => {
        // Prices just don't show under each plan's name -- subscribing
        // still works, Stripe Checkout is the source of truth on amount.
      });
  }, []);

  const copy = COPY[organization.subscription_status];

  const handleSubscribe = async (plan: 'personal' | 'business') => {
    setError('');
    setSubmittingPlan(plan);
    try {
      const url = await startCheckout(plan);
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message || 'Could not start checkout. Try again in a moment.');
      setSubmittingPlan(null);
    }
  };

  return (
    <div className="dm-app-bg dm-glow flex items-center justify-center" style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="dm-card-glass dm-animate-in flex flex-col items-center text-center"
        style={{ width: '100%', maxWidth: 560, padding: '3rem 2.25rem' }}
      >
        <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--warning-bg)', color: 'var(--warning)', marginBottom: 20 }}>
          <ShieldAlert style={{ width: 24, height: 24 }} />
        </div>
        <h1 className="dm-h1" style={{ marginBottom: 10 }}>{copy.title}</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-mid)', marginBottom: 28 }}>
          {copy.body.replace('{org}', organization.name)}
        </p>

        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)', marginBottom: 16, width: '100%' }} role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ width: '100%' }}>
          {PLAN_OPTIONS.map((option) => {
            const price = plans?.[option.id] ?? null;
            const submitting = submittingPlan === option.id;
            return (
              <div key={option.id} className="dm-card" style={{ padding: '1.25rem', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-hi)' }}>{option.name}</span>
                <span className="dm-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-hi)', marginTop: 6 }}>
                  {price ? formatPrice(price) : '—'}
                </span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginTop: 4, marginBottom: 12 }}>{option.blurb}</p>
                <ul style={{ marginBottom: 16, flex: 1 }}>
                  {option.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginTop: 6 }}>
                      <Check style={{ width: 12, height: 12, color: 'var(--success)', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSubscribe(option.id)}
                  disabled={submittingPlan !== null}
                  className={`dm-btn ${option.id === 'business' ? 'dm-btn-primary' : 'dm-btn-ghost'}`}
                  style={{ width: '100%' }}
                >
                  <span>{submitting ? 'Opening checkout…' : `Choose ${option.name}`}</span>
                  {!submitting && <ArrowRight style={{ width: 14, height: 14 }} />}
                </button>
              </div>
            );
          })}
        </div>

        <button onClick={() => { signOut(); onSignOut(); }} className="dm-btn dm-btn-ghost" style={{ width: '100%', marginTop: 20 }}>
          <LogOut style={{ width: 14, height: 14 }} />
          <span>Sign out</span>
        </button>
      </motion.div>
    </div>
  );
}
