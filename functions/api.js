// functions/api.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ★ Cloudflare Pages → Variables and Secrets の GAS_URL を見る用
  if (url.searchParams.get("__debug") === "1") {
    return json(
      {
        ok: true,
        where: "cloudflare-pages-function",
        gasUrlSet: Boolean(env.GAS_URL),
        gasUrlPreview: env.GAS_URL ? maskUrl(env.GAS_URL) : null,
        method: request.method,
        params: Object.fromEntries(url.searchParams.entries()),
      },
      200,
      corsHeaders(request)
    );
  }

  const GAS_URL = env.GAS_URL;

  if (!GAS_URL) {
    return json({ ok: false, error: "GAS_URL is not set" }, 500, corsHeaders(request));
  }

  // preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  // クエリを丸ごとGASへ転送
  const forwardUrl = new URL(GAS_URL);
  forwardUrl.search = url.search;

  // 送信ヘッダ（最低限）
  const headers = new Headers();
  const ct = request.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  const accept = request.headers.get("Accept");
  if (accept) headers.set("Accept", accept);

  const init = {
    method: request.method,
    headers,
    redirect: "follow",
  };

  // POST/PUT等は body を中継
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const res = await fetch(forwardUrl.toString(), init);
  const bodyText = await res.text();

  const outHeaders = new Headers(corsHeaders(request));
  outHeaders.set("Cache-Control", "no-store");

  const resCT = res.headers.get("Content-Type");
  outHeaders.set("Content-Type", resCT || "application/json; charset=utf-8");

  return new Response(bodyText, { status: res.status, headers: outHeaders });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

// URLをそのまま晒さない用（debug表示用）
function maskUrl(u) {
  try {
    const x = new URL(u);
    const m = x.pathname.match(/\/macros\/s\/([^/]+)\/exec/);
    const id = m?.[1] || "";
    const head = id.slice(0, 6);
    const tail = id.slice(-6);
    x.pathname = id ? `/macros/s/${head}...${tail}/exec` : "/macros/s/.../exec";
    x.search = "";
    return x.toString();
  } catch {
    return "invalid_url";
  }
}


