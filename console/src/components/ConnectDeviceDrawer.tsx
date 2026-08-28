import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, Eye, EyeOff, RefreshCw, ShieldAlert } from 'lucide-react';
import { API_URL } from '../apiClient';
import { fetchAgentKey, rotateAgentKey } from '../services/organizations';
import { Plan, PERSONAL_PLAN_DEVICE_LIMIT } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface ConnectDeviceDrawerProps {
  plan: Plan;
  deviceCount: number;
  onClose: () => void;
}

const REMOTE_INSTALL_URL = 'https://raw.githubusercontent.com/uchi-c/agent-47/main/pc-agent/remote-install.ps1';

function installCommand(apiUrl: string, key: string): string {
  // Values travel as env vars, not script args -- remote-install.ps1 reads
  // them before it even downloads anything, so there's nothing to pass on
  // a command line that Windows would otherwise echo into shell history.
  return `$env:DEVICEGUARD_API = "${apiUrl}"; $env:DEVICEGUARD_KEY = "${key}"; irm ${REMOTE_INSTALL_URL} | iex`;
}

export default function ConnectDeviceDrawer({ plan, deviceCount, onClose }: ConnectDeviceDrawerProps) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<'command' | 'key' | null>(null);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    fetchAgentKey()
      .then(setKey)
      .catch((err) => setError(err?.message || "Couldn't load the device key."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCopy = async (text: string, which: 'command' | 'key') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard API unavailable -- the text is still on-screen to copy manually.
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const newKey = await rotateAgentKey();
      setKey(newKey);
      setRevealed(true);
      setRotateDialogOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Could not regenerate the key.');
    } finally {
      setRotating(false);
    }
  };

  const apiUrl = API_URL || '';
  const command = key ? installCommand(apiUrl, key) : '';
  const maskedKey = key ? `${key.slice(0, 4)}${'•'.repeat(Math.max(0, key.length - 8))}${key.slice(-4)}` : '';

  return (
    <>
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="dm-scrim" style={{ zIndex: 40 }} onClick={onClose} />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          className="dm-drawer"
          style={{ zIndex: 50 }}
          role="dialog"
          aria-label="Connect a device"
        >
          <div style={{ padding: '1.5rem' }}>
            <div className="flex items-start justify-between" style={{ marginBottom: 8 }}>
              <div>
                <h2 className="dm-h1">Connect a device</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-mid)', marginTop: 4 }}>
                  Run this on the device you want to protect — you don't need to be there yourself, whoever's at
                  that machine can paste it themselves.
                </p>
              </div>
              <button onClick={onClose} className="dm-icon-btn" aria-label="Close">
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {plan === 'personal' && (
              <div
                className="flex items-center gap-2 p-2.5 rounded-xl"
                style={{
                  marginTop: 16,
                  fontSize: '0.78rem',
                  background: deviceCount >= PERSONAL_PLAN_DEVICE_LIMIT ? 'var(--danger-bg)' : 'var(--blue-bg)',
                  border: `1px solid ${deviceCount >= PERSONAL_PLAN_DEVICE_LIMIT ? 'rgba(255,107,107,0.3)' : 'rgba(76,111,255,0.3)'}`,
                  color: deviceCount >= PERSONAL_PLAN_DEVICE_LIMIT ? 'var(--danger)' : 'var(--text-hi)',
                }}
              >
                {deviceCount >= PERSONAL_PLAN_DEVICE_LIMIT
                  ? `You've used all ${PERSONAL_PLAN_DEVICE_LIMIT} devices on the personal plan — this device won't be able to register until you upgrade to Business (Billing) or remove another one.`
                  : `Personal plan: ${deviceCount} of ${PERSONAL_PLAN_DEVICE_LIMIT} devices used.`}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,107,107,0.3)', fontSize: '0.78rem', color: 'var(--danger)', marginTop: 16 }} role="alert">
                {error}
              </div>
            )}

            {loading ? (
              <div className="dm-skeleton" style={{ height: 100, marginTop: 20 }} />
            ) : key ? (
              <>
                <section style={{ marginTop: 20 }}>
                  <label className="dm-label" style={{ padding: 0 }}>Install command (elevated PowerShell)</label>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-low)', marginTop: 4, marginBottom: 8 }}>
                    They open PowerShell as Administrator (right-click Start → Terminal (Admin)), paste this, press Enter.
                  </p>
                  <div className="flex items-start gap-2">
                    <textarea
                      readOnly
                      className="dm-input dm-nums"
                      style={{ fontSize: '0.68rem', minHeight: 72, resize: 'none' }}
                      value={command}
                      onFocus={(e) => e.target.select()}
                    />
                    <button onClick={() => handleCopy(command, 'command')} className="dm-icon-btn" aria-label="Copy command" title="Copy command">
                      {copied === 'command' ? <Check style={{ width: 15, height: 15, color: 'var(--success)' }} /> : <Copy style={{ width: 15, height: 15 }} />}
                    </button>
                  </div>
                </section>

                <section style={{ marginTop: 20 }}>
                  <label className="dm-label" style={{ padding: 0 }}>This organization's device key</label>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-low)', marginTop: 4, marginBottom: 8 }}>
                    One shared key for every device in this organization — anyone holding it can register or
                    command any of your devices, not just the one they're installing. Treat it like a password.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      type={revealed ? 'text' : 'password'}
                      className="dm-input dm-nums"
                      style={{ fontSize: '0.8rem' }}
                      value={revealed ? key : maskedKey}
                      onFocus={(e) => e.target.select()}
                    />
                    <button onClick={() => setRevealed((r) => !r)} className="dm-icon-btn" aria-label={revealed ? 'Hide key' : 'Show key'} title={revealed ? 'Hide' : 'Show'}>
                      {revealed ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                    </button>
                    <button onClick={() => handleCopy(key, 'key')} className="dm-icon-btn" aria-label="Copy key" title="Copy key">
                      {copied === 'key' ? <Check style={{ width: 15, height: 15, color: 'var(--success)' }} /> : <Copy style={{ width: 15, height: 15 }} />}
                    </button>
                  </div>
                </section>

                <section style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--panel-line)' }}>
                  <span className="dm-label flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                    <ShieldAlert style={{ width: 11, height: 11 }} /> Danger zone
                  </span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-mid)', marginTop: 8, marginBottom: 10 }}>
                    If this key leaked, regenerate it. Every already-installed device stops working immediately —
                    each one needs its <code>AGENT_SECRET</code> updated and the agent restarted before it can
                    reach the server again.
                  </p>
                  <button className="dm-btn dm-btn-danger" onClick={() => setRotateDialogOpen(true)}>
                    <RefreshCw style={{ width: 14, height: 14 }} />
                    <span>Regenerate key</span>
                  </button>
                </section>
              </>
            ) : null}
          </div>
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog
        open={rotateDialogOpen}
        title="Regenerate the device key?"
        description="Every currently-installed device will lose the ability to reach the server until it's reconfigured with the new key. Devices already flagged lost/stolen will stop re-locking too."
        confirmLabel="Regenerate key"
        danger
        requireTypedConfirmation="ROTATE"
        submitting={rotating}
        onConfirm={handleRotate}
        onCancel={() => setRotateDialogOpen(false)}
      />
    </>
  );
}
