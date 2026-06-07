import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getNetWorth, setNetWorth,
  getInitialLiquid, setInitialLiquid,
  db
} from "../db.js";
import { computeNetWorth } from "../lib/netWorth.js";
import { fmt, fmtWon } from "../schedule.js";
import MoneyInput from "./MoneyInput.jsx";
import NetWorthBreakdownModal from "./NetWorthBreakdownModal.jsx";
import AssetTypeGuideModal, { AssetTypeHelpButton } from "./AssetTypeGuide.jsx";

const R = {
  rose300: "#D4A0A0", rose400: "#C08080", rose500: "#A66060",
  mint: "#6BAF8D", lavender: "#9B7EC0",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", border: "#EDE5E2"
};

export default function NetWorthCard({ profile, allCategories, tasks, monthsToGoal }) {
  // 베이스라인 — 사용자가 한 번 설정해두는 시작점
  const [initialNW, setInitialNWState] = useState(profile.currentNetWorth || 0);
  const [initialLiquid, setIL] = useState(0);

  // 베이스라인 편집 상태
  const [editBaseline, setEditBaseline] = useState(null); // null | 'nw' | 'liquid'
  const [draft, setDraft] = useState("");

  const [tab, setTab] = useState("total");   // 'total' | 'liquid' | 'locked'
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    (async () => {
      setInitialNWState(await getNetWorth() || profile.currentNetWorth || 0);
      setIL(await getInitialLiquid());
    })();
  }, [profile.currentNetWorth]);

  // 모든 거래 합산해서 컴퓨티드 값
  const expensesAll = useLiveQuery(() => db.expenses.toArray(), [], []);
  const monthlyAll = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const [computed, setComputed] = useState({ total: 0, liquid: 0, locked: 0, breakdown: {} });

  useEffect(() => {
    computeNetWorth({
      initialNW,
      initialLiquid,
      categories: allCategories,
      tasks
    }).then(setComputed);
  }, [initialNW, initialLiquid, allCategories, tasks, expensesAll, monthlyAll]);

  const total = computed.total;
  const liquid = computed.liquid;
  const locked = computed.locked;

  const nwPct = Math.min(100, (total / Math.max(1, profile.goalAmount)) * 100);
  const remaining = Math.max(0, profile.goalAmount - total);

  const saveBaseline = async () => {
    if (draft === "" || Number.isNaN(Number(draft))) {
      setEditBaseline(null);
      return;
    }
    const n = Number(draft);
    if (editBaseline === "nw") {
      await setNetWorth(n);
      setInitialNWState(n);
    } else if (editBaseline === "liquid") {
      await setInitialLiquid(n);
      setIL(n);
    }
    setEditBaseline(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 상단: 현재 순자산 (자동 계산) + 목표 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: R.textLight, marginBottom: 2 }}>현재 순자산</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: R.textDark, lineHeight: 1.2 }}>
            {fmtWon(total)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <button
              onClick={() => setShowBreakdown(true)}
              style={{
                padding: "2px 8px", borderRadius: 6,
                background: "transparent", border: `1px solid ${R.border}`,
                color: R.textMid, fontSize: 10, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit"
              }}
              title="어떻게 계산됐는지 거래 내역 확인"
            >📊 산출 내역 자세히보기</button>
            <AssetTypeHelpButton onClick={() => setShowGuide(true)} />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: R.textLight }}>목표까지</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: R.rose500 }}>{fmt(remaining)}</div>
          <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>
            {monthsToGoal}개월 · 월 {fmt(Math.ceil(remaining / Math.max(1, monthsToGoal)))}
          </div>
        </div>
      </div>

      {/* 진행 바 */}
      <div>
        <div className="progress-track" style={{ height: 8 }}>
          <div className="progress-fill" style={{ width: `${nwPct}%`, background: `linear-gradient(90deg, ${R.rose400}, ${R.mint})` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: R.textLight, marginTop: 4 }}>
          <span>0</span>
          <span>{nwPct.toFixed(1)}% 달성</span>
          <span>{fmt(profile.goalAmount)}</span>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${R.border}`, marginTop: 4 }}>
        {[
          { key: "total",  label: "요약" },
          { key: "liquid", label: "💰 현금" },
          { key: "locked", label: "📈 투자" }
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: "6px 4px",
              border: "none",
              borderBottom: tab === t.key ? `2px solid ${R.rose400}` : "2px solid transparent",
              background: "transparent",
              color: tab === t.key ? R.rose500 : R.textLight,
              fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
              cursor: "pointer", fontFamily: "inherit"
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* 탭 본문 */}
      <div style={{ minHeight: 100 }}>
        {tab === "total" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 0", gap: 8 }}>
              <Stat label="💰 현금" value={liquid} color={R.mint} />
              <Stat label="📈 투자" value={locked} color={R.lavender} />
            </div>
            <div style={{
              fontSize: 11, color: R.textMid, lineHeight: 1.6,
              padding: "8px 10px", marginTop: 4, borderRadius: 8,
              background: "#FFFAF5", border: `1px solid ${R.border}`
            }}>
              현재 가진 자산을 <strong>지금 쓸 수 있는 돈(현금)</strong> 과 <strong>당장은 못 빼지만 늘어나는 돈(투자)</strong> 로 나눠봤어요.<br />
              아래 초기값에 거래(수입·지출·적립 등)를 합산해서 자동으로 계산돼요.
            </div>
            <BaselineRow
              label="초기 순자산"
              value={initialNW}
              onEdit={() => { setDraft(String(initialNW)); setEditBaseline("nw"); }}
              editing={editBaseline === "nw"}
              draft={draft}
              setDraft={setDraft}
              onSave={saveBaseline}
              onCancel={() => setEditBaseline(null)}
            />
            <BaselineRow
              label="초기 현금"
              value={initialLiquid}
              onEdit={() => { setDraft(String(initialLiquid)); setEditBaseline("liquid"); }}
              editing={editBaseline === "liquid"}
              draft={draft}
              setDraft={setDraft}
              onSave={saveBaseline}
              onCancel={() => setEditBaseline(null)}
            />
          </>
        )}
        {tab === "liquid" && (
          <div style={{ padding: "8px 4px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: R.mint }}>{fmtWon(liquid)}</div>
            <div style={{
              fontSize: 11, color: R.textMid, lineHeight: 1.6, marginTop: 8,
              padding: "8px 10px", borderRadius: 8,
              background: "#F4FAF6", border: `1px solid ${R.border}`
            }}>
              <strong>지금 바로 쓸 수 있는 돈</strong> — 통장·체크카드·비상금처럼 즉시 인출 가능한 자산이에요.<br />
              월급 들어오면 <span style={{ color: R.mint, fontWeight: 700 }}>+</span>, 식비·여가 같은 지출이면 <span style={{ color: R.rose500, fontWeight: 700 }}>−</span>,
              적금/투자로 옮기면 현금에선 <span style={{ color: R.rose500, fontWeight: 700 }}>−</span> 되고 투자 쪽으로 <span style={{ color: R.mint, fontWeight: 700 }}>+</span> 돼요.<br />
              <span style={{ color: R.textLight, fontSize: 10 }}>
                = 초기 현금 + (수입·유동 자산 적립 거래의 합) − (지출 거래의 합)
              </span>
            </div>
            <BaselineRow
              label="초기 현금"
              value={initialLiquid}
              onEdit={() => { setDraft(String(initialLiquid)); setEditBaseline("liquid"); }}
              editing={editBaseline === "liquid"}
              draft={draft}
              setDraft={setDraft}
              onSave={saveBaseline}
              onCancel={() => setEditBaseline(null)}
            />
          </div>
        )}
        {tab === "locked" && (
          <div style={{ padding: "8px 4px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: R.lavender }}>{fmtWon(locked)}</div>
            <div style={{
              fontSize: 11, color: R.textMid, lineHeight: 1.6, marginTop: 8,
              padding: "8px 10px", borderRadius: 8,
              background: "#F8F4FA", border: `1px solid ${R.border}`
            }}>
              <strong>지금 빼긴 어렵지만 자라고 있는 돈</strong> — 주식·ETF·적금·전세금처럼 묶여있는 자산이에요.<br />
              ETF/적금 적립하면 여기로 <span style={{ color: R.lavender, fontWeight: 700 }}>+</span>, 대출 갚으면 부채가 줄어서 결과적으로 <span style={{ color: R.lavender, fontWeight: 700 }}>+</span> 효과.<br />
              <span style={{ color: R.textLight, fontSize: 10 }}>
                = 총 자산 − 현금
              </span>
            </div>
          </div>
        )}
      </div>
      {showBreakdown && (
        <NetWorthBreakdownModal
          allCategories={allCategories}
          tasks={tasks}
          onClose={() => setShowBreakdown(false)}
        />
      )}
      {showGuide && <AssetTypeGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: R.textLight }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>{fmtWon(value)}</div>
    </div>
  );
}

function BaselineRow({ label, value, onEdit, editing, draft, setDraft, onSave, onCancel }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 8px", marginTop: 6, borderRadius: 8,
      background: R.cream, fontSize: 11
    }}>
      <span style={{ color: R.textMid, fontWeight: 600 }}>{label}</span>
      {editing ? (
        <>
          <MoneyInput
            type="text" 
            className="modal-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            style={{ flex: 1, padding: "4px 8px", fontSize: 12 }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={onSave}>저장</button>
          <button className="btn btn-sm" onClick={onCancel}>취소</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: R.textDark, fontWeight: 700 }}>{fmt(value)}</span>
          <button
            onClick={onEdit}
            style={{ background: "none", border: "none", color: R.textLight, fontSize: 11, cursor: "pointer", padding: "2px 4px" }}
            title="수정"
          >✏️</button>
        </>
      )}
    </div>
  );
}
