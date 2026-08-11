import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  // When set, the confirm button stays disabled until the user types this
  // exact string -- reserved for actions where a misclick is expensive
  // (WIPE), so confirming takes deliberate effort, not just a second click.
  requireTypedConfirmation?: string;
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  requireTypedConfirmation,
  submitting,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const locked = Boolean(requireTypedConfirmation) && typed !== requireTypedConfirmation;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="dm-scrim"
        style={{ zIndex: 60 }}
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16 }}
        role="alertdialog"
        aria-modal="true"
        className="dm-card-glass"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 61, width: '100%', maxWidth: 420, padding: '1.75rem',
        }}
      >
        <div className="flex items-start gap-3" style={{ marginBottom: 14 }}>
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 36, height: 36, borderRadius: 10, background: danger ? 'var(--danger-bg)' : 'var(--warning-bg)', color: danger ? 'var(--danger)' : 'var(--warning)' }}
          >
            <AlertTriangle style={{ width: 17, height: 17 }} />
          </div>
          <div>
            <h3 className="dm-h2">{title}</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-mid)', marginTop: 4 }}>{description}</p>
          </div>
        </div>

        {requireTypedConfirmation && (
          <div className="space-y-1.5" style={{ marginBottom: 16 }}>
            <label className="dm-label" style={{ padding: 0 }}>
              Type <span style={{ color: 'var(--text-hi)' }}>{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              autoFocus
              className="dm-input dm-nums"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTypedConfirmation}
            />
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="dm-btn dm-btn-ghost flex-1">Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={locked || submitting}
            className={`dm-btn flex-1 ${danger ? 'dm-btn-danger-solid' : 'dm-btn-primary'}`}
          >
            {submitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
