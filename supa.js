// Supabase 연결 (긴급 제보·공지). 공개(publishable) 키라 앱에 들어 있어도 괜찮아요 — 권한은 DB 보안 규칙이 막아요.
export const SUPABASE_URL = 'https://sceauguxskzpczsesxzv.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_NXW_UvaYa90zjznusdWiQw_7rb0X-8Q';

let client = null;
export async function getClient() {
  if (client) return client;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm');
  client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export const KINDS = {
  fire: { label: '화재', emoji: '🔥', color: '#D93A3A' },
  blocked: { label: '통행 막힘', emoji: '🚧', color: '#E08A1E' },
  other: { label: '기타 위험', emoji: '⚠️', color: '#7A56C9' },
};

// 어떤 메일이든 인증만 하면 됨 (학교에 학생 메일이 없어서) → 대신 학과·학번을 등록
export const isEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

// Supabase 오류를 사람이 읽을 수 있는 말로
export function niceError(err) {
  const m = (err && (err.message || err.error_description || String(err))) || '알 수 없는 오류';
  if (/rate limit|too many|security purposes/i.test(m)) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(m)) return '인증 코드가 틀렸거나 만료됐어요. 다시 받아 주세요.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '인터넷 연결을 확인해 주세요.';
  return m.replace(/^.*?ERROR:\s*/, '');
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  return Math.floor(s / 86400) + '일 전';
}

export const escapeHTML = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
