import { AgentStatus, LeaseStatus, SecurityStatus } from '../types';

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const cls = status === 'ONLINE' ? 'dm-badge-success' : status === 'STANDBY' ? 'dm-badge-warning' : 'dm-badge-danger';
  const dot = status === 'ONLINE' ? 'dm-dot-success' : status === 'STANDBY' ? 'dm-dot-warning' : 'dm-dot-danger';
  return (
    <span className={`dm-badge ${cls}`} style={{ fontFamily: 'monospace', fontWeight: 800 }}>
      <span className={`dm-dot ${dot} dm-dot-pulse`} />
      <span>{status}</span>
    </span>
  );
}

export function SecurityStatusBadge({ status }: { status: SecurityStatus }) {
  const map: Record<SecurityStatus, { cls: string; label: string }> = {
    NORMAL: { cls: 'dm-badge-neutral', label: 'Normal' },
    FLAGGED_LOST: { cls: 'dm-badge-warning', label: 'Flagged Lost' },
    FLAGGED_STOLEN: { cls: 'dm-badge-danger', label: 'Flagged Stolen' },
    RECOVERED: { cls: 'dm-badge-info', label: 'Recovered' },
  };
  const { cls, label } = map[status];
  return <span className={`dm-badge ${cls}`}>{label}</span>;
}

export function LeaseStatusBadge({ status }: { status: LeaseStatus }) {
  const map: Record<LeaseStatus, { cls: string; label: string }> = {
    ACTIVE: { cls: 'dm-badge-success', label: 'Active' },
    RETURNED: { cls: 'dm-badge-neutral', label: 'Returned' },
    DEFAULTED: { cls: 'dm-badge-danger', label: 'Defaulted' },
  };
  const { cls, label } = map[status];
  return <span className={`dm-badge ${cls}`}>{label}</span>;
}
