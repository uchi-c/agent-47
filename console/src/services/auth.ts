import { supabase } from '../supabase';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('users').select('id, name, email, role').eq('id', userId).single();
  if (error) return null;
  return data as Profile;
}
