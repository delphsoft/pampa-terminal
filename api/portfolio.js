/**
 * GET  /api/portfolio?email=x     → obtiene portfolio del usuario
 * POST /api/portfolio              → guarda/actualiza portfolio
 * DELETE /api/portfolio?email=x&id=y → elimina una posición
 */
const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const hasKV    = KV_URL && KV_TOKEN && KV_URL !== 'tu_url_aqui';

async function kvGet(key) {
  if (!hasKV) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      signal: AbortSignal.timeout(4000),
    });
    const d = await r.json();
    return d?.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}

async function kvSet(key, value) {
  if (!hasKV) return false;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value) }),
      signal: AbortSignal.timeout(4000),
    });
    return true;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'email requerido' });
  const key = `portfolio:${email}`;

  if (req.method === 'GET') {
    const data = await kvGet(key);
    return res.status(200).json({ portfolio: data || { positions: [], profile: null, updatedAt: null } });
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'JSON inválido' }); }
    const existing = await kvGet(key) || { positions: [], profile: null };
    const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
    await kvSet(key, updated);
    return res.status(200).json({ ok: true, portfolio: updated });
  }

  if (req.method === 'DELETE') {
    const posId = req.query.id;
    if (!posId) return res.status(400).json({ error: 'id requerido' });
    const existing = await kvGet(key);
    if (!existing) return res.status(404).json({ error: 'Portfolio no encontrado' });
    existing.positions = (existing.positions || []).filter(p => p.id !== posId);
    existing.updatedAt = new Date().toISOString();
    await kvSet(key, existing);
    return res.status(200).json({ ok: true, portfolio: existing });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
