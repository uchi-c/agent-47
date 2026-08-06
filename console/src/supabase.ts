import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// A dummy fallback URL/key when unconfigured lets the module import (and the
// app render its "not configured" screen) instead of throwing during the
// client's own URL validation before App.tsx ever gets a chance to check
// isSupabaseConfigured and show a helpful message.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
);
