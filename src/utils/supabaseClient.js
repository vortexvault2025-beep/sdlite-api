import { createClient } from '@supabase/supabase-js';
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('Supabase env missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE');
  return createClient(url, key, { auth: { persistSession: false } });
}
