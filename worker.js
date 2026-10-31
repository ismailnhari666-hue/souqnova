const MOWARID_API = "https://mowarid.ma/api/v1";
const ALLOWED_ORIGIN = "https://ismailnhari666-hue.github.io";

const json = (data, status = 200, cors = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8"
    }
  });

const validPhone = p => /^(05|06|07)\d{8}$/.test(String(p || ""));

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/check-secret" && request.method === "GET") {
        return json({ keyFound: Boolean(env.MOWARID_API_KEY) }, 200, cors);
      }

      if (path === "/api/cities" && request.method === "GET") {
        const r = await fetch(`${MOWARID_API}/cities`);
        return new Response(await r.text(), {
          status: r.status,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }

      if (!env.MOWARID_API_KEY) {
        return json({ success: false, error: "API key not configured" }, 500, cors);
      }

      const auth = {
        Authorization: `Bearer ${env.MOWARID_API_KEY}`,
        Accept: "application/json"
      };

      if (path === "/api/products" && request.method === "GET") {
        const r = await fetch(`${MOWARID_API}/products${url.search}`, {
          headers: auth
        });

        return new Response(await r.text(), {
          status: r.status,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }

      if (path === "/api/quote" && request.method === "POST") {
        const body = await request.text();

        const r = await fetch(`${MOWARID_API}/orders/quote`, {
          method: "POST",
          headers: {
            ...auth,
            "Content-Type": "application/json"
          },
          body
        });

        return new Response(await r.text(), {
          status: r.status,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }

      if (path === "/api/orders" && request.method === "POST") {
        let b;

        try {
          b = await request.json();
        } catch {
          return json({ success: false, error: "Invalid JSON" }, 400, cors);
        }

        const items = Array.isArray(b.items)
          ? b.items
          : [{
              product_code: b.product_code,
              quantity: b.quantity,
              retail_price: b.retail_price
            }];

        if (!b.external_order_id || String(b.external_order_id).length > 100) {
          return json({ success: false, error: "external_order_id required" }, 400, cors);
        }

        if (
          !b.customer_name ||
          !validPhone(b.customer_phone) ||
          !b.city ||
          !b.address
        ) {
          return json({ success: false, error: "Invalid customer details or Moroccan phone" }, 400, cors);
        }

        if (
          !items.length ||
          items.length > 50 ||
          items.some(i =>
            !i.product_code ||
            !Number.isInteger(Number(i.quantity)) ||
            Number(i.quantity) < 1 ||
            !Number.isFinite(Number(i.retail_price)) ||
            Number(i.retail_price) <= 0
          )
        ) {
          return json({ success: false, error: "Invalid items" }, 400, cors);
        }

        const payload = {
          external_order_id: String(b.external_order_id),
          store_name: "SouqNova",
          store_url: "https://ismailnhari666-hue.github.io/souqnova/",
          customer_name: String(b.customer_name).trim(),
          customer_phone: String(b.customer_phone),
          city: String(b.city).trim(),
          address: String(b.address).trim(),
          customer_shipping_fee: Number(b.customer_shipping_fee || 0),
          notes: String(b.notes || "").slice(0, 500),
          items: items.map(i => ({
            product_code: String(i.product_code),
            quantity: Number(i.quantity),
            retail_price: Number(i.retail_price)
          }))
        };

        const r = await fetch(`${MOWARID_API}/orders`, {
          method: "POST",
          headers: {
            ...auth,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        return new Response(await r.text(), {
          status: r.status,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }

      return json({ error: "Route not found" }, 404, cors);

    } catch (error) {
      return json({ success: false, error: "Server error" }, 502, cors);
    }
  }
};
