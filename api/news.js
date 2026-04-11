/**
 * GET /api/news?ticker=GGAL&sector=Financiero
 *
 * Noticias reales desde RSS públicos de medios argentinos — sin API key.
 * Fallback a noticias curadas si los RSS no responden.
 */

// RSS feeds públicos — sin key, sin registro
const RSS_FEEDS = [
  { name: 'Ámbito Financiero',  url: 'https://www.ambito.com/rss/economia.xml' },
  { name: 'El Cronista',        url: 'https://www.cronista.com/rss/finanzas-mercados/' },
  { name: 'Infobae Economía',   url: 'https://www.infobae.com/economia/rss/' },
  { name: 'La Nación Economía', url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/economia/' },
];

// Palabras clave por ticker para filtrar noticias relevantes
const TICKER_KEYWORDS = {
  GGAL:  ['galicia','ggal','banco galicia','financiero'],
  YPF:   ['ypf','vaca muerta','petroleo','hidrocarburo'],
  PAMP:  ['pampa energia','pamp','energia electrica'],
  BMA:   ['banco macro','bma'],
  VIST:  ['vista energy','vist','shale','neuquen'],
  TXAR:  ['ternium','acero','txar','siderurgia'],
  ALUA:  ['aluar','aluminio'],
  LOMA:  ['loma negra','cemento','construccion'],
  TGSU2: ['transportadora gas','tgs','gasoducto'],
  EDN:   ['edenor','electricidad','distribucion'],
  NVDA:  ['nvidia','semiconductores','chips','inteligencia artificial','ia'],
  AAPL:  ['apple','iphone','tim cook'],
  MSFT:  ['microsoft','azure','windows','copilot'],
  TSLA:  ['tesla','elon musk','vehiculos electricos'],
  AMZN:  ['amazon','aws','ecommerce'],
  META:  ['meta','facebook','instagram','zuckerberg'],
  GOOGL: ['google','alphabet','gemini','youtube'],
  MELI:  ['mercadolibre','mercadopago','meli'],
  KO:    ['coca cola','bebidas'],
  CRWD:  ['crowdstrike','ciberseguridad','cybersecurity'],
  GOLD:  ['oro','gold','barrick','mineria'],
};

// Palabras clave por sector
const SECTOR_KEYWORDS = {
  'Financiero':     ['banco','credito','tasa','financiero','bcra'],
  'Energía':        ['energia','petroleo','gas','ypf','vaca muerta'],
  'Tecnología':     ['tecnologia','startup','inteligencia artificial','ia'],
  'Semiconductores':['chips','semiconductores','nvidia','intel'],
  'E-commerce':     ['ecommerce','ventas online','mercadolibre'],
  'Automotriz':     ['automotriz','vehiculos','autos'],
  'Siderurgia':     ['acero','siderurgia','metalurgia'],
  'Construcción':   ['construccion','cemento','obras'],
  'Servicios':      ['servicios','tarifas','utilities'],
  'Minería':        ['mineria','oro','plata','cobre'],
};

// Noticias curadas de respaldo — se usan si los RSS fallan
const FALLBACK = [
  { title: 'BCRA mantiene tasas; expectativas de baja para el segundo semestre', source: 'Ámbito Financiero', date: '2h', sentiment: 'neutral' },
  { title: 'FMI revisa al alza proyecciones de crecimiento para Argentina en 2025', source: 'Reuters', date: '4h', sentiment: 'positive' },
  { title: 'Reservas internacionales superan USD 30.000M por primera vez desde 2019', source: 'El Cronista', date: '6h', sentiment: 'positive' },
  { title: 'Inflación de marzo confirma tendencia bajista: 3,7% mensual', source: 'Infobae', date: '8h', sentiment: 'positive' },
  { title: 'Riesgo país perfora 600 puntos por primera vez en cinco años', source: 'Bloomberg', date: '10h', sentiment: 'positive' },
  { title: 'S&P 500 cerca de máximos históricos; Wall Street optimista por datos de empleo', source: 'Reuters', date: '12h', sentiment: 'positive' },
  { title: 'OPEP+ mantiene recortes; WTI sube por tensiones geopolíticas', source: 'Reuters', date: '14h', sentiment: 'neutral' },
  { title: 'Oro en máximos históricos: supera USD 3.100 la onza', source: 'Bloomberg', date: '16h', sentiment: 'positive' },
];

/**
 * Parsea un feed RSS (XML) y devuelve array de items
 */
function parseRSS(xml) {
  const items = [];
  // Extraer bloques <item>
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of itemMatches) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 'si'));
      return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
    };
    const title   = get('title');
    const pubDate = get('pubDate');
    const link    = get('link');
    const desc    = get('description');
    if (title && title.length > 10) {
      items.push({ title, pubDate, link, description: desc });
    }
  }
  return items;
}

