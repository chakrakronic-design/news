/**
 * APMEX Spot Price Proxy — Cloudflare Worker
 * 
 * DEPLOY INSTRUCTIONS:
 * ─────────────────────────────────────────────
 * 1. Go to https://dash.cloudflare.com and sign in (free account works)
 * 2. Click "Workers & Pages" in the left sidebar
 * 3. Click "Create" → "Create Worker"
 * 4. Replace the default code with this entire file
 * 5. Click "Deploy"
 * 6. Copy your worker URL (e.g. https://apmex-spot.YOUR-SUBDOMAIN.workers.dev)
 * 7. Paste that URL into the Newsreader.jsx as PROXY_URL (see comment there)
 *
 * OPTIONAL CUSTOM DOMAIN:
 * - In Worker settings → Triggers → Add Custom Domain
 *
 * RATE LIMITS (free tier):
 * - 100,000 requests/day — more than enough for a personal newsreader
 */

const APMEX_SPOT_URL = "https://www.apmex.com/spotprices";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // Fetch APMEX spot prices page
      const response = await fetch(APMEX_SPOT_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.apmex.com/",
        },
      });

      if (!response.ok) {
        throw new Error(`APMEX returned ${response.status}`);
      }

      const html = await response.text();

      // Parse gold spot price
      // APMEX embeds spot prices in JSON-LD or data attributes — we look for both patterns
      const gold = parsePrice(html, "gold");
      const silver = parsePrice(html, "silver");

      if (!gold && !silver) {
        throw new Error("Could not parse spot prices from APMEX HTML");
      }

      const payload = {
        source: "APMEX",
        url: APMEX_SPOT_URL,
        timestamp: new Date().toISOString(),
        gold: {
          spotPerTroyOz: gold?.spot ?? null,
          changeAmount: gold?.change ?? null,
          changePercent: gold?.changePct ?? null,
        },
        silver: {
          spotPerTroyOz: silver?.spot ?? null,
          changeAmount: silver?.change ?? null,
          changePercent: silver?.changePct ?? null,
        },
      };

      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          // Cache for 3 minutes — spot prices update frequently
          "Cache-Control": "public, max-age=180",
        },
      });

    } catch (err) {
      // Return error as JSON so the client can handle gracefully
      return new Response(
        JSON.stringify({
          error: true,
          message: err.message,
          timestamp: new Date().toISOString(),
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }
  },
};

/**
 * Parse a metal's spot price from APMEX HTML.
 * APMEX renders prices in several ways — we try multiple patterns.
 *
 * @param {string} html  - Full HTML string from APMEX
 * @param {"gold"|"silver"} metal
 * @returns {{ spot: number, change: number, changePct: string } | null}
 */
function parsePrice(html, metal) {
  const label = metal === "gold" ? "Gold" : "Silver";

  // Strategy 1: Look for JSON embedded in a <script type="application/ld+json"> block
  // APMEX sometimes embeds structured product data
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const offers = data?.offers ?? data?.Offers;
      if (offers?.price && data?.name?.toLowerCase().includes(metal)) {
        return { spot: parseFloat(offers.price), change: null, changePct: null };
      }
    } catch (_) {}
  }

  // Strategy 2: Look for data attributes like data-gold-ask, data-silver-ask
  const dataAttrPattern = new RegExp(`data-${metal}-ask="([\\d,\\.]+)"`, "i");
  const dataAttrMatch = html.match(dataAttrPattern);
  if (dataAttrMatch) {
    const spot = parseFloat(dataAttrMatch[1].replace(/,/g, ""));
    const changePct = extractChangePct(html, metal);
    return { spot, change: null, changePct };
  }

  // Strategy 3: Look for labeled price blocks in HTML
  // Pattern: "Gold" ... "$2,345.60" within ~500 chars
  const labelIdx = html.indexOf(`>${label} Spot Price`);
  if (labelIdx !== -1) {
    const snippet = html.slice(labelIdx, labelIdx + 600);
    const priceMatch = snippet.match(/\$\s*([\d,]+\.\d{2})/);
    if (priceMatch) {
      const spot = parseFloat(priceMatch[1].replace(/,/g, ""));
      const changePct = extractChangePct(snippet, metal);
      return { spot, change: null, changePct };
    }
  }

  // Strategy 4: Broad scan for price near metal name
  const broadPattern = new RegExp(
    label + `[\\s\\S]{0,400}?\\$([ \\d,]+\\.\\d{2})`,
    "i"
  );
  const broadMatch = html.match(broadPattern);
  if (broadMatch) {
    const spot = parseFloat(broadMatch[1].replace(/,/g, "").trim());
    if (spot > 0) {
      return { spot, change: null, changePct: extractChangePct(html, metal) };
    }
  }

  return null;
}

/**
 * Try to extract a change % string near a metal label.
 */
function extractChangePct(html, metal) {
  const pattern = new RegExp(
    `(${metal})[\\s\\S]{0,500}?([+-]\\s*\\d+\\.\\d+\\s*%)`,
    "i"
  );
  const match = html.match(pattern);
  return match ? match[2].replace(/\s/g, "") : null;
}
