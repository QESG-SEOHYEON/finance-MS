import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";

const FEED_URL = "https://qesg-seohyeon.github.io/finance-shared-data/indices.json";
const CACHE_KEY = "indices-cache";
const CACHE_TTL_MS = 30 * 60 * 1000;

const R = {
  mint: "#6BAF8D",
  rose400: "#C08080",
  lavender: "#9B7EC0",
  cream: "#FAF5F3",
  border: "#EDE5E2",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  up: "#C06060",
  down: "#4A8FC0"
};

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), payload }));
  } catch {}
}

function fmtNum(n, currency) {
  if (n == null) return "—";
  if (currency === "KRW") return Math.round(n).toLocaleString("ko-KR");
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function IndicesStrip() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const cached = readCache();
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setData(cached.payload);
    }
    (async () => {
      try {
        const res = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        writeCache(payload);
        setData(payload);
      } catch {}
    })();
  }, []);

  if (!data) {
    return (
      <div className="card" style={{ padding: 16, color: R.textLight, fontSize: 12, textAlign: "center" }}>
        지수 불러오는 중…
      </div>
    );
  }

  const indices = data.indices || [];
  if (indices.length === 0) {
    return (
      <div className="card" style={{ padding: 16, color: R.textLight, fontSize: 12, textAlign: "center" }}>
        지수 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${indices.length}, 1fr)`,
        gap: 12
      }}>
        {indices.map((idx) => {
          const up = (idx.dayChangePct || 0) >= 0;
          const lineColor = up ? R.up : R.down;
          return (
            <div
              key={idx.symbol}
              style={{
                padding: 12, borderRadius: 10, background: R.cream,
                border: `1px solid ${R.border}`,
                display: "flex", flexDirection: "column", gap: 6
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: R.textMid }}>
                  {idx.short}
                </div>
                <div style={{ fontSize: 10, color: R.textLight }}>
                  {idx.currency}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: R.textDark, letterSpacing: -0.5 }}>
                {fmtNum(idx.current, idx.currency)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: lineColor }}>
                  {up ? "▲" : "▼"} {fmtNum(Math.abs(idx.dayChange || 0), idx.currency)}
                  <span style={{ marginLeft: 4 }}>
                    ({up ? "+" : ""}{idx.dayChangePct?.toFixed(2)}%)
                  </span>
                </div>
                <div style={{ fontSize: 10, color: R.textLight }}>
                  1M {idx.monthChangePct > 0 ? "+" : ""}{idx.monthChangePct?.toFixed(1)}%
                </div>
              </div>
              <div style={{ height: 32, marginTop: 2 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={idx.candles} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                    <YAxis domain={["dataMin", "dataMax"]} hide />
                    <Line
                      dataKey="close"
                      stroke={lineColor}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
