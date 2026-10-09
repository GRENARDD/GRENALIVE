// Evita saltos artificiales entre la API oficial y el lector de Kick.
// No bloquea bajadas reales: las confirma con ambas fuentes o con tres lecturas consecutivas.
export function createKickViewerStabilizer() {
  const sources = { official: { value: null, at: 0 }, browser: { value: null, at: 0 } };
  let pending = null;
  return {
    reset() {
      sources.official = { value: null, at: 0 };
      sources.browser = { value: null, at: 0 };
      pending = null;
    },
    shouldAccept({ count, source, current, now = Date.now() }) {
      const n = Number(count);
      const prev = Math.max(0, Number(current) || 0);
      if (!Number.isFinite(n) || n < 0) return false;
      const label = String(source || '').toLowerCase();
      const family = label.includes('kick public api') ? 'official'
        : /kick browser|kick bridge|kick page/.test(label) ? 'browser' : '';
      if (!family || n === 0) {
        pending = null;
        return true;
      }
      sources[family] = { value: n, at: now };
      const suspicious = prev >= 3 && ((n === 1) || (prev >= 10 && n <= Math.floor(prev * 0.25)));
      if (!suspicious) {
        pending = null;
        return true;
      }
      const other = sources[family === 'official' ? 'browser' : 'official'];
      const otherFresh = other.value !== null && now - other.at <= 25000;
      if (otherFresh && Math.abs(other.value - n) <= 1) {
        pending = null;
        return true;
      }
      if (otherFresh && other.value >= Math.max(n + 2, prev * 0.75)) {
        return false;
      }
      if (!pending || pending.family !== family || pending.value !== n || now - pending.firstAt > 60000) {
        pending = { family, value: n, hits: 1, firstAt: now, lastAt: now };
        return false;
      }
      if (now - pending.lastAt >= 2500) {
        pending.hits++;
        pending.lastAt = now;
      }
      if (pending.hits >= 3 && now - pending.firstAt >= 8000) {
        pending = null;
        return true;
      }
      return false;
    }
  };
}
