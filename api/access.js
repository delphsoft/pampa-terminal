/**
 * GET  /api/access?email=x@y.com  → verifica estado del usuario
 * POST /api/access                 → registra nuevo usuario con timestamp
 *
 * Estados posibles:
 *   active   → dentro de los 45 días
 *   expiring → quedan 15 días o menos
 *   urgent   → quedan 5 días o menos
 *   expired  → venció el trial
 *   premium  → usuario pago (se activará con Stripe más adelante)
 *   new      → email no encontrado
 */

const TRIAL_DAYS = 45;
const MS_PER_DAY = 86400000;

function calcStatus(registeredAt) {
  const elapsed = Date.now() - new Date(registeredAt).getTime();
  const daysUsed = Math.floor(elapsed / MS_PER_DAY);
  const daysLeft = TRIAL_DAYS - daysUsed;

  if (daysLeft <= 0)  return { status: 'expired',  daysLeft: 0,        daysUsed };
  if (daysLeft <= 5)  return { status: 'urgent',   daysLeft,           daysUsed };
  if (daysLeft <= 15) return { status: 'expiring', daysLeft,           daysUsed };
  return               { status: 'active',   daysLeft,           daysUsed };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const hasKV   = kvUrl && kvToken && kvUrl !== 'tu_url_aqui';

  // ── KV helper ─────────────────────────────────────────────────────────────
  async function kvGet(key) {
    if (!hasKV) return null;
    try {
      const r = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${kvToken}` },
        signal: AbortSignal.timeout(4000),
      });
      const d = await r.json();
      return d?.result ? JSON.parse(d.result) : null;
    } catch { return null; }
  }

  async function kvSet(key, value) {
    if (!hasKV) return false;
    try {
      await fetch(`${kvUrl}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(value) }),
        signal: AbortSignal.timeout(4000),
      });
      return true;
    } catch { return false; }
  }

  // ── GET /api/access?email=x ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email requerido' });

    // Buscar en KV
    const record = await kvGet(`user:${email}`);

    if (!record) {
      return res.status(200).json({ status: 'new', email });
    }

    // Usuario premium (se usará cuando integres Stripe)
    if (record.premium) {
      return res.status(200).json({ status: 'premium', email, since: record.registeredAt });
    }

    const info = calcStatus(record.registeredAt);
    return res.status(200).json({ ...info, email, registeredAt: record.registeredAt });
  }

  // ── POST /api/access ──────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }

    const email = (body?.email || '').toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const key = `user:${email}`;

    // Si ya existe, devolver su estado actual (no resetear el timer)
    const existing = await kvGet(key);
    if (existing) {
      if (existing.premium) return res.status(200).json({ status: 'premium', email });
      const info = calcStatus(existing.registeredAt);
      // Si expiró pero vuelve, le damos acceso pero con estado expired
      return res.status(200).json({ ...info, email, registeredAt: existing.registeredAt });
    }

    // Nuevo usuario → registrar con timestamp actual
    const record = {
      email,
      registeredAt: new Date().toISOString(),
      premium: false,
      src: body?.src || 'landing',
      ua: req.headers['user-agent']?.slice(0, 100) || '',
    };

    await kvSet(key, record);
    // También guardar en lista general
    if (hasKV) {
      try {
        await fetch(`${kvUrl}/lpush/users:list`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: email }),
          signal: AbortSignal.timeout(3000),
        });
      } catch {}
    }

    const info = calcStatus(record.registeredAt);
    return res.status(200).json({ ...info, email, registeredAt: record.registeredAt, isNew: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
