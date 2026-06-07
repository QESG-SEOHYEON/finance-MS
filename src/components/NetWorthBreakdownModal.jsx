import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { db, getInitialLiquid, getNetWorth } from "../db.js";
import { CAT_IMPACT_META, TASK_TYPE_META, getNwImpact } from "../lib/netWorth.js";
import { fmt } from "../schedule.js";
import AssetTypeGuideModal, { AssetTypeHelpButton } from "./AssetTypeGuide.jsx";

const R = {
  rose400: "#C08080", rose500: "#A66060",
  mint: "#6BAF8D", lavender: "#9B7EC0",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", border: "#EDE5E2"
};

export default function NetWorthBreakdownModal({ allCategories, tasks, onClose }) {
  const [data, setData] = useState({ entries: [], baselines: { nw: 0, liquid: 0 } });
  const [view, setView] = useState("category"); // 'category' | 'date'
  const [dateMode, setDateMode] = useState("daily"); // 'daily' | 'monthly' | 'range'
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    (async () => {
      const [expensesAll, monthlyAll, baseNW, baseLiquid] = await Promise.all([
        db.expenses.toArray(),
        db.monthly_status.toArray(),
        getNetWorth(),
        getInitialLiquid()
      ]);

      const catImpactByKey = {};
      for (const c of allCategories || []) catImpactByKey[c.key] = c.nwImpact || "expense";

      const entries = [];

      // 1) expenses
      for (const e of expensesAll) {
        const impactKey = catImpactByKey[e.category] || "expense";
        const meta = CAT_IMPACT_META[impactKey];
        if (!meta) continue;
        const amt = Number(e.amount) || 0;
        entries.push({
          date: e.date,
          category: e.category,
          categoryLabel: (allCategories.find((c) => c.key === e.category)?.label) || e.category || "(없음)",
          label: e.memo || e.subcategory || "지출",
          amount: amt,
          sign: meta.sign,
          delta: amt * meta.sign,
          impactKey,
          impactLabel: meta.label,
          liquid: meta.liquid,
          source: "expense"
        });
      }

      // 2) monthly_status actualAmounts (캘린더 task)
      for (const m of monthlyAll) {
        const actuals = m.actualAmounts || {};
        for (const taskId in actuals) {
          const task = (tasks || []).find((t) => t.id === taskId);
          if (!task) continue;
          let meta, impactKey, impactLabel;
          const catImpactKey = task.category ? catImpactByKey[task.category] : null;
          if (catImpactKey) {
            meta = CAT_IMPACT_META[catImpactKey];
            impactKey = catImpactKey;
            impactLabel = meta?.label;
          } else {
            meta = TASK_TYPE_META[task.type];
            impactKey = `(task:${task.type})`;
            impactLabel = task.type === "income" ? "수입(task)"
              : task.type === "debt" ? "부채↓(task)"
              : task.type === "invest" ? "투자(task)"
              : task.type === "fixed" ? "고정지출(task)" : "일반(task)";
          }
          if (!meta) continue;
          const amt = Math.abs(Number(actuals[taskId]) || 0);
          entries.push({
            date: m.id ? m.id + "-??" : "",  // monthly_status id = "YYYY-M"
            category: task.category,
            categoryLabel: (allCategories.find((c) => c.key === task.category)?.label) || (task.category || "(없음)"),
            label: task.label,
            amount: amt,
            sign: meta.sign,
            delta: amt * meta.sign,
            impactKey,
            impactLabel,
            liquid: meta.liquid,
            source: "task"
          });
        }
      }

      // 날짜 정렬
      entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));

      setData({ entries, baselines: { nw: baseNW || 0, liquid: baseLiquid || 0 } });
    })();
  }, [allCategories, tasks]);

  // 카테고리별 그룹
  const groupedByCat = {};
  for (const e of data.entries) {
    const k = e.category || "(없음)";
    if (!groupedByCat[k]) {
      groupedByCat[k] = { entries: [], sum: 0, label: e.categoryLabel, impactLabel: e.impactLabel, impactKey: e.impactKey };
    }
    groupedByCat[k].entries.push(e);
    groupedByCat[k].sum += e.delta;
  }

  const totalDelta = data.entries.reduce((s, e) => s + e.delta, 0);
  const finalNW = data.baselines.nw + totalDelta;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 950 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: "85vh", overflow: "auto" }}>
        <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>📊 순자산 산출 내역</span>
          <AssetTypeHelpButton onClick={() => setShowGuide(true)} />
        </div>
        <div className="modal-sub">
          {data.entries.length}건의 거래가 어떻게 합산됐는지 확인할 수 있어요.
        </div>

        {/* 베이스라인 + 합계 */}
        <div style={{
          padding: "10px 12px", borderRadius: 10, background: R.cream,
          border: `1px solid ${R.border}`, marginBottom: 10, fontSize: 12
        }}>
          <Row label="초기 순자산" value={data.baselines.nw} />
          <Row label="+ 거래 합산" value={totalDelta} colored />
          <div style={{ borderTop: `1px solid ${R.border}`, margin: "6px 0" }} />
          <Row label="= 현재 순자산" value={finalNW} bold />
        </div>

        {/* 뷰 토글 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {[
            { v: "category", label: "🏷 카테고리별" },
            { v: "date",     label: "📅 날짜별" }
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setView(t.v)}
              style={tabBtn(view === t.v)}
            >{t.label}</button>
          ))}
        </div>

        {view === "category" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.keys(groupedByCat).sort((a, b) => Math.abs(groupedByCat[b].sum) - Math.abs(groupedByCat[a].sum)).map((k) => {
              const g = groupedByCat[k];
              return <CategoryGroup key={k} g={g} />;
            })}
            {data.entries.length === 0 && (
              <div style={{ fontSize: 12, color: R.textLight, padding: 12, textAlign: "center" }}>
                아직 합산할 거래가 없어요.
              </div>
            )}
          </div>
        )}

        {view === "date" && (
          <>
            {/* 날짜 하위 모드 토글 */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[
                { v: "daily",   label: "일별" },
                { v: "monthly", label: "월별" },
                { v: "range",   label: "기간별 조회" }
              ].map((t) => (
                <button key={t.v} onClick={() => setDateMode(t.v)} style={miniTabBtn(dateMode === t.v)}>
                  {t.label}
                </button>
              ))}
            </div>

            {dateMode === "range" && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="date"
                    className="modal-input"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <span style={{ fontSize: 11, color: R.textLight }}>~</span>
                  <input
                    type="date"
                    className="modal-input"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                </div>
                {(!dateFrom || !dateTo) && (
                  <div style={{ fontSize: 10, color: R.textLight, marginTop: 4 }}>
                    시작일과 종료일을 골라서 기간 내 거래만 확인하세요.
                  </div>
                )}
              </div>
            )}

            <DateView entries={data.entries} mode={dateMode} dateFrom={dateFrom} dateTo={dateTo} />
          </>
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
  const color = colored
    ? (value > 0 ? R.mint : value < 0 ? R.rose500 : R.textMid)
    : R.textDark;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ color: R.textMid, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 800 : 600 }}>
        {value > 0 && colored ? "+" : ""}{fmt(value)} 원
      </span>
    </div>
  );
}

