const MOWARID_API = "https://mowarid.ma/api/v1";
const ALLOWED_ORIGIN = "https://ismailnhari666-hue.github.io";
const STORE_URL = ALLOWED_ORIGIN + "/souqnova/";
const MAX_BODY_CHARS = 20000;
const MAX_ITEMS = 50;
const MAX_QTY = 20;

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });

const relay = async r =>
  new Response(await r.text(), {
    status: r.status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });

const validPhone = p => /^(05|06|07)\d{8}$/.test(String(p || ""));

// Le tarif de livraison est calculé ICI, jamais pris tel quel depuis le navigateur.
// Même règle que CASA_RE dans index.html, pour que le total affiché = le total facturé.
const CASA_RE = /casablanca|\bcasa\b|dar el beida|dar el-beida|الدار البيضاء|الدارالبيضاء/i;
const shippingFee = city => (CASA_RE.test(String(city || "")) ? 20 : 30);

// Anti-spam Cloudflare Turnstile : actif seulement si le secret TURNSTILE_SECRET est défini.
async function turnstileOk(env, token, request) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token || String(token).length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", String(token));
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const d = await r.json().catch(() => ({}));
  return d.success === true;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new Error("Body too large");
  return JSON.parse(text);
}

// Normalise les lignes du panier (le front envoie `sku` pour /quote et `product_code` pour /orders).
function normalizeItems(b) {
  const raw = Array.isArray(b.items)
    ? b.items
    : [{ product_code: b.product_code, quantity: b.quantity, retail_price: b.retail_price }];

  if (!raw.length || raw.length > MAX_ITEMS) return null;

  const items = [];
  for (const i of raw) {
    const code = String(i?.product_code || i?.sku || "").trim();
    const quantity = Number(i?.quantity);
    const price = Number(i?.retail_price);
    if (
      !code ||
      code.length > 100 ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY ||
      !Number.isFinite(price) || price <= 0 || price > 100000
    ) return null;
    items.push({
      code,
      quantity,
      price,
      group: String(i?.supplier_group_id || "")
    });
  }
  return items;
}

const subtotalOf = items => items.reduce((s, i) => s + i.price * i.quantity, 0);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Les écritures doivent venir d'un navigateur sur le site autorisé.
    // (Ce n'est PAS une vraie protection anti-bot : l'en-tête Origin peut être falsifié hors navigateur.)
    if (request.method === "POST" && origin !== ALLOWED_ORIGIN) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    if (!env.MOWARID_API_KEY) {
      console.error("MOWARID_API_KEY is not configured");
      return json({ success: false, error: "API key not configured" }, 500);
    }

    const auth = {
      Authorization: `Bearer ${env.MOWARID_API_KEY}`,
      Accept: "application/json"
    };
    const authJson = { ...auth, "Content-Type": "application/json" };

    try {
      if (path === "/api/cities" && request.method === "GET") {
        return relay(await fetch(`${MOWARID_API}/cities`, { headers: auth }));
      }

      if (path === "/api/products" && request.method === "GET") {
        // Seuls limit et cursor sont transmis au fournisseur.
        const params = new URLSearchParams();
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
        params.set("limit", String(limit));
        const cursor = url.searchParams.get("cursor");
        if (cursor && cursor.length <= 500) params.set("cursor", cursor);

        return relay(await fetch(`${MOWARID_API}/products?${params}`, { headers: auth }));
      }

      if (path === "/api/quote" && request.method === "POST") {
        let b;
        try { b = await readJson(request); }
        catch { return json({ success: false, error: "Invalid JSON" }, 400); }

        const items = normalizeItems(b);
        if (!items || !b.city) return json({ success: false, error: "Invalid items" }, 400);

        const fee = shippingFee(b.city);

        return relay(await fetch(`${MOWARID_API}/orders/quote`, {
          method: "POST",
          headers: authJson,
          body: JSON.stringify({
            city: String(b.city).trim(),
            customer_shipping_fee: fee,
            cod_to_collect: subtotalOf(items) + fee,
            items: items.map(i => ({ sku: i.code, quantity: i.quantity, retail_price: i.price }))
          })
        }));
      }

      if (path === "/api/orders" && request.method === "POST") {
        let b;
        try { b = await readJson(request); }
        catch { return json({ success: false, error: "Invalid JSON" }, 400); }

        if (!(await turnstileOk(env, b.turnstile_token, request))) {
          return json({ success: false, error: "Anti-spam check failed" }, 403);
        }

        if (!b.external_order_id || String(b.external_order_id).length > 100) {
          return json({ success: false, error: "external_order_id required" }, 400);
        }

        const name = String(b.customer_name || "").trim();
        const city = String(b.city || "").trim();
        const address = String(b.address || "").trim();

        if (
          !name || name.length > 120 ||
          !validPhone(b.customer_phone) ||
          !city || city.length > 80 ||
          !address || address.length > 300
        ) {
          return json({ success: false, error: "Invalid customer details or Moroccan phone" }, 400);
        }

        const items = normalizeItems(b);
        if (!items) return json({ success: false, error: "Invalid items" }, 400);

        const groups = new Set(items.map(i => i.group).filter(Boolean));
        if (groups.size > 1) {
          return json({ success: false, error: "mixed_suppliers_not_allowed" }, 400);
        }

        const fee = shippingFee(city);
        const subtotal = subtotalOf(items);

        // Re-vérification côté serveur : le fournisseur valide prix et frais avant toute commande.
        const quoteRes = await fetch(`${MOWARID_API}/orders/quote`, {
          method: "POST",
          headers: authJson,
          body: JSON.stringify({
            city,
            customer_shipping_fee: fee,
            cod_to_collect: subtotal + fee,
            items: items.map(i => ({ sku: i.code, quantity: i.quantity, retail_price: i.price }))
          })
        });

        let quote = null;
        try { quote = await quoteRes.json(); } catch { /* réponse non JSON */ }

        if (!quoteRes.ok || !quote || quote.success !== true || quote.is_valid !== true) {
          return json({
            success: false,
            error: quote?.error || quote?.message || "Quote rejected"
          }, 422);
        }

        const payload = {
          external_order_id: String(b.external_order_id),
          store_name: "SouqNova",
          store_url: STORE_URL,
          customer_name: name,
          customer_phone: String(b.customer_phone),
          city,
          address,
          customer_shipping_fee: fee,
          notes: String(b.notes || "").slice(0, 500),
          items: items.map(i => ({
            product_code: i.code,
            quantity: i.quantity,
            retail_price: i.price
          }))
        };

        return relay(await fetch(`${MOWARID_API}/orders`, {
          method: "POST",
          headers: authJson,
          body: JSON.stringify(payload)
        }));
      }

      return json({ success: false, error: "Route not found" }, 404);

    } catch (error) {
      console.error("Worker error:", error && error.message);
      return json({ success: false, error: "Server error" }, 502);
    }
  }
};
