import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { fetchProfile, Profile } from './services/auth';
import Login from './pages/Login';
import Console from './pages/Console';
import { ShieldAlert } from 'lucide-react';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      if (!session) {
        setProfile(null);
        setProfileMissing(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    setProfileLoading(true);
    fetchProfile(userId).then((p) => {
      setProfile(p);
      setProfileMissing(!p);
      setProfileLoading(false);
    });
  }, [userId]);

  if (!isSupabaseConfigured) {
    return (
      <div className="dm-app-bg dm-glow flex items-center justify-center" style={{ minHeight: '100vh', padding: '2rem' }}>
        <div className="dm-card-glass dm-animate-in flex flex-col items-center text-center" style={{ padding: '3rem 2rem', maxWidth: 440 }}>
          <ShieldAlert style={{ width: 32, height: 32, color: 'var(--warning)', marginBottom: 16 }} />
          <h1 className="dm-h2" style={{ marginBottom: 8 }}>Console not configured</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-mid)' }}>
            Set <code style={{ color: 'var(--text-hi)' }}>VITE_SUPABASE_URL</code> and{' '}
            <code style={{ color: 'var(--text-hi)' }}>VITE_SUPABASE_ANON_KEY</code> in <code>console/.env</code>{' '}
            (see <code>.env.example</code>), then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (loading || (userId && profileLoading)) {
    return (
      <div className="dm-app-bg flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="dm-spin" style={{ width: 28, height: 28, border: '3px solid var(--panel-line)', borderTopColor: 'var(--blue-400)', borderRadius: '50%' }} />
      </div>
    );
  }

  if (!userId) {
    return <Login />;
  }

  if (profileMissing) {
    return (
      <div className="dm-app-bg dm-glow flex items-center justify-center" style={{ minHeight: '100vh', padding: '2rem' }}>
        <div className="dm-card-glass dm-animate-in flex flex-col items-center text-center" style={{ padding: '3rem 2rem', maxWidth: 440 }}>
          <ShieldAlert style={{ width: 32, height: 32, color: 'var(--warning)', marginBottom: 16 }} />
          <h1 className="dm-h2" style={{ marginBottom: 8 }}>No console profile for this account</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-mid)', marginBottom: 20 }}>
            You're signed in, but there's no matching row in <code style={{ color: 'var(--text-hi)' }}>public.users</code>{' '}
            with an ADMIN or STAFF role for this account. Ask an admin to add one.
          </p>
          <button className="dm-btn dm-btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return <Console profile={profile!} />;
}
