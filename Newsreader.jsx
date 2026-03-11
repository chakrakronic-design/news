import { useState, useEffect } from "react";

const CATEGORIES = ["World", "Technology", "Science", "Business", "Culture", "Health"];

const NEWS_SOURCES = [
  { name: "Drudge Report", short: "Drudge", bias: "right-leaning aggregator" },
  { name: "CNN", short: "CNN", bias: "mainstream broadcast" },
  { name: "Mediaite", short: "Mediaite", bias: "media criticism" },
  { name: "France 24", short: "France 24", bias: "international" },
  { name: "BBC", short: "BBC", bias: "international public broadcaster" },
  { name: "Wall Street Journal", short: "WSJ", bias: "financial/center-right" },
];

const SOURCE_NAMES = NEWS_SOURCES.map((s) => s.name).join(", ");

const placeholderStories = [
  {
    id: 1,
    category: "Technology",
    source: "BBC",
    headline: "The Age of Ambient Intelligence",
    summary: "How quietly embedded AI is reshaping everyday decisions, from traffic routing to medical diagnoses, without most people noticing.",
    time: "2 hours ago",
    readTime: "6 min read",
    featured: true,
  },
  {
    id: 2,
    category: "World",
    source: "France 24",
    headline: "Cities Rethink the 15-Minute Radius",
    summary: "Urban planners across Europe are redesigning neighborhoods so every necessity is within a short walk or cycle.",
    time: "4 hours ago",
    readTime: "4 min read",
    featured: false,
  },
  {
    id: 3,
    category: "Science",
    source: "Wall Street Journal",
    headline: "Deep Ocean Currents Are Slowing",
    summary: "New satellite data reveals a measurable deceleration in Atlantic circulation patterns, with implications for global climate systems.",
    time: "5 hours ago",
    readTime: "5 min read",
    featured: false,
  },
  {
    id: 4,
    category: "Business",
    source: "WSJ",
    headline: "The Quiet Pivot to Profitability",
    summary: "After years of growth-at-all-costs, a new wave of startups is discovering that margins, not momentum, win investor confidence.",
    time: "6 hours ago",
    readTime: "3 min read",
    featured: false,
  },
  {
    id: 5,
    category: "Culture",
    source: "CNN",
    headline: "Analog Revival in a Digital Age",
    summary: "Record sales, film photography, and handwritten letters are surging. What does this nostalgia signal about our relationship with technology?",
    time: "8 hours ago",
    readTime: "7 min read",
    featured: false,
  },
  {
    id: 6,
    category: "Health",
    source: "Mediaite",
    headline: "Sleep Science Gets Personal",
    summary: "Researchers now say the optimal sleep schedule varies dramatically by individual biology — and blanket advice may be doing harm.",
    time: "10 hours ago",
    readTime: "4 min read",
    featured: false,
  },
];

