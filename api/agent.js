/**
 * POST /api/agent
 * Body: { messages, profile, lang, portfolio? }
 * Proxy a Claude API con contexto de mercado argentino
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'JSON inválido' }); }

  const { messages = [], profile = 'moderado', lang = 'es', portfolio = null, context = {} } = body;
  const isEs = lang === 'es';
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // ── DEMO MODE: sin API key, respuestas pre-armadas ────────────────────
  if (!apiKey || apiKey === 'tu_key_aqui') {
    const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const demos = {
      es: {
        cartera: `**Cartera sugerida — Perfil ${profile.toUpperCase()}** (CCL ~$${context.ccl||1470})\n\n${profile==='conservador'?'• **40%** YCA6O — YPF ON 2026, TIR 8.2% hard USD\n• **30%** TGSUO — TGS ON 2031, TIR 8.5% hard USD\n• **20%** GD30 — Bono soberano 2030\n• **10%** GGAL — Acción local como cobertura':profile==='agresivo'?'• **35%** NVDA CEDEAR — semiconductor IA\n• **25%** CRWD CEDEAR — ciberseguridad 🚀\n• **20%** OKLO CEDEAR — nuclear next-gen 🚀\n• **20%** GGAL + VIST — locales energía/finanzas':'• **30%** AAPL + MSFT CEDEARs — blue chips tech\n• **25%** YCA6O + TGSUO — ONs hard USD\n• **25%** GGAL + YPF — acciones locales líderes\n• **20%** GD30 — bono soberano'}\n\n⚠ Para análisis personalizado en tiempo real, configurá la API key de Anthropic en Vercel.`,
        default: `**Pampa AI — Modo Demo**\n\nEstoy funcionando sin conexión a la IA. Para respuestas personalizadas configurá la ANTHROPIC_API_KEY en Vercel → Settings → Environment Variables.\n\nMientras tanto podés:\n• Ver el **Terminal** para análisis técnico en vivo\n• Revisar las **ONs** para renta fija\n• Armar tu **Portfolio** tracker\n\n⚠ No constituye asesoramiento financiero formal.`
      },
      en: {
        default: `**Pampa AI — Demo Mode**\n\nRunning without AI connection. To enable full AI responses, set ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.\n\n⚠ Not financial advice.`
      }
    };
    const reply = isEs
      ? (lastMsg.includes('cartera') || lastMsg.includes('portfolio') || lastMsg.includes('recomen') ? demos.es.cartera : demos.es.default)
      : demos.en.default;
    return res.status(200).json({ reply, demo: true });
  }

  const systemPrompt = isEs ? `Sos un asesor financiero especializado en el mercado de capitales argentino. Tu nombre es Pampa AI.

PERFIL DEL INVERSOR: ${profile.toUpperCase()}
${profile === 'conservador' ? '- Prioridad: preservar capital en USD\n- Instrumentos preferidos: ONs hard dollar, FCI money market, bonos soberanos cortos\n- Riesgo: bajo. Evitar acciones volátiles.' : ''}
${profile === 'moderado' ? '- Balance entre crecimiento y preservación\n- Instrumentos: mix CEDEARs blue chips + ONs + acciones locales líderes\n- Riesgo: moderado. Horizonte 1-3 años.' : ''}
${profile === 'agresivo' ? '- Prioridad: máximo crecimiento en USD\n- Instrumentos: acciones growth, galpones (OKLO, RKLB, CRWD), CEDEARs tech\n- Riesgo: alto. Horizonte 3-5 años. Tolera volatilidad.' : ''}

CONTEXTO DE MERCADO ACTUAL:
- CCL: ~$${context.ccl || 1470} ARS/USD
- Merval: ${context.merval || 'N/D'}
- Oro: $${context.gold || 3128}/oz

${portfolio ? `PORTFOLIO ACTUAL DEL USUARIO:
${JSON.stringify(portfolio, null, 2)}` : ''}

REGLAS:
- Respondé siempre en español argentino, de forma concreta y accionable
- Mencioná tickers específicos de BYMA cuando recomendés instrumentos
- Para ONs, mencioná TIR estimada y vencimiento
- Siempre incluí disclaimer al final: "⚠️ No constituye asesoramiento financiero formal"
- Máximo 400 palabras por respuesta
- Usá formato con bullets y secciones claras` : `You are a financial advisor specialized in Argentine capital markets. Your name is Pampa AI.

INVESTOR PROFILE: ${profile.toUpperCase()}
Respond in English. Be concrete and actionable. Always add disclaimer.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: messages.slice(-10), // últimos 10 mensajes para contexto
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ reply: text, usage: data.usage });
  } catch (error) {
    console.error('[/api/agent]', error.message);
    const fallback = isEs
      ? 'Lo siento, no puedo procesar tu consulta en este momento. Intentá de nuevo en unos segundos.'
      : 'Sorry, I cannot process your request right now. Please try again.';
    return res.status(200).json({ reply: fallback, error: error.message });
  }
}
