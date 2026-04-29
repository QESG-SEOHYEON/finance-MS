import { useEffect, useMemo, useState } from "react";
import IndicesStrip from "./IndicesStrip.jsx";

const FEED_URL = "https://qesg-seohyeon.github.io/finance-shared-data/news-feed.json";
const CACHE_KEY = "news-feed-cache";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2시간

const R = {
  rose400: "#C08080",
  rose500: "#A66060",
  cream: "#FAF5F3",
  border: "#EDE5E2",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3"
};

const SOURCE_COLOR = {
  "한국경제": "#9B7EC0",
  "매일경제": "#6BAF8D",
  "연합뉴스": "#C08080"
};

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeCache(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), payload })); } catch {}
}

function relativeTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24);
  return `${d}일 전`;
}

function dateKey(iso) {
  if (!iso) return "unknown";
  // KST 기준으로 YYYY-MM-DD 산출 (UTC+9). UTC 자정 직후라도 한국 날짜로 묶임.
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function todayKeyKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateLabel(key) {
  const d = new Date(`${key}T00:00:00+09:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${key.slice(5)} (${weekday})`;
}

const CATEGORY_OPTIONS = ["all", "경제", "증권"];

export default function NewsTab() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState("today"); // "today" | "history"
  const [filterCat, setFilterCat] = useState("all");

  const load = async ({ force = false } = {}) => {
    const cached = readCache();
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setState({ loading: false, error: null, data: cached.payload });
      return;
    }
    try {
      setRefreshing(true);
      const res = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      writeCache(payload);
      setState({ loading: false, error: null, data: payload });
    } catch (e) {
      if (cached) setState({ loading: false, error: "최신 뉴스를 불러오지 못해 캐시를 표시합니다.", data: cached.payload });
      else setState({ loading: false, error: "뉴스를 불러올 수 없습니다.", data: null });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const items = state.data?.items || [];
  const todayKey = todayKeyKST();

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterCat !== "all" && it.category !== filterCat) return false;
      return true;
    });
  }, [items, filterCat]);

  const todayItems = useMemo(
    () => filtered.filter((it) => dateKey(it.publishedAt) === todayKey),
    [filtered, todayKey]
  );

  const groupedByDate = useMemo(() => {
    const groups = {};
    for (const it of filtered) {
      const key = dateKey(it.publishedAt);
      (groups[key] ||= []).push(it);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const updatedAt = state.data?.updatedAt;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <IndicesStrip />

      <div className="card">
        <div className="section-title">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>📰</span>
            경제 뉴스
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: R.cream, borderRadius: 8, padding: 2 }}>
              {[{ k: "today", l: "오늘" }, { k: "history", l: "최근 7일" }].map((v) => (
                <button
                  key={v.k}
                  onClick={() => setView(v.k)}
                  style={{
                    padding: "4px 12px", borderRadius: 6,
                    border: "none", cursor: "pointer",
                    fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    background: view === v.k ? "#fff" : "transparent",
                    color: view === v.k ? R.textDark : R.textMid,
                    boxShadow: view === v.k ? "0 1px 2px rgba(0,0,0,0.08)" : "none"
                  }}
                >{v.l}</button>
              ))}
            </div>
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="btn btn-sm"
              style={{ padding: "0 8px" }}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c === "all" ? "전체" : c}</option>
              ))}
            </select>
            {updatedAt && (
              <span style={{ fontSize: 10, color: R.textLight }}>
                {relativeTime(updatedAt)} 업데이트
              </span>
            )}
            <button
              className="btn btn-sm"
              onClick={() => load({ force: true })}
              disabled={refreshing}
              style={{ padding: "0 10px", fontSize: 11 }}
              title="새로고침"
            >{refreshing ? "..." : "↻"}</button>
          </div>
        </div>

        {state.error && (
          <div style={{
            fontSize: 11, color: R.rose500, background: R.cream,
            padding: "6px 10px", borderRadius: 8, marginBottom: 10
          }}>{state.error}</div>
        )}

        {state.loading && !state.data ? (
          <div style={{ fontSize: 13, color: R.textLight, padding: "32px 0", textAlign: "center" }}>
            뉴스 불러오는 중…
          </div>
        ) : view === "today" ? (
          <NewsList items={todayItems} emptyText="오늘 올라온 뉴스가 아직 없습니다." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {groupedByDate.length === 0 && (
              <div style={{ fontSize: 13, color: R.textLight, padding: "32px 0", textAlign: "center" }}>
                표시할 기록이 없습니다.
              </div>
            )}
            {groupedByDate.map(([date, list]) => (
              <div key={date}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: R.textMid,
                  marginBottom: 8, display: "flex", gap: 8, alignItems: "baseline"
                }}>
                  {dateLabel(date)}
                  <span style={{ fontSize: 10, color: R.textLight, fontWeight: 500 }}>
                    · {list.length}건
                  </span>
                </div>
                <NewsList items={list} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewsList({ items, emptyText }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ fontSize: 13, color: R.textLight, padding: "24px 0", textAlign: "center" }}>
        {emptyText || "표시할 기사가 없습니다."}
      </div>
    );
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => {
        const srcColor = SOURCE_COLOR[it.source] || R.rose400;
        return (
          <li key={i}>
            <a
              href={it.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block", padding: "10px 12px", borderRadius: 10,
                background: "#fff", border: `1px solid ${R.border}`,
                textDecoration: "none", color: "inherit",
                transition: "all 0.15s"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = srcColor; e.currentTarget.style.background = R.cream; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = R.border; e.currentTarget.style.background = "#fff"; }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: "#fff",
                  background: srcColor, padding: "2px 6px", borderRadius: 4
                }}>{it.source}</span>
                {it.category && (
                  <span style={{ fontSize: 10, color: R.textLight }}>{it.category}</span>
                )}
                <span style={{ fontSize: 10, color: R.textLight, marginLeft: "auto" }}>
                  {relativeTime(it.publishedAt)}
                </span>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: R.textDark, lineHeight: 1.35,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                overflow: "hidden"
              }}>
                {it.title}
              </div>
              {it.summary && (
                <div style={{
                  fontSize: 11, color: R.textMid, marginTop: 4, lineHeight: 1.4,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden"
                }}>
                  {it.summary}
                </div>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
