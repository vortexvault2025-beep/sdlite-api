import crypto from 'crypto';
import { getSupabase } from './supabaseClient.js';

// DB-first tile codes, hash fallback so renders never block
export async function getTileCodes(postcodeRaw) {
  const pc = String(postcodeRaw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  if (!pc) return { left: 0, right: 0, source: 'fallback-empty' };

  // Primary: DB lookup
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('postcode_routing_codes')
      .select('tile_left,tile_right')
      .eq('postcode_key', pc)
      .limit(1)
      .maybeSingle();

    if (!error && data && data.tile_left != null && data.tile_right != null) {
      return { left: Number(data.tile_left), right: Number(data.tile_right), source: 'db' };
    }
  } catch {
    // ignore; use fallback
  }

  // Fallback: deterministic hash (sha256)
  const h = crypto.createHash('sha256').update(pc).digest();
  return { left: h[0] % 10, right: h[1] % 10, source: 'hash' };
}
