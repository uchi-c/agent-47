import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { isApiConfigured, getToken, clearToken } from './apiClient';
import { fetchMe, Profile } from './services/auth';
import { Organization, hasAccess } from './types';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Console from './pages/Console';
import UpgradeScreen from './pages/UpgradeScreen';

type AuthPage = 'login' | 'signup';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [authPage, setAuthPage] = useState<AuthPage>('login');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);

  // Re-runs on demand (after sign-in/sign-up, or on first mount if a token
  // is already saved from a previous visit) rather than living behind a
  // persistent auth-state listener -- there's no Supabase client keeping a
  // session alive in the background here, just a JWT in localStorage that
  // either GET /auth/me accepts or it doesn't.
  const loadSession = async () => {
    const token = getToken();
    if (!token) {
      setProfile(null);
      setOrganization(null);
      setLoading(false);
      return;
    }
    try {
      const { user, organization: org } = await fetchMe();
      setProfile(user);
      setOrganization(org);
    } catch {
      // Expired/invalid token -- clear it so the next load doesn't repeat this.
      clearToken();
      setProfile(null);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isApiConfigured) loadSession();
    else setLoading(false);
  }, []);

  const handleSignedOut = () => {
    setProfile(null);
    setOrganization(null);
    setAuthPage('login');
  };

  if (!isApiConfigured) {
    return (
      <div className="dm-app-bg dm-glow flex items-center justify-center" style={{ minHeight: '100vh', padding: '2rem' }}>
        <div className="dm-card-glass dm-animate-in flex flex-col items-center text-center" style={{ padding: '3rem 2rem', maxWidth: 440 }}>
          <ShieldAlert style={{ width: 32, height: 32, color: 'var(--warning)', marginBottom: 16 }} />
          <h1 className="dm-h2" style={{ marginBottom: 8 }}>Console not configured</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-mid)' }}>
            Set <code style={{ color: 'var(--text-hi)' }}>VITE_API_URL</code> in <code>console/.env</code>{' '}
            (see <code>.env.example</code>) to where <code>api/</code> is running, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dm-app-bg flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="dm-spin" style={{ width: 28, height: 28, border: '3px solid var(--panel-line)', borderTopColor: 'var(--blue-400)', borderRadius: '50%' }} />
      </div>
    );
  }

  if (!profile || !organization) {
    return authPage === 'signup' ? (
      <Signup onSwitchToLogin={() => setAuthPage('login')} onSignedUp={loadSession} />
    ) : (
      <Login onSwitchToSignup={() => setAuthPage('signup')} onSignedIn={loadSession} />
    );
  }

  if (!hasAccess(organization)) {
    return <UpgradeScreen organization={organization} onSignOut={handleSignedOut} />;
  }

  return <Console profile={profile} organization={organization} onSignOut={handleSignedOut} />;
}
