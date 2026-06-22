import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { computeNetWorth, entryBucketDeltas } from "../lib/netWorth.js";
import { fmt } from "../schedule.js";
import AssetTypeGuideModal, { AssetTypeHelpButton } from "./AssetTypeGuide.jsx";

const R = {
  rose300: "#D4A0A0", rose400: "#C08080", rose500: "#A66060",
  mint: "#6BAF8D", lavender: "#9B7EC0", warn: "#C06060",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", border: "#EDE5E2"
};

// 버킷별 메타 (필터 탭 + 색)
const BUCKETS = [
  { key: "total",    label: "전체(순자산)", color: R.textDark, base: "nw" },
  { key: "liquid",   label: "💰 현금",      color: R.mint,     base: "liquid" },
  { key: "invested", label: "📈 투자",      color: R.lavender, base: "invested" },
  { key: "debt",     label: "💳 부채",      color: R.warn,     base: "debt" }
];

export default function NetWorthBreakdownModal({ allCategories, tasks, initialNW, initialLiquid, initialDebt, onClose }) {
  const [res, setRes] = useState(null);
  const [bucket, setBucket] = useState("total");
  const [view, setView] = useState("category"); // 'category' | 'date'
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    computeNetWorth({ initialNW, initialLiquid, initialDebt, categories: allCategories, tasks })
      .then(setRes);
  }, [allCategories, tasks, initialNW, initialLiquid, initialDebt]);

  if (!res) return null;

  const bMeta = BUCKETS.find((b) => b.key === bucket);
  // 버킷별 거래 delta
  const deltaOf = (e) => entryBucketDeltas(e)[bucket];
  // 해당 버킷에 영향 있는 거래만
  const relevant = res.entries.filter((e) => deltaOf(e) !== 0);

  const baseValue = bucket === "total" ? res.initialNW
    : bucket === "liquid" ? res.initialLiquid
    : bucket === "debt" ? res.initialDebt
    : (res.initialNW - res.initialLiquid + res.initialDebt); // invested baseline
  const bucketDeltaSum = relevant.reduce((s, e) => s + deltaOf(e), 0);
  const bucketFinal = bucket === "total" ? res.total
    : bucket === "liquid" ? res.liquid
    : bucket === "debt" ? res.debt
    : res.invested;

  // 카테고리 그룹
  const groups = {};
  for (const e of relevant) {
    const k = e.category || e.impactKey || "(없음)";
    if (!groups[k]) groups[k] = { entries: [], sum: 0, label: e.categoryLabel, impactLabel: e.impactLabel };
    groups[k].entries.push(e);
    groups[k].sum += deltaOf(e);
  }

  // 날짜 정렬 (최신순)
  const byDate = [...relevant].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 950 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: "85vh", overflow: "auto" }}>
        <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>📊 순자산 산출 내역</span>
          <AssetTypeHelpButton onClick={() => setShowGuide(true)} />
        </div>
        <div className="modal-sub">버킷을 골라 어떤 거래가 어떻게 합산됐는지 확인하세요.</div>

        {/* 버킷 필터 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
          {BUCKETS.map((b) => (
            <button key={b.key} onClick={() => setBucket(b.key)} style={{
              flex: 1, minWidth: 80, padding: "6px 8px", borderRadius: 8,
              background: bucket === b.key ? b.color : "#fff",
              color: bucket === b.key ? "#fff" : R.textMid,
              border: `1px solid ${bucket === b.key ? b.color : R.border}`,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
            }}>{b.label}</button>
          ))}
        </div>

        {/* 합계 박스 */}
        <div style={{
          padding: "10px 12px", borderRadius: 10, background: R.cream,
          border: `1px solid ${R.border}`, marginBottom: 10, fontSize: 12
        }}>
          <Row label={bucket === "total" ? "초기 순자산" : bucket === "liquid" ? "초기 현금" : bucket === "debt" ? "초기 부채" : "초기 투자"} value={baseValue} />
          <Row label="+ 거래 합산" value={bucketDeltaSum} colored />
          <div style={{ borderTop: `1px solid ${R.border}`, margin: "6px 0" }} />
          <Row label={`= 현재 ${bMeta.label.replace(/^[^\s]+\s/, "")}`} value={bucketFinal} bold />
        </div>

        {/* 뷰 토글 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {[{ v: "category", label: "🏷 카테고리별" }, { v: "date", label: "📅 날짜별" }].map((t) => (
            <button key={t.v} onClick={() => setView(t.v)} style={tabBtn(view === t.v)}>{t.label}</button>
          ))}
        </div>

        {relevant.length === 0 && (
          <div style={{ fontSize: 12, color: R.textLight, padding: 16, textAlign: "center" }}>
            이 버킷에 영향을 준 거래가 아직 없어요.
          </div>
        )}

        {view === "category" && relevant.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.keys(groups).sort((a, b) => Math.abs(groups[b].sum) - Math.abs(groups[a].sum)).map((k) => (
              <CategoryGroup key={k} g={groups[k]} deltaOf={deltaOf} />
            ))}
          </div>
        )}

        {view === "date" && relevant.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {byDate.map((e, i) => <DateRow key={i} e={e} delta={deltaOf(e)} />)}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>닫기</button>
        </div>
        {showGuide && <AssetTypeGuideModal onClose={() => setShowGuide(false)} />}
      </div>
    </div>,
    document.body
  );
}

function Row({ label, value, bold, colored }) {
  const color = colored ? (value > 0 ? R.mint : value < 0 ? R.rose500 : R.textMid) : R.textDark;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ color: R.textMid, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 800 : 600 }}>
        {value > 0 && colored ? "+" : ""}{fmt(value)} 원
      </span>
    </div>
  );
}

function CategoryGroup({ g, deltaOf }) {
  const [open, setOpen] = useState(false);
  const sign = g.sum > 0 ? "+" : "";
  const color = g.sum > 0 ? R.mint : g.sum < 0 ? R.rose500 : R.textMid;
  return (
    <div style={{ border: `1px solid ${R.border}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", padding: "10px 12px", display: "flex",
        justifyContent: "space-between", alignItems: "center",
        background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left"
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{g.label}</div>
          <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>{g.impactLabel} · {g.entries.length}건</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>{sign}{fmt(g.sum)}원</span>
          <span style={{ fontSize: 10, color: R.textLight }}>{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div style={{ background: R.cream, padding: "6px 12px 10px" }}>
          {g.entries.map((e, i) => {
            const d = deltaOf(e);
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, color: R.textMid,
                borderBottom: i < g.entries.length - 1 ? `1px solid ${R.border}` : "none"
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: R.textLight }}>{e.date}</span>
                  <span style={{ marginLeft: 8 }}>{e.label}</span>
                </span>
                <span style={{ fontWeight: 600, color: d > 0 ? R.mint : d < 0 ? R.rose500 : R.textMid }}>
                  {d > 0 ? "+" : ""}{fmt(d)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DateRow({ e, delta }) {
  const color = delta > 0 ? R.mint : delta < 0 ? R.rose500 : R.textMid;
  return (
    <div style={{
      display: "flex", gap: 8, padding: "6px 10px", borderRadius: 8,
      background: "#fff", border: `1px solid ${R.border}`, fontSize: 11
    }}>
      <span style={{ color: R.textLight, minWidth: 78 }}>{e.date}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: R.textDark, fontWeight: 600 }}>{e.label}</div>
        <div style={{ color: R.textLight, fontSize: 10, marginTop: 1 }}>{e.categoryLabel} · {e.impactLabel}</div>
      </span>
      <span style={{ fontWeight: 700, color, alignSelf: "center" }}>{delta > 0 ? "+" : ""}{fmt(delta)}</span>
    </div>
  );
}

function tabBtn(active) {
  return {
    flex: 1, padding: "6px 8px", borderRadius: 8,
    background: active ? R.rose400 : "#fff",
    color: active ? "#fff" : R.textMid,
    border: `1px solid ${active ? R.rose400 : R.border}`,
    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
  };
}