/**
 * Clasifica el sentimiento de un título por palabras clave
 */
function sentiment(title) {
  const t = title.toLowerCase();
  const pos = ['sube','gana','record','alza','rally','crece','mejora','positivo','superavit','baja riesgo','reservas','aumento'];
  const neg = ['baja','cae','pierde','crisis','riesgo','inflacion','devalua','default','caida','problema','negativo'];
  if (pos.some(w => t.includes(w))) return 'positive';
  if (neg.some(w => t.includes(w))) return 'negative';
  return 'neutral';
}

/**
 * Formatea fecha RSS a "hace Xh"
 */
function formatAge(pubDate) {
  if (!pubDate) return 'reciente';
  try {
    const diff = Date.now() - new Date(pubDate).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(h / 24);
    if (d > 0) return `hace ${d}d`;
    if (h > 0) return `hace ${h}h`;
    return 'hace unos minutos';
  } catch { return 'reciente'; }
}

/**
 * Fetch y parsea un RSS feed
 */
async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'PampaTerminal/1.0', 'Accept': 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
  const xml = await res.text();
  return parseRSS(xml).map(item => ({ ...item, feedName: feed.name }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase();
  const sector = req.query.sector || '';

  // Keywords para filtrar: ticker-específicos + sector
  const keywords = [
    ...(TICKER_KEYWORDS[ticker] || []),
    ...(SECTOR_KEYWORDS[sector]  || []),
    // Siempre incluir macro argentina
    'argentina', 'merval', 'bolsa', 'economia', 'dolar', 'bcra',
  ];

  try {
    // Fetch todos los feeds en paralelo
    const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));

    // Juntar todos los items exitosos
    const allItems = [];
    for (const r of results) {
      if (r.status === 'fulfilled') allItems.push(...r.value);
    }

    if (allItems.length === 0) throw new Error('Todos los feeds fallaron');

    // Filtrar por relevancia: título contiene alguna keyword
    const filtered = allItems.filter(item => {
      const t = item.title.toLowerCase();
      return keywords.some(kw => t.includes(kw));
    });

    // Si hay pocos resultados relevantes, tomar los más recientes sin filtro
    const toShow = filtered.length >= 3 ? filtered : allItems;

    // Ordenar por fecha desc y tomar los primeros 8
    const sorted = toShow
      .sort((a, b) => {
        try { return new Date(b.pubDate) - new Date(a.pubDate); }
        catch { return 0; }
      })
      .slice(0, 8)
      .map(item => ({
        title:       item.title,
        description: item.description?.slice(0, 150) || null,
        source:      { name: item.feedName },
        url:         item.link || '#',
        publishedAt: item.pubDate,
        age:         formatAge(item.pubDate),
        sentiment:   sentiment(item.title),
      }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      articles: sorted,
      total:    sorted.length,
      source:   'rss',
      ts:       Date.now(),
    });

  } catch (error) {
    console.warn('[/api/news] RSS falló, usando curadas:', error.message);

    // Fallback: noticias curadas
    const articles = FALLBACK.map(n => ({
      title:       n.title,
      description: null,
      source:      { name: n.source },
      url:         '#',
      publishedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      age:         n.date,
      sentiment:   n.sentiment,
    }));

    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json({
      articles,
      total:   articles.length,
      source:  'curated_fallback',
      warning: error.message,
      ts:      Date.now(),
    });
  }
}
