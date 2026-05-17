const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── SEARCH ───────────────────────────────────────────────────────
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query param: q" });

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const response = await fetch(url);
    const data = await response.json();

    const results = (data.RelatedTopics || [])
      .filter((r) => r.FirstURL && r.Text)
      .slice(0, 10)
      .map((r) => ({
        title: r.Text.split(" - ")[0] || r.Text,
        description: r.Text,
        url: r.FirstURL,
      }));

    res.json({ query, results });
  } catch (err) {
    res.status(500).json({ error: "Search failed", detail: err.message });
  }
});

// ─── PAGE FETCHER / WEB PROXY ─────────────────────────────────────
app.get("/fetch", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing ?url=");

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).send("Invalid URL");
  }

  const origin = parsedUrl.origin;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "Referer": origin,
      },
    });

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      res.set("Content-Type", contentType);
      response.body.pipe(res);
      return;
    }

    let html = await response.text();
    const proxyBase = `${req.protocol}://${req.get("host")}/fetch?url=`;

    const injectedScript = `
<base href="${origin}/">
<script>
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    e.preventDefault();
    let fullUrl;
    try { fullUrl = new URL(href, '${targetUrl}').href; } catch { return; }
    window.location.href = '${proxyBase}' + encodeURIComponent(fullUrl);
  }, true);

  document.addEventListener('submit', function(e) {
    const form = e.target;
    const action = form.getAttribute('action') || window.location.href;
    let fullAction;
    try { fullAction = new URL(action, '${targetUrl}').href; } catch { return; }
    e.preventDefault();
    const params = new URLSearchParams(new FormData(form)).toString();
    window.location.href = '${proxyBase}' + encodeURIComponent(fullAction + (params ? '?' + params : ''));
  }, true);
<\/script>`;

    html = html.replace(/<head([^>]*)>/i, `<head$1>${injectedScript}`);

    html = html.replace(/(src|href)=["'](https?:\/\/[^"']+)["']/gi, (match, attr, url) => {
      if (url.match(/\.(css|js)(\?|$)/i)) {
        return `${attr}="${proxyBase}${encodeURIComponent(url)}"`;
      }
      return match;
    });

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("X-Frame-Options", "ALLOWALL");
    res.send(html);

  } catch (err) {
    res.status(500).send(`<html><body style="background:#111;color:#fff;font-family:sans-serif;padding:40px">
      <h2>Could not load page</h2>
      <p>${err.message}</p>
    </body></html>`);
  }
});

app.get("/", (req, res) => res.send("vrBox proxy running"));

app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
