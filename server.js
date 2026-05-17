const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

app.get("/", (req, res) => res.send("vrBox proxy running"));

app.listen(PORT, () => console.log(`Proxy listening on port ${PORT}`));
