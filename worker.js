const MOWARID_API = "https://mowarid.ma/api/v1";
const ALLOWED_ORIGIN = "https://ismailnhari666-hue.github.io";
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    const headers = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {

      // Test secret without revealing its value
      if (path === "/api/check-secret" && request.method === "GET") {
        return new Response(
          JSON.stringify({
            keyFound: Boolean(env.MOWARID_API_KEY)
          }),
          { headers }
        );
      }

      // Public cities list
      if (path === "/api/cities" && request.method === "GET") {
        const response = await fetch(`${MOWARID_API}/cities`);

        return new Response(await response.text(), {
          status: response.status,
          headers
        });
      }

      // Check API key
      if (!env.MOWARID_API_KEY) {
        return new Response(
          JSON.stringify({ error: "API key not configured" }),
          { status: 500, headers }
        );
      }

      const authHeaders = {
        "Authorization": `Bearer ${env.MOWARID_API_KEY}`,
        "Accept": "application/json"
      };

      // Get products
      if (path === "/api/products" && request.method === "GET") {
        const query = url.searchParams.toString();

        const response = await fetch(
          `${MOWARID_API}/products${query ? "?" + query : ""}`,
          { headers: authHeaders }
        );

        return new Response(await response.text(), {
          status: response.status,
          headers
        });
      }

      // Calculate order quote
      if (path === "/api/quote" && request.method === "POST") {
        const body = await request.text();

        const response = await fetch(`${MOWARID_API}/orders/quote`, {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json"
          },
          body
        });

        return new Response(await response.text(), {
          status: response.status,
          headers
        });
      }

      return new Response(
        JSON.stringify({ error: "Route not found" }),
        { status: 404, headers }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Server error" }),
        { status: 502, headers }
      );
    }
  }
};