export default function Newsreader() {
  const [activeCategory, setActiveCategory] = useState("World");
  const [activeSource, setActiveSource] = useState("All");
  const [stories, setStories] = useState(placeholderStories);
  const [loading, setLoading] = useState(false);
  const [expandedStory, setExpandedStory] = useState(null);
  const [fullArticle, setFullArticle] = useState("");
  const [articleLoading, setArticleLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [time, setTime] = useState(new Date());
  const [spotPrices, setSpotPrices] = useState({ gold: null, silver: null, goldChange: null, silverChange: null });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // ─────────────────────────────────────────────────────────────────
    // APMEX Spot Price Proxy
    // After deploying apmex-spot-worker.js to Cloudflare Workers,
    // replace the URL below with your worker's URL, e.g.:
    //   https://apmex-spot.YOUR-SUBDOMAIN.workers.dev
    // ─────────────────────────────────────────────────────────────────
    const PROXY_URL = "https://apmex-spot.YOUR-SUBDOMAIN.workers.dev";

    const fetchSpotPrices = async () => {
      try {
        const res = await fetch(PROXY_URL);
        if (!res.ok) throw new Error(`Proxy error ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.message);

        const fmt = (n) => n != null ? Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

        setSpotPrices({
          gold: data.gold?.spotPerTroyOz != null ? fmt(data.gold.spotPerTroyOz) : null,
          silver: data.silver?.spotPerTroyOz != null ? fmt(data.silver.spotPerTroyOz) : null,
          goldChange: data.gold?.changePercent ?? null,
          silverChange: data.silver?.changePercent ?? null,
          source: "APMEX",
          timestamp: data.timestamp,
        });
      } catch (e) {
        console.warn("APMEX proxy unavailable, using fallback:", e.message);
        // Fallback until worker is deployed
        setSpotPrices({ gold: "2,345.60", silver: "29.84", goldChange: null, silverChange: null, source: "–" });
      }
    };

    fetchSpotPrices();
    const priceTimer = setInterval(fetchSpotPrices, 3 * 60 * 1000); // refresh every 3 min
    return () => clearInterval(priceTimer);
  }, []);

  const fetchStoriesForCategory = async (category, source = activeSource) => {
    setLoading(true);
    setExpandedStory(null);
    setFullArticle("");
    const sourceInstruction = source !== "All"
      ? `All stories must be attributed to ${source}. Write in the editorial voice and style typical of ${source}.`
      : `Attribute each story to one of these prioritized news organizations: ${SOURCE_NAMES}. Distribute sources across stories. Each story should reflect the voice and editorial style of its attributed source.`;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `Generate 5 realistic, compelling news headlines and summaries for the "${category}" category.
              ${sourceInstruction}
              Return ONLY valid JSON array, no markdown, no backticks:
              [{"id":1,"category":"${category}","source":"Source Name","headline":"...","summary":"...","time":"X hours ago","readTime":"X min read","featured":true/false}]
              Make the first one featured:true. Headlines punchy and journalistic. Summaries 1-2 sentences, substantive.`,
            },
          ],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "[]";
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setStories(parsed);
    } catch (e) {
      setStories(placeholderStories.filter((s) => s.category === category || category === "World"));
    }
    setLoading(false);
  };

  const fetchFullArticle = async (story) => {
    setArticleLoading(true);
    setFullArticle("");
    const sourceVoice = story.source ? `Write this article in the editorial style of ${story.source}.` : "";
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `Write a short, compelling news article (3-4 paragraphs) based on this headline and summary:
              Headline: "${story.headline}"
              Summary: "${story.summary}"
              ${sourceVoice}
              Write in a clean, journalistic style. No markdown formatting. Just plain paragraphs separated by newlines.`,
            },
          ],
        }),
      });
      const data = await response.json();
      setFullArticle(data.content?.[0]?.text || "Article unavailable.");
    } catch (e) {
      setFullArticle("Unable to load the full article at this time.");
    }
    setArticleLoading(false);
  };

  const handleCategoryClick = (cat) => {
    setActiveCategory(cat);
    fetchStoriesForCategory(cat, activeSource);
  };

  const handleSourceClick = (source) => {
    setActiveSource(source);
    setSearchActive(false);
    setSearchQuery("");
    fetchStoriesForCategory(activeCategory, source);
  };

  const handleStoryClick = (story) => {
    setExpandedStory(story);
    fetchFullArticle(story);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setExpandedStory(null);
    setFullArticle("");
    setSearchActive(true);
    const sourceInstruction = activeSource !== "All"
      ? `All stories attributed to ${activeSource}.`
      : `Attribute each story to one of: ${SOURCE_NAMES}.`;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `Generate 4 realistic news stories about: "${searchQuery}".
              ${sourceInstruction}
              Return ONLY valid JSON array:
              [{"id":1,"category":"...","source":"Source Name","headline":"...","summary":"...","time":"X hours ago","readTime":"X min read","featured":true/false}]
              First item featured:true. Be specific and journalistic.`,
            },
          ],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "[]";
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setStories(parsed);
    } catch (e) {
      setStories([]);
    }
    setLoading(false);
  };

  const featured = stories.find((s) => s.featured);
  const secondary = stories.filter((s) => !s.featured);

  const bg = darkMode ? "#0d0d0d" : "#f5f0e8";
  const fg = darkMode ? "#e8e0d0" : "#1a1a1a";
  const accent = "#c8392b";
  const cardBg = darkMode ? "#1a1a1a" : "#ffffff";
  const borderColor = darkMode ? "#2a2a2a" : "#d4ccc0";
  const mutedColor = darkMode ? "#888" : "#888";

  return (
    <div style={{ minHeight: "100vh", background: bg, color: fg, fontFamily: "'Georgia', serif", transition: "all 0.3s ease" }}>

      {/* Metals Ticker */}
      <div style={{ background: "#1a1a1a", color: "#e8e0d0", padding: "0", overflow: "hidden", borderBottom: "2px solid #c8392b", position: "relative", height: "32px", display: "flex", alignItems: "center" }}>
        {/* Static label */}
        <div style={{ background: "#c8392b", color: "#fff", padding: "0 14px", height: "100%", display: "flex", alignItems: "center", fontSize: "10px", letterSpacing: "0.2em", fontWeight: "bold", whiteSpace: "nowrap", zIndex: 2, fontFamily: "monospace", flexShrink: 0 }}>
          APMEX SPOT
        </div>
        {/* Scrolling ticker content */}
        <div style={{ overflow: "hidden", flex: 1, height: "100%", display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "60px", animation: "tickerScroll 28s linear infinite", whiteSpace: "nowrap", paddingLeft: "40px" }}>
            {[1, 2, 3].map((repeat) => (
              <div key={repeat} style={{ display: "flex", gap: "60px", alignItems: "center" }}>
                {/* Gold */}
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ color: "#f0c040", fontSize: "9px", letterSpacing: "0.2em", fontFamily: "monospace", fontWeight: "bold" }}>● GOLD SPOT</span>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: "bold", color: "#fff" }}>
                    {spotPrices.gold ? `$${Number(spotPrices.gold).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </span>
                  <span style={{ fontSize: "9px", fontFamily: "monospace", color: "#777", letterSpacing: "0.05em" }}>t oz</span>
                  <span style={{ color: "#444", fontSize: "10px" }}>/</span>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: "bold", color: "#ccc" }}>
                    {spotPrices.gold ? `$${(Number(spotPrices.gold) / 31.1035).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </span>
                  <span style={{ fontSize: "9px", fontFamily: "monospace", color: "#777", letterSpacing: "0.05em" }}>g</span>
                  <span style={{ fontSize: "10px", fontFamily: "monospace", color: spotPrices.goldChange?.startsWith("+") ? "#4ade80" : "#f87171" }}>
                    {spotPrices.goldChange || ""}
                  </span>
                </span>
                {/* Divider */}
                <span style={{ color: "#333", fontSize: "14px" }}>|</span>
                {/* Silver */}
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ color: "#c0c8d0", fontSize: "9px", letterSpacing: "0.2em", fontFamily: "monospace", fontWeight: "bold" }}>● SILVER SPOT</span>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: "bold", color: "#fff" }}>
                    {spotPrices.silver ? `$${Number(spotPrices.silver).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </span>
                  <span style={{ fontSize: "9px", fontFamily: "monospace", color: "#777", letterSpacing: "0.05em" }}>t oz</span>
                  <span style={{ color: "#444", fontSize: "10px" }}>/</span>
                  <span style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: "bold", color: "#ccc" }}>
                    {spotPrices.silver ? `$${(Number(spotPrices.silver) / 31.1035).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : "—"}
                  </span>
                  <span style={{ fontSize: "9px", fontFamily: "monospace", color: "#777", letterSpacing: "0.05em" }}>g</span>
                  <span style={{ fontSize: "10px", fontFamily: "monospace", color: spotPrices.silverChange?.startsWith("+") ? "#4ade80" : "#f87171" }}>
                    {spotPrices.silverChange || ""}
                  </span>
                </span>
                {/* Divider */}
                <span style={{ color: "#333", fontSize: "14px" }}>|</span>
                {/* Last Updated */}
                <span style={{ fontSize: "9px", fontFamily: "monospace", color: "#555", letterSpacing: "0.1em" }}>
                  UPDATED {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header style={{ borderBottom: `3px solid ${fg}`, padding: "0 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${borderColor}`, fontSize: "11px", letterSpacing: "0.1em", color: mutedColor }}>
          <span style={{ fontFamily: "monospace" }}>
            {time.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </span>
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <button onClick={() => setDarkMode(!darkMode)} style={{ background: "none", border: `1px solid ${borderColor}`, color: mutedColor, cursor: "pointer", padding: "3px 10px", fontSize: "10px", letterSpacing: "0.1em", borderRadius: "2px" }}>
              {darkMode ? "☀ LIGHT" : "◑ DARK"}
            </button>
            <span>EST. 2025</span>
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "28px 0 20px" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(42px, 8vw, 88px)", fontWeight: "900", letterSpacing: "-0.03em", lineHeight: 1, textTransform: "uppercase" }}>
            The Dispatch
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: "11px", letterSpacing: "0.25em", color: mutedColor, textTransform: "uppercase" }}>
            AI-Powered Intelligence Report
          </p>
        </div>

        {/* Search */}
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: "16px" }}>
          <div style={{ display: "flex", gap: "0", maxWidth: "500px", width: "100%" }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search any topic..."
              style={{ flex: 1, border: `1px solid ${borderColor}`, borderRight: "none", padding: "8px 14px", background: cardBg, color: fg, fontSize: "13px", fontFamily: "monospace", outline: "none" }}
            />
            <button
              onClick={handleSearch}
              style={{ background: accent, color: "#fff", border: "none", padding: "8px 20px", cursor: "pointer", fontSize: "11px", letterSpacing: "0.1em", fontWeight: "bold" }}
            >
              SEARCH
            </button>
            {searchActive && (
              <button
                onClick={() => { setSearchActive(false); setSearchQuery(""); fetchStoriesForCategory(activeCategory); }}
                style={{ background: "none", border: `1px solid ${borderColor}`, color: mutedColor, padding: "8px 12px", cursor: "pointer", fontSize: "11px", marginLeft: "4px" }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", gap: "0", borderTop: `1px solid ${borderColor}`, overflowX: "auto" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              style={{
                background: activeCategory === cat && !searchActive ? fg : "none",
                color: activeCategory === cat && !searchActive ? bg : mutedColor,
                border: "none",
                padding: "10px 20px",
                cursor: "pointer",
                fontSize: "11px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                fontWeight: activeCategory === cat ? "bold" : "normal",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {cat}
            </button>
          ))}
        </nav>

        {/* Source Filter Bar */}
        <div style={{ display: "flex", gap: "0", borderTop: `1px solid ${borderColor}`, overflowX: "auto", background: darkMode ? "#111" : "#ede8df" }}>
          {["All", ...NEWS_SOURCES.map((s) => s.short)].map((src) => (
            <button
              key={src}
              onClick={() => handleSourceClick(src)}
              style={{
                background: activeSource === src && !searchActive ? accent : "none",
                color: activeSource === src && !searchActive ? "#fff" : mutedColor,
                border: "none",
                padding: "7px 16px",
                cursor: "pointer",
                fontSize: "10px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: activeSource === src ? "bold" : "normal",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
                fontFamily: "monospace",
              }}
            >
              {src}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 40px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: mutedColor }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px" }}>Gathering Intelligence</div>
            <div style={{ display: "flex", justifyContent: "center", gap: "6px" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: "6px", height: "6px", background: accent, borderRadius: "50%", animation: `pulse 1s ease-in-out ${i * 0.2}s infinite alternate` }} />
              ))}
            </div>
          </div>
        ) : expandedStory ? (
          /* Article View */
          <div>
            <button
              onClick={() => { setExpandedStory(null); setFullArticle(""); }}
              style={{ background: "none", border: "none", color: accent, cursor: "pointer", fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "30px", padding: 0, display: "flex", alignItems: "center", gap: "6px" }}
            >
              ← Back to {searchActive ? "Results" : activeCategory}
            </button>
            <div style={{ maxWidth: "760px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.15em", color: accent, textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                <span>{expandedStory.category} · {expandedStory.time} · {expandedStory.readTime}</span>
                {expandedStory.source && (
                  <span style={{ background: accent, color: "#fff", padding: "2px 8px", borderRadius: "2px", fontSize: "10px", letterSpacing: "0.1em" }}>
                    {expandedStory.source}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: "900", lineHeight: 1.1, margin: "0 0 20px", letterSpacing: "-0.02em" }}>
                {expandedStory.headline}
              </h2>
              <p style={{ fontSize: "18px", color: mutedColor, lineHeight: 1.6, margin: "0 0 30px", fontStyle: "italic", borderLeft: `3px solid ${accent}`, paddingLeft: "16px" }}>
                {expandedStory.summary}
              </p>
              <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: "30px" }}>
                {articleLoading ? (
                  <div style={{ color: mutedColor, fontSize: "13px", letterSpacing: "0.1em" }}>Loading full article...</div>
                ) : (
                  fullArticle.split("\n\n").filter(Boolean).map((para, i) => (
                    <p key={i} style={{ fontSize: "17px", lineHeight: 1.8, margin: "0 0 22px", color: fg }}>
                      {para}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Stories Grid */
          <div>
            {searchActive && (
              <div style={{ marginBottom: "24px", fontSize: "12px", letterSpacing: "0.1em", color: mutedColor, textTransform: "uppercase" }}>
                Results for: <span style={{ color: fg }}>"{searchQuery}"</span>
              </div>
            )}
            {featured && (
              <div
                onClick={() => handleStoryClick(featured)}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", marginBottom: "40px", borderBottom: `2px solid ${fg}`, cursor: "pointer" }}
              >
                {/* Featured text */}
                <div style={{ padding: "0 40px 40px 0", borderRight: `2px solid ${fg}` }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: accent, textTransform: "uppercase", marginBottom: "12px", fontFamily: "monospace" }}>
                    ★ Featured · {featured.category}
                    {featured.source && <span style={{ marginLeft: "8px", background: accent, color: "#fff", padding: "1px 6px", borderRadius: "2px" }}>{featured.source}</span>}
                  </div>
                  <h2 style={{ fontSize: "clamp(24px, 3vw, 42px)", fontWeight: "900", lineHeight: 1.1, margin: "0 0 18px", letterSpacing: "-0.02em" }}>
                    {featured.headline}
                  </h2>
                  <p style={{ fontSize: "16px", lineHeight: 1.7, color: mutedColor, margin: 0 }}>
                    {featured.summary}
                  </p>
                </div>
                {/* Featured meta */}
                <div style={{ padding: "0 0 40px 40px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: "120px", lineHeight: 1, color: borderColor, fontWeight: "900", letterSpacing: "-0.05em", overflow: "hidden", userSelect: "none" }}>
                    {featured.category.substring(0, 2).toUpperCase()}
                  </div>
                  <div style={{ display: "flex", gap: "20px", fontSize: "11px", color: mutedColor, letterSpacing: "0.1em" }}>
                    <span>{featured.time}</span>
                    <span>·</span>
                    <span>{featured.readTime}</span>
                    <span style={{ color: accent, marginLeft: "auto" }}>Read →</span>
                  </div>
                </div>
              </div>
            )}

            {/* Secondary grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1px", background: borderColor }}>
              {secondary.map((story) => (
                <div
                  key={story.id}
                  onClick={() => handleStoryClick(story)}
                  style={{ background: bg, padding: "28px", cursor: "pointer", transition: "background 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = cardBg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = bg)}
                >
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: accent, textTransform: "uppercase", marginBottom: "10px", fontFamily: "monospace", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{story.category}</span>
                    {story.source && <span style={{ background: darkMode ? "#2a2a2a" : "#eee", color: mutedColor, padding: "1px 6px", borderRadius: "2px", fontSize: "9px" }}>{story.source}</span>}
                  </div>
                  <h3 style={{ fontSize: "18px", fontWeight: "700", lineHeight: 1.3, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
                    {story.headline}
                  </h3>
                  <p style={{ fontSize: "13px", lineHeight: 1.6, color: mutedColor, margin: "0 0 16px" }}>
                    {story.summary}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: mutedColor, letterSpacing: "0.08em" }}>
                    <span>{story.time}</span>
                    <span>{story.readTime}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer style={{ borderTop: `2px solid ${fg}`, padding: "24px 40px", marginTop: "40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ fontSize: "18px", fontWeight: "900", letterSpacing: "-0.02em" }}>The Dispatch</span>
          <span style={{ fontSize: "10px", letterSpacing: "0.15em", color: mutedColor, textTransform: "uppercase" }}>
            Powered by Claude · All stories AI-generated
          </span>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "9px", letterSpacing: "0.15em", color: mutedColor, textTransform: "uppercase", marginRight: "4px" }}>Priority Sources:</span>
          {NEWS_SOURCES.map((s) => (
            <span key={s.name} style={{ fontSize: "9px", letterSpacing: "0.08em", color: mutedColor, background: darkMode ? "#1a1a1a" : "#e8e2d8", padding: "2px 8px", borderRadius: "2px", fontFamily: "monospace" }}>
              {s.name}
            </span>
          ))}
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          from { transform: scale(0.8); opacity: 0.4; }
          to { transform: scale(1.2); opacity: 1; }
        }
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #888; border-radius: 2px; }
        button:focus { outline: 2px solid ${accent}; outline-offset: 2px; }
      `}</style>
    </div>
  );
}
