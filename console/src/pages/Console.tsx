import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { LogOut, RefreshCw, Search, ShieldAlert, Monitor, ShieldCheck } from 'lucide-react';
import { Profile, signOut } from '../services/auth';
import { fetchCustomers, fetchDevices } from '../services/devices';
import { Customer, Device, getAgentStatus } from '../types';
import DeviceTable from '../components/DeviceTable';
import DeviceDrawer from '../components/DeviceDrawer';

interface ConsoleProps {
  profile: Profile;
}

type FilterTab = 'ALL' | 'FLAGGED' | 'ONLINE';

export default function Console({ profile }: ConsoleProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canManage = profile.role === 'ADMIN' || profile.role === 'STAFF';
  const isAdmin = profile.role === 'ADMIN';

  const load = async () => {
    setLoading(true);
    const [d, c] = await Promise.all([fetchDevices(), fetchCustomers()]);
    setDevices(d);
    setCustomers(c);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Devices/statuses can change from outside this tab (the agent itself,
    // or another staff member) -- a light poll keeps the list honest
    // without needing a realtime subscription for a "lightweight" console.
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    let list = devices;
    if (filter === 'FLAGGED') {
      list = list.filter((d) => d.security_status === 'FLAGGED_LOST' || d.security_status === 'FLAGGED_STOLEN');
    } else if (filter === 'ONLINE') {
      list = list.filter((d) => getAgentStatus(d.last_seen) === 'ONLINE');
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.computer_name.toLowerCase().includes(q) ||
          d.computer_code.toLowerCase().includes(q) ||
          d.customers?.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [devices, filter, query]);

  const flaggedCount = devices.filter((d) => d.security_status === 'FLAGGED_LOST' || d.security_status === 'FLAGGED_STOLEN').length;
  const onlineCount = devices.filter((d) => getAgentStatus(d.last_seen) === 'ONLINE').length;

  const selectedDevice = devices.find((d) => d.id === selectedId) || null;

  return (
    <div className="dm-app-bg" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        {/* ---- Top bar ---- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4" style={{ marginBottom: 24 }}>
          <div>
            <h1 className="dm-h1">Device Leasing Console</h1>
            <p style={{ color: 'var(--text-mid)', fontSize: '0.8125rem', marginTop: 4 }}>
              Signed in as {profile.name} · {profile.role === 'ADMIN' ? 'Admin' : 'Staff'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="dm-btn dm-btn-ghost">
              <RefreshCw className={loading ? 'dm-spin' : ''} style={{ width: 14, height: 14 }} />
              <span>Refresh</span>
            </button>
            <button onClick={() => signOut()} className="dm-icon-btn" aria-label="Sign out" title="Sign out">
              <LogOut style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* ---- KPI row ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ marginBottom: 24 }}>
          {[
            { label: 'Total devices', value: devices.length, icon: Monitor, color: 'var(--text-hi)' },
            { label: 'Flagged lost/stolen', value: flaggedCount, icon: ShieldAlert, color: flaggedCount > 0 ? 'var(--danger)' : 'var(--text-hi)' },
            { label: 'Online now', value: onlineCount, icon: ShieldCheck, color: 'var(--success)' },
          ].map((kpi, i) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="dm-card" style={{ padding: '1.1rem 1.25rem' }}>
              <div className="flex items-center justify-between">
                <span className="dm-label">{kpi.label}</span>
                <kpi.icon style={{ width: 14, height: 14, color: 'var(--text-low)' }} />
              </div>
              <div className="dm-kpi" style={{ marginTop: 6, color: kpi.color }}>{kpi.value}</div>
            </motion.div>
          ))}
        </div>

        {!canManage && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(255,176,32,0.3)', marginBottom: 20 }}>
            <ShieldAlert style={{ width: 16, height: 16, color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-hi)' }}>Your role can view devices but can't flag them or send commands.</p>
          </div>
        )}

        {/* ---- Search + filter ---- */}
        <div className="flex flex-col sm:flex-row gap-3" style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-low)' }} />
            <input
              className="dm-input"
              style={{ paddingLeft: 38 }}
              placeholder="Search device, code, or customer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="dm-seg">
            {(['ALL', 'FLAGGED', 'ONLINE'] as FilterTab[]).map((tab) => (
              <button key={tab} className={`dm-seg-item ${filter === tab ? 'active' : ''}`} onClick={() => setFilter(tab)}>
                {tab === 'ALL' ? 'All' : tab === 'FLAGGED' ? 'Flagged' : 'Online'}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Device list ---- */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="dm-skeleton" style={{ height: 56 }} />)}
          </div>
        ) : (
          <DeviceTable devices={filtered} onSelect={(d) => setSelectedId(d.id)} />
        )}
      </div>

      {selectedDevice && (
        <DeviceDrawer
          device={selectedDevice}
          currentUserId={profile.id}
          canManage={canManage}
          isAdmin={isAdmin}
          customers={customers}
          onClose={() => setSelectedId(null)}
          onChanged={load}
          onCustomerCreated={(c) => setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}
    </div>
  );
}
