import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { getCollection } from '../db/mongo';
import { getRoomUserCountAsync } from '../ws/rooms';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const og = new Hono();

// Cache generated images for 5 minutes
const imageCache = new Map<string, { data: Uint8Array; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

// Initialize WASM once
let wasmInitialized = false;
async function ensureWasm() {
  if (wasmInitialized) return;
  try {
    // Try loading the WASM file from node_modules
    const wasmPath = join(import.meta.dir, '..', '..', 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm');
    const wasmData = await readFile(wasmPath);
    await initWasm(wasmData);
    wasmInitialized = true;
  } catch (err) {
    console.error('[og] Failed to initialize resvg WASM:', err);
    throw err;
  }
}

// ─── Theme configurations ───

interface ThemeConfig {
  bg: string;
  gradientStart: string;
  gradientEnd: string;
  accent: string;
  textColor: string;
  subtextColor: string;
  emoji: string;
  label: string;
  bubbleColors: string[];
  decorations: string; // SVG decorations
}

const themes: Record<string, ThemeConfig> = {
  rooftop: {
    bg: '#0f0f1e',
    gradientStart: '#1a1a3e',
    gradientEnd: '#0a0a1a',
    accent: '#ff4488',
    textColor: '#e0e0f0',
    subtextColor: '#8888bb',
    emoji: '🏙️',
    label: 'Rooftop',
    bubbleColors: ['#87CEEB', '#DDA0DD', '#FFB5C2', '#98FB98', '#FFD700'],
    decorations: `
      <!-- Neon glow -->
      <rect x="50" y="320" width="120" height="4" rx="2" fill="#ff4488" opacity="0.8"/>
      <rect x="50" y="320" width="120" height="4" rx="2" fill="#ff4488" filter="url(#glow)"/>
      <!-- Railing silhouette -->
      <line x1="0" y1="380" x2="1200" y2="380" stroke="#334" stroke-width="2"/>
      ${[0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100].map(x =>
        `<line x1="${x}" y1="340" x2="${x}" y2="380" stroke="#334" stroke-width="1.5"/>`
      ).join('')}
      <!-- City skyline -->
      <rect x="900" y="280" width="60" height="100" rx="2" fill="#1a1a30" opacity="0.5"/>
      <rect x="970" y="250" width="40" height="130" rx="2" fill="#1a1a30" opacity="0.4"/>
      <rect x="1020" y="300" width="50" height="80" rx="2" fill="#1a1a30" opacity="0.3"/>
      <rect x="1080" y="270" width="35" height="110" rx="2" fill="#1a1a30" opacity="0.4"/>
    `,
  },
  park: {
    bg: '#081208',
    gradientStart: '#0e2a0e',
    gradientEnd: '#061006',
    accent: '#88cc44',
    textColor: '#d0e8d0',
    subtextColor: '#77aa77',
    emoji: '🌳',
    label: 'Park',
    bubbleColors: ['#98FB98', '#87CEEB', '#FFD700', '#FFB5C2', '#DDA0DD'],
    decorations: `
      <!-- Trees -->
      <circle cx="950" cy="320" r="40" fill="#1a5a1a" opacity="0.6"/>
      <rect x="947" y="340" width="6" height="40" fill="#5a3a1a" opacity="0.5"/>
      <circle cx="1050" cy="300" r="50" fill="#2a6a2a" opacity="0.5"/>
      <rect x="1047" y="330" width="6" height="50" fill="#5a3a1a" opacity="0.4"/>
      <circle cx="1130" cy="330" r="30" fill="#1a5a1a" opacity="0.4"/>
      <!-- Fireflies -->
      ${[850, 900, 980, 1020, 1100].map((x, i) =>
        `<circle cx="${x}" cy="${250 + (i * 20) % 60}" r="2" fill="#ccff44" opacity="${0.4 + i * 0.1}"/>`
      ).join('')}
      <!-- Moon -->
      <circle cx="1100" cy="80" r="25" fill="#eeeedd" opacity="0.3"/>
    `,
  },
  alley: {
    bg: '#080605',
    gradientStart: '#1a1410',
    gradientEnd: '#060504',
    accent: '#ff6622',
    textColor: '#e8d8c8',
    subtextColor: '#aa8866',
    emoji: '🏮',
    label: 'Alley',
    bubbleColors: ['#FFB5C2', '#FF69B4', '#FFD700', '#FFDAB9', '#DDA0DD'],
    decorations: `
      <!-- Brick walls -->
      <rect x="0" y="200" width="15" height="200" fill="#5a3010" opacity="0.4"/>
      <rect x="1185" y="200" width="15" height="200" fill="#4a2810" opacity="0.4"/>
      <!-- Paper lanterns -->
      ${[
        { x: 880, y: 120, color: '#ff4422' },
        { x: 950, y: 140, color: '#ff6622' },
        { x: 1020, y: 110, color: '#ffaa22' },
        { x: 1090, y: 130, color: '#ff4422' },
      ].map(l => `
        <line x1="${l.x}" y1="60" x2="${l.x}" y2="${l.y - 15}" stroke="#555" stroke-width="0.5"/>
        <ellipse cx="${l.x}" cy="${l.y}" rx="12" ry="16" fill="${l.color}" opacity="0.8"/>
        <ellipse cx="${l.x}" cy="${l.y}" rx="12" ry="16" fill="${l.color}" filter="url(#glow)" opacity="0.4"/>
      `).join('')}
      <!-- Lantern wire -->
      <path d="M860,70 Q950,100 1110,75" stroke="#444" stroke-width="0.5" fill="none"/>
      <!-- Neon sign -->
      <rect x="1140" y="250" width="40" height="20" rx="3" fill="#111"/>
      <rect x="1143" y="253" width="34" height="14" rx="2" fill="#4488ff" opacity="0.7"/>
    `,
  },
};

function generateSVG(
  placeName: string,
  theme: ThemeConfig,
  userCount: number,
  bubbleCount: number,
): string {
  // Generate random bubble positions (deterministic from place name)
  let seed = 0;
  for (let i = 0; i < placeName.length; i++) seed = ((seed << 5) - seed + placeName.charCodeAt(i)) | 0;
  const rng = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };

  const bubbles = Array.from({ length: 15 }, () => ({
    cx: 100 + rng() * 700,
    cy: 80 + rng() * 250,
    r: 8 + rng() * 30,
    color: theme.bubbleColors[Math.floor(rng() * theme.bubbleColors.length)],
    opacity: 0.15 + rng() * 0.3,
  }));

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.gradientStart};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${theme.gradientEnd};stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="bubble-glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Theme decorations -->
  ${theme.decorations}

  <!-- Bubbles -->
  ${bubbles.map(b => `
    <circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="none" stroke="${b.color}" stroke-width="1.5" opacity="${b.opacity}" filter="url(#bubble-glow)"/>
    <circle cx="${b.cx - b.r * 0.25}" cy="${b.cy - b.r * 0.25}" r="${b.r * 0.15}" fill="white" opacity="${b.opacity * 0.6}"/>
  `).join('')}

  <!-- Logo + Title area -->
  <text x="60" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="${theme.subtextColor}" opacity="0.7">🫧 Bubbles</text>

  <!-- Place name -->
  <text x="60" y="200" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="700" fill="${theme.textColor}">
    ${escapeXml(placeName.length > 20 ? placeName.slice(0, 18) + '…' : placeName)}
  </text>

  <!-- Theme badge -->
  <rect x="60" y="230" width="${theme.label.length * 12 + 50}" height="36" rx="18" fill="${theme.accent}" opacity="0.2"/>
  <text x="80" y="254" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="${theme.accent}">
    ${theme.emoji} ${theme.label}
  </text>

  <!-- Stats -->
  <text x="60" y="340" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="${theme.subtextColor}">
    ${userCount > 0 ? `${userCount} online now` : 'Come blow some bubbles!'}
  </text>

  <!-- Bottom bar -->
  <rect x="0" y="580" width="1200" height="50" fill="${theme.bg}" opacity="0.8"/>
  <text x="60" y="612" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="${theme.subtextColor}" opacity="0.6">bubbles.jiun.dev</text>
</svg>`;
}

function escapeXml(str: string): string {
  return str.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

// ─── Default OG image (no specific place) ───

og.get('/default.png', async (c) => {
  const cacheKey = 'default';
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return new Response(cached.data.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  try {
    await ensureWasm();
    const svg = generateSVG('Blow Bubbles Together', themes.rooftop, 0, 0);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const png = resvg.render().asPng();

    imageCache.set(cacheKey, { data: png, timestamp: Date.now() });
    return new Response(png.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    console.error('[og] Failed to generate default image:', err);
    return c.text('Failed to generate image', 500);
  }
});

// ─── Per-place OG image ───

og.get('/place/:placeId.png', async (c) => {
  const placeId = c.req.param('placeId') ?? '';

  // Validate placeId
  if (!/^[0-9a-fA-F]{24}$/.test(placeId)) {
    return c.text('Invalid place ID', 400);
  }

  const cacheKey = `place:${placeId}`;
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return new Response(cached.data.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    const col = getCollection('places');
    const place = await col.findOne({ _id: new ObjectId(placeId) });
    if (!place) {
      return c.text('Place not found', 404);
    }

    const themeKey = (place.theme as string) || 'rooftop';
    const theme = themes[themeKey] || themes.rooftop;
    const userCount = await getRoomUserCountAsync(placeId);

    await ensureWasm();
    const svg = generateSVG(place.name, theme, userCount, 0);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const png = resvg.render().asPng();

    imageCache.set(cacheKey, { data: png, timestamp: Date.now() });
    return new Response(png.buffer as ArrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (err) {
    console.error('[og] Failed to generate place image:', err);
    return c.text('Failed to generate image', 500);
  }
});

// ─── Crawler HTML for /place/:placeId ───
// Returns minimal HTML with OG tags for social media crawlers

og.get('/html/place/:placeId', async (c) => {
  const placeId = c.req.param('placeId') ?? '';
  if (!/^[0-9a-fA-F]{24}$/.test(placeId)) {
    return c.text('Invalid place ID', 400);
  }

  try {
    const col = getCollection('places');
    const place = await col.findOne({ _id: new ObjectId(placeId) });
    if (!place) {
      return c.redirect('/');
    }

    const themeKey = (place.theme as string) || 'rooftop';
    const theme = themes[themeKey] || themes.rooftop;
    const forwardedHost = c.req.header('X-Forwarded-Host');
    const baseUrl = forwardedHost
      ? `https://${forwardedHost}`
      : 'https://bubbles.jiun.dev';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(place.name)} — Bubbles</title>
  <meta property="og:title" content="${escapeXml(place.name)} ${theme.emoji}" />
  <meta property="og:description" content="Join ${escapeXml(place.name)} and blow bubbles together! ${theme.emoji} ${theme.label} theme." />
  <meta property="og:image" content="${baseUrl}/og/place/${placeId}.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${baseUrl}/place/${placeId}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Bubbles" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeXml(place.name)} ${theme.emoji}" />
  <meta name="twitter:description" content="Join and blow bubbles together!" />
  <meta name="twitter:image" content="${baseUrl}/og/place/${placeId}.png" />
  <meta http-equiv="refresh" content="0;url=/place/${placeId}" />
</head>
<body>
  <p>Redirecting to <a href="/place/${placeId}">${escapeXml(place.name)}</a>...</p>
</body>
</html>`;

    return c.html(html);
  } catch {
    return c.redirect('/');
  }
});

export { og };
