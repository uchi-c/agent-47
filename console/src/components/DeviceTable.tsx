import { Monitor, User, ChevronRight, Plus } from 'lucide-react';
import { Device, getAgentStatus } from '../types';
import { AgentStatusBadge, LeaseStatusBadge, SecurityStatusBadge } from './StatusBadge';
import { relativeTime } from '../format';

interface DeviceTableProps {
  devices: Device[];
  totalCount: number;
  onSelect: (device: Device) => void;
  onConnectDevice?: () => void;
}

export default function DeviceTable({ devices, totalCount, onSelect, onConnectDevice }: DeviceTableProps) {
  if (devices.length === 0) {
    const noneAtAll = totalCount === 0;
    return (
      <div className="dm-card-inset flex flex-col items-center text-center" style={{ padding: '4rem 1.5rem', borderStyle: 'dashed' }}>
        <Monitor style={{ width: 40, height: 40, marginBottom: 12, color: 'var(--text-low)' }} />
        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-mid)' }}>
          {noneAtAll ? 'No devices connected yet' : 'No devices match'}
        </p>
        <p style={{ fontSize: '0.75rem', marginTop: 4, color: 'var(--text-low)', maxWidth: 320 }}>
          {noneAtAll
            ? "Connect the first one to start protecting it — you don't need to be at the device yourself."
            : 'Try a different search or filter.'}
        </p>
        {noneAtAll && onConnectDevice && (
          <button onClick={onConnectDevice} className="dm-btn dm-btn-primary" style={{ marginTop: 16 }}>
            <Plus style={{ width: 14, height: 14 }} />
            <span>Connect a device</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="dm-card dm-scroll-x">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--panel-line)' }}>
            {['Device', 'Customer', 'Lease', 'Security', 'Agent', 'Last IP', 'Last seen', ''].map((h) => (
              <th key={h} className="dm-label" style={{ textAlign: 'left', padding: '0.85rem 1rem' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => {
            const agentStatus = getAgentStatus(d.last_seen);
            const flagged = d.security_status === 'FLAGGED_LOST' || d.security_status === 'FLAGGED_STOLEN';
            return (
              <tr
                key={d.id}
                className="dm-row dm-animate-in"
                onClick={() => onSelect(d)}
                style={{ borderBottom: '1px solid var(--panel-line)', boxShadow: flagged ? 'inset 2px 0 0 var(--danger)' : undefined }}
              >
                <td style={{ padding: '0.85rem 1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-hi)' }}>{d.computer_name}</div>
                  <code style={{ fontSize: '0.625rem', color: 'var(--text-low)', letterSpacing: '0.04em' }}>{d.computer_code}</code>
                </td>
                <td style={{ padding: '0.85rem 1rem' }}>
                  {d.customers ? (
                    <span className="flex items-center gap-1.5" style={{ fontSize: '0.8125rem', color: 'var(--text-hi)' }}>
                      <User style={{ width: 12, height: 12, color: 'var(--text-low)' }} />
                      {d.customers.name}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-low)' }}>Unassigned</span>
                  )}
                </td>
                <td style={{ padding: '0.85rem 1rem' }}><LeaseStatusBadge status={d.lease_status} /></td>
                <td style={{ padding: '0.85rem 1rem' }}><SecurityStatusBadge status={d.security_status} /></td>
                <td style={{ padding: '0.85rem 1rem' }}><AgentStatusBadge status={agentStatus} /></td>
                <td className="dm-nums" style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', color: 'var(--text-mid)' }}>{d.ip_address || '—'}</td>
                <td style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', color: 'var(--text-mid)' }}>{relativeTime(d.last_seen)}</td>
                <td style={{ padding: '0.85rem 1rem' }}>
                  <ChevronRight style={{ width: 15, height: 15, color: 'var(--text-low)' }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
