import { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getNetWorth, setNetWorth,
  getInitialLiquid, setInitialLiquid,
  getUserProfile,
  db
} from "../db.js";
import { computeNetWorth } from "../lib/netWorth.js";
import { computeDebtBalances } from "../lib/debt.js";
import { fmt, fmtWon } from "../schedule.js";
import MoneyInput from "./MoneyInput.jsx";
import NetWorthBreakdownModal from "./NetWorthBreakdownModal.jsx";
import DebtManagerModal from "./DebtManagerModal.jsx";
import AssetTypeGuideModal, { AssetTypeHelpButton } from "./AssetTypeGuide.jsx";

const R = {
  rose300: "#D4A0A0", rose400: "#C08080", rose500: "#A66060",
  mint: "#6BAF8D", lavender: "#9B7EC0", warn: "#C06060",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", border: "#EDE5E2"
};

export default function NetWorthCard({ profile, allCategories, tasks, monthsToGoal }) {
  // 부채 데이터는 프로필 debtItems (라이브). 초기 부채 = Σ 총액 (자동).
  const liveProfile = useLiveQuery(() => getUserProfile(), [], null);
  const debtItems = liveProfile?.debtItems || profile?.debtItems || [];
  const initialDebt = debtItems.reduce((s, d) => s + (Number(d.total) || 0), 0);

  // 베이스라인
  const [initialNW, setInitialNWState] = useState(profile.currentNetWorth || 0);
  const [initialLiquid, setIL] = useState(0);

  const [editBaseline, setEditBaseline] = useState(null); // null | 'nw' | 'liquid'
  const [draft, setDraft] = useState("");

  const [tab, setTab] = useState("total");   // 'total' | 'liquid' | 'invested' | 'debt'
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showDebt, setShowDebt] = useState(false);

  useEffect(() => {
    (async () => {
      setInitialNWState(await getNetWorth() || profile.currentNetWorth || 0);
      setIL(await getInitialLiquid());
    })();
  }, [profile.currentNetWorth]);

  const expensesAll = useLiveQuery(() => db.expenses.toArray(), [], []);
  const monthlyAll = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const [computed, setComputed] = useState({ total: 0, liquid: 0, invested: 0, debt: 0 });

  useEffect(() => {
    computeNetWorth({
      initialNW, initialLiquid, initialDebt,
      categories: allCategories, tasks
    }).then(setComputed);
  }, [initialNW, initialLiquid, initialDebt, allCategories, tasks, expensesAll, monthlyAll]);

  // 부채는 debtItems 잔액(태그된 상환만) 단일 소스로 통일 — 산출내역과 불일치 방지.
  const debtBalances = useMemo(() => computeDebtBalances(debtItems, monthlyAll || []), [debtItems, monthlyAll]);
  const debt = debtBalances.reduce((s, d) => s + d.balance, 0);
  const total = computed.total;
  const liquid = computed.liquid;
  const invested = total - liquid + debt;   // 투자 = 순자산 − 현금 + 부채

  const nwPct = Math.min(100, (total / Math.max(1, profile.goalAmount)) * 100);
  const remaining = Math.max(0, profile.goalAmount - total);

  const saveBaseline = async () => {
    if (draft === "" || Number.isNaN(Number(draft))) { setEditBaseline(null); return; }
    const n = Number(draft);
    if (editBaseline === "nw") { await setNetWorth(n); setInitialNWState(n); }
    else if (editBaseline === "liquid") { await setInitialLiquid(n); setIL(n); }
    setEditBaseline(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 상단: 현재 순자산 + 목표 */}
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
                padding: "2px 8px", borderRadius: 6, background: "transparent",
                border: `1px solid ${R.border}`, color: R.textMid, fontSize: 10,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
              }}
              title="어떻게 계산됐는지 거래 내역 확인"
            >📊 산출 내역 자세히보기</button>
            <button
              onClick={() => setShowDebt(true)}
              style={{
                padding: "2px 8px", borderRadius: 6,
                background: debt > 0 ? "#FCF3F3" : "transparent",
                border: `1px solid ${debt > 0 ? R.rose300 : R.border}`,
                color: debt > 0 ? R.rose500 : R.textMid, fontSize: 10,
                fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
              }}
              title="대출 추가·삭제·상환 관리"
            >🛠 부채 관리</button>
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
          { key: "total",    label: "요약" },
          { key: "liquid",   label: "💰 현금" },
          { key: "invested", label: "📈 투자" },
          { key: "debt",     label: "💳 부채" }
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: "6px 4px", border: "none",
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
              <Stat label="📈 투자" value={invested} color={R.lavender} />
              <Stat label="💳 부채" value={debt} color={R.warn} prefix={debt > 0 ? "−" : ""} />
            </div>
            <div style={{
              fontSize: 11, color: R.textMid, lineHeight: 1.6,
              padding: "8px 10px", marginTop: 4, borderRadius: 8,
              background: "#FFFAF5", border: `1px solid ${R.border}`
            }}>
              <strong>순자산 = 현금 + 투자 − 부채</strong><br />
              아래 초기값에 거래(수입·지출·투자·상환 등)를 합산해 자동으로 계산돼요.
            </div>
            <BaselineRow label="초기 순자산" value={initialNW}
              onEdit={() => { setDraft(String(initialNW)); setEditBaseline("nw"); }}
              editing={editBaseline === "nw"} draft={draft} setDraft={setDraft}
              onSave={saveBaseline} onCancel={() => setEditBaseline(null)} />
            <BaselineRow label="초기 현금" value={initialLiquid}
              onEdit={() => { setDraft(String(initialLiquid)); setEditBaseline("liquid"); }}
              editing={editBaseline === "liquid"} draft={draft} setDraft={setDraft}
              onSave={saveBaseline} onCancel={() => setEditBaseline(null)} />
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px", marginTop: 6, borderRadius: 8, background: R.cream, fontSize: 11
            }}>
              <span style={{ color: R.textMid, fontWeight: 600 }}>현재 부채</span>
              <span style={{ flex: 1, color: R.textDark, fontWeight: 700 }}>{fmt(debt)}</span>
              <button onClick={() => setShowDebt(true)}
                style={{ background: "none", border: "none", color: R.rose500, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "2px 4px" }}
                title="부채 관리">🛠 관리</button>
            </div>
          </>
        )}
        {tab === "liquid" && (
          <BucketBody color={R.mint} bg="#F4FAF6" value={liquid}
            title="지금 바로 쓸 수 있는 돈"
            desc={<>통장·체크카드·비상금처럼 즉시 인출 가능한 자산이에요.<br />수입·유동자산 적립이면 <b style={{ color: R.mint }}>+</b>, 지출이면 <b style={{ color: R.rose500 }}>−</b>, 투자·상환으로 빠지면 <b style={{ color: R.rose500 }}>−</b> 돼요.</>}
            formula="= 초기 현금 + (수입·유동자산·대출(현금)) − (지출·투자·상환)" />
        )}
        {tab === "invested" && (
          <BucketBody color={R.lavender} bg="#F8F4FA" value={invested}
            title="지금 빼긴 어렵지만 자라는 돈"
            desc={<>주식·ETF·적금·전세금처럼 묶여있는 자산이에요.<br />투자/적금 적립하면 <b style={{ color: R.lavender }}>+</b> (현금에서 빠져 이쪽으로 이동).</>}
            formula="= 순자산 − 현금 + 부채" />
        )}
        {tab === "debt" && (
          <div style={{ padding: "8px 4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: R.warn }}>{fmtWon(debt)}</div>
              <button
                onClick={() => setShowDebt(true)}
                style={{
                  padding: "8px 14px", borderRadius: 10,
                  background: `linear-gradient(135deg, ${R.rose400}, ${R.rose500})`,
                  color: "#fff", border: "none", fontSize: 12, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit", boxShadow: `0 3px 10px ${R.rose400}40`
                }}
              >🛠 부채 관리</button>
            </div>

            {debtBalances.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {debtBalances.map((d) => {
                  const pct = d.total > 0 ? Math.min(100, (d.paid / d.total) * 100) : 0;
                  return (
                    <div key={d.id} style={{ padding: "8px 10px", borderRadius: 8, background: "#FCF3F3", border: `1px solid ${R.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ fontWeight: 700, color: R.textDark }}>{d.name || "(이름 없음)"}</span>
                        <span style={{ fontWeight: 800, color: d.balance <= 0 ? R.mint : R.warn }}>{d.balance <= 0 ? "완납 ✓" : fmt(d.balance)}</span>
                      </div>
                      <div className="progress-track" style={{ marginTop: 5, height: 3 }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, background: d.balance <= 0 ? R.mint : R.rose400 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                fontSize: 11, color: R.textMid, lineHeight: 1.6, marginTop: 10,
                padding: "8px 10px", borderRadius: 8, background: "#FCF3F3", border: `1px solid ${R.border}`
              }}>
                마통·대출이 있으면 <b>🛠 부채 관리</b>에서 등록하세요. 대출별 잔액·상환을 추적하고 순자산 부채에 반영돼요.
              </div>
            )}
            <div style={{ fontSize: 10, color: R.textLight, marginTop: 8, lineHeight: 1.5 }}>
              상환하면 <b style={{ color: R.mint }}>현금↓ 부채↓</b> · 대출 받으면 용도(생활비/전세/투자)대로 현금 또는 투자로 편입돼요.
            </div>
          </div>
        )}
      </div>
      {showDebt && <DebtManagerModal onClose={() => setShowDebt(false)} />}
      {showBreakdown && (
        <NetWorthBreakdownModal
          allCategories={allCategories}
          tasks={tasks}
          initialNW={initialNW}
          initialLiquid={initialLiquid}
          initialDebt={initialDebt}
          onClose={() => setShowBreakdown(false)}
        />
      )}
      {showGuide && <AssetTypeGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

function Stat({ label, value, color, prefix = "" }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: R.textLight }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>{prefix}{fmtWon(value)}</div>
    </div>
  );
}

function BucketBody({ color, bg, value, title, desc, formula, baseline }) {
  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmtWon(value)}</div>
      <div style={{
        fontSize: 11, color: R.textMid, lineHeight: 1.6, marginTop: 8,
        padding: "8px 10px", borderRadius: 8, background: bg, border: `1px solid ${R.border}`
      }}>
        <strong>{title}</strong> — {desc}<br />
        <span style={{ color: R.textLight, fontSize: 10 }}>{formula}</span>
      </div>
      {baseline && (
        <BaselineRow label={baseline.label} value={baseline.value}
          onEdit={baseline.onEdit} editing={baseline.editing} draft={baseline.draft}
          setDraft={baseline.setDraft} onSave={baseline.onSave} onCancel={baseline.onCancel} />
      )}
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
            type="text" className="modal-input" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            style={{ flex: 1, padding: "4px 8px", fontSize: 12 }} autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={onSave}>저장</button>
          <button className="btn btn-sm" onClick={onCancel}>취소</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, color: R.textDark, fontWeight: 700 }}>{fmt(value)}</span>
          <button onClick={onEdit}
            style={{ background: "none", border: "none", color: R.textLight, fontSize: 11, cursor: "pointer", padding: "2px 4px" }}
            title="수정">✏️</button>
        </>
      )}
    </div>
  );
}