function CategoryGroup({ g }) {
  const [open, setOpen] = useState(false);
  const sign = g.sum > 0 ? "+" : "";
  const color = g.sum > 0 ? R.mint : g.sum < 0 ? R.rose500 : R.textMid;
  return (
    <div style={{ border: `1px solid ${R.border}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "10px 12px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left"
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{g.label}</div>
          <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>
            {g.impactLabel} · {g.entries.length}건
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>
            {sign}{fmt(g.sum)}원
          </span>
          <span style={{ fontSize: 10, color: R.textLight }}>{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div style={{ background: R.cream, padding: "6px 12px 10px" }}>
          {g.entries.map((e, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", padding: "4px 0",
              fontSize: 11, color: R.textMid,
              borderBottom: i < g.entries.length - 1 ? `1px solid ${R.border}` : "none"
            }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: R.textLight }}>{e.date}</span>
                <span style={{ marginLeft: 8 }}>{e.label}</span>
              </span>
              <span style={{ fontWeight: 600, color: e.delta > 0 ? R.mint : e.delta < 0 ? R.rose500 : R.textMid }}>
                {e.delta > 0 ? "+" : ""}{fmt(e.delta)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DateRow({ e }) {
  const color = e.delta > 0 ? R.mint : e.delta < 0 ? R.rose500 : R.textMid;
  return (
    <div style={{
      display: "flex", gap: 8, padding: "6px 10px",
      borderRadius: 8, background: "#fff", border: `1px solid ${R.border}`,
      fontSize: 11
    }}>
      <span style={{ color: R.textLight, minWidth: 78 }}>{e.date}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: R.textDark, fontWeight: 600 }}>{e.label}</div>
        <div style={{ color: R.textLight, fontSize: 10, marginTop: 1 }}>
          {e.categoryLabel} · {e.impactLabel}
        </div>
      </span>
      <span style={{ fontWeight: 700, color, alignSelf: "center" }}>
        {e.delta > 0 ? "+" : ""}{fmt(e.delta)}
      </span>
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

function miniTabBtn(active) {
  return {
    flex: 1, padding: "4px 6px", borderRadius: 6,
    background: active ? R.cream : "#fff",
    color: active ? R.rose500 : R.textLight,
    border: `1px solid ${active ? R.rose300 || "#D4A0A0" : R.border}`,
    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
  };
}

function DateView({ entries, mode, dateFrom, dateTo }) {
  // monthly: 월(YYYY-MM)별 그룹 + 합계
  if (mode === "monthly") {
    const byMonth = {};
    for (const e of entries) {
      const m = (e.date || "").slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { entries: [], sum: 0 };
      byMonth[m].entries.push(e);
      byMonth[m].sum += e.delta;
    }
    const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    if (!months.length) return <Empty />;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {months.map((m) => (
          <MonthGroup key={m} month={m} g={byMonth[m]} />
        ))}
      </div>
    );
  }

  // range: 시작일 ~ 종료일 사이 필터
  if (mode === "range") {
    if (!dateFrom || !dateTo) return null;
    const fromKey = dateFrom <= dateTo ? dateFrom : dateTo;
    const toKey   = dateFrom <= dateTo ? dateTo   : dateFrom;
    const filtered = entries.filter((e) => {
      const d = String(e.date).slice(0, 10);
      return d >= fromKey && d <= toKey;
    });
    if (!filtered.length) return (
      <div style={{ fontSize: 12, color: R.textLight, padding: 12, textAlign: "center" }}>
        {fromKey} ~ {toKey} 거래가 없어요.
      </div>
    );
    const sum = filtered.reduce((s, e) => s + e.delta, 0);
    return (
      <>
        <div style={{
          padding: "8px 10px", borderRadius: 8,
          background: R.cream, border: `1px solid ${R.border}`, marginBottom: 6,
          fontSize: 11, display: "flex", justifyContent: "space-between"
        }}>
          <span style={{ color: R.textMid }}>{fromKey} ~ {toKey} · {filtered.length}건</span>
          <span style={{ color: sum > 0 ? R.mint : sum < 0 ? R.rose500 : R.textMid, fontWeight: 700 }}>
            {sum > 0 ? "+" : ""}{fmt(sum)}원
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((e, i) => <DateRow key={i} e={e} />)}
        </div>
      </>
    );
  }

  // daily: 날짜(YYYY-MM-DD)별 그룹
  const byDay = {};
  for (const e of entries) {
    const d = String(e.date).slice(0, 10);
    if (!byDay[d]) byDay[d] = { entries: [], sum: 0 };
    byDay[d].entries.push(e);
    byDay[d].sum += e.delta;
  }
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
  if (!days.length) return <Empty />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {days.map((d) => (
        <div key={d}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "4px 8px", marginBottom: 4,
            fontSize: 11, color: R.textMid, fontWeight: 700
          }}>
            <span>{d}</span>
            <span style={{ color: byDay[d].sum > 0 ? R.mint : byDay[d].sum < 0 ? R.rose500 : R.textMid }}>
              {byDay[d].sum > 0 ? "+" : ""}{fmt(byDay[d].sum)}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {byDay[d].entries.map((e, i) => <DateRow key={i} e={e} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthGroup({ month, g }) {
  const [open, setOpen] = useState(false);
  const sign = g.sum > 0 ? "+" : "";
  const color = g.sum > 0 ? R.mint : g.sum < 0 ? R.rose500 : R.textMid;
  return (
    <div style={{ border: `1px solid ${R.border}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "10px 12px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left"
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{month}</div>
          <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>{g.entries.length}건</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>
            {sign}{fmt(g.sum)}원
          </span>
          <span style={{ fontSize: 10, color: R.textLight }}>{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div style={{ background: R.cream, padding: "6px 12px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {g.entries.map((e, i) => <DateRow key={i} e={e} />)}
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div style={{ fontSize: 12, color: R.textLight, padding: 12, textAlign: "center" }}>
      아직 합산할 거래가 없어요.
    </div>
  );
}
