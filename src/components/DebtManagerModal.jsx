import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { db, getDebts, setDebts } from "../db.js";
import { computeDebtBalances, DEBT_PURPOSES, purposeMeta } from "../lib/debt.js";
import { fmt, fmtWon } from "../schedule.js";
import MoneyInput from "./MoneyInput.jsx";

const R = {
  rose200: "#F0D5D5", rose300: "#D4A0A0", rose400: "#C08080", rose500: "#A66060",
  mint: "#6BAF8D", lavender: "#9B7EC0", warn: "#C06060",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", border: "#EDE5E2"
};

const blank = () => ({ id: `debt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: "", total: "", monthly: "", dueDay: 26, purpose: "living" });

export default function DebtManagerModal({ onClose }) {
  const [items, setItems] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [editing, setEditing] = useState(null); // debtItem draft | null
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [d, m] = await Promise.all([getDebts(), db.monthly_status.toArray()]);
    setItems(d);
    setMonthly(m);
  };
  useEffect(() => { reload(); }, []);

  if (items === null) return null;
  const balances = computeDebtBalances(items, monthly);
  const totalRemaining = balances.reduce((s, d) => s + d.balance, 0);

  const save = async (draft) => {
    const clean = {
      ...draft,
      total: Number(draft.total) || 0,
      monthly: Number(draft.monthly) || 0,
      dueDay: Math.max(1, Math.min(31, Number(draft.dueDay) || 26))
    };
    const exists = items.some((x) => x.id === clean.id);
    const next = exists ? items.map((x) => (x.id === clean.id ? clean : x)) : [...items, clean];
    setBusy(true);
    await setDebts(next);
    await reload();
    setEditing(null);
    setBusy(false);
  };

  const remove = async (id) => {
    if (!confirm("이 부채를 삭제할까요? (상환 기록은 남아있어요)")) return;
    setBusy(true);
    await setDebts(items.filter((x) => x.id !== id));
    await reload();
    setBusy(false);
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: "88vh", overflow: "auto" }}>
        <div className="modal-title">🛠 부채 관리</div>
        <div className="modal-sub">대출을 등록하면 매월 캘린더에 상환 일정이 떠요. 순자산 = 현금 + 투자 − 부채.</div>

        {/* 총 잔액 */}
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FCF3F3", border: `1px solid ${R.rose200}`, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: R.textMid, fontWeight: 700 }}>총 남은 부채</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: R.warn }}>{fmtWon(totalRemaining)}</span>
        </div>

        {/* 상환 방법 안내 */}
        <div style={{ padding: "8px 10px", borderRadius: 8, background: R.cream, border: `1px solid ${R.border}`, marginBottom: 12, fontSize: 11, color: R.textMid, lineHeight: 1.6 }}>
          💡 <b>상환은 캘린더에서</b> — 매월 상환일에 <b>⚡ {"{"}대출{"}"} 상환</b> 일정이 자동으로 떠요.
          그 일정을 <b>완료 체크</b>하면 상환 기록 (현금↓ 부채↓). 실제 금액이 다르면 일정을 눌러 금액만 고치면 돼요.
        </div>

        {/* 목록 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {balances.map((d) => {
            const pm = purposeMeta(d.purpose);
            const pct = d.total > 0 ? Math.min(100, (d.paid / d.total) * 100) : 0;
            const isEdit = editing?.id === d.id;
            if (isEdit) return <DebtForm key={d.id} draft={editing} setDraft={setEditing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />;
            return (
              <div key={d.id} style={{ border: `1px solid ${R.border}`, borderRadius: 12, background: "#fff", padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: R.textDark }}>{d.name || "(이름 없음)"}</div>
                    <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>{pm.label} · 매월 {d.dueDay}일 · 월 {fmt(d.monthly)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: R.warn }}>{fmt(d.balance)}</div>
                    <div style={{ fontSize: 9, color: R.textLight }}>잔액 / 총 {fmt(d.total)}</div>
                  </div>
                </div>
                <div className="progress-track" style={{ marginTop: 8, height: 4 }}>
                  <div className="progress-fill" style={{ width: `${pct}%`, background: d.balance <= 0 ? R.mint : R.rose400 }} />
                </div>
                <div style={{ fontSize: 9, color: R.textLight, marginTop: 3 }}>
                  {d.balance <= 0 ? "✓ 완납" : `${Math.round(pct)}% 상환 (${fmt(d.paid)})`}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button onClick={() => setEditing({ ...d })} style={{ flex: 1, padding: "7px 12px", background: "#fff", color: R.textMid, border: `1px solid ${R.border}`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>편집</button>
                  <button onClick={() => remove(d.id)} style={{ padding: "7px 12px", background: "#fff", color: R.warn, border: `1px solid ${R.warn}30`, borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>삭제</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 추가 폼 / 버튼 */}
        {editing && !items.some((x) => x.id === editing.id) ? (
          <div style={{ marginTop: 8 }}>
            <DebtForm draft={editing} setDraft={setEditing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
          </div>
        ) : (
          <button onClick={() => setEditing(blank())}
            style={{ width: "100%", marginTop: 10, padding: "10px", background: "transparent", border: `1.5px dashed ${R.rose300}`, color: R.rose500, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ 부채 추가</button>
        )}

        {balances.length === 0 && !editing && (
          <div style={{ fontSize: 12, color: R.textLight, padding: 16, textAlign: "center" }}>등록된 부채가 없어요. 대출·마통이 있으면 추가해보세요.</div>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DebtForm({ draft, setDraft, onSave, onCancel, busy }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  return (
    <div style={{ border: `1.5px solid ${R.rose300}`, borderRadius: 12, background: R.cream, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <input className="modal-input" placeholder="이름 (예: 전세대출, 마이너스통장)" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: R.textMid, fontWeight: 700, marginBottom: 2 }}>총액(잔여 원금)</div>
          <MoneyInput className="modal-input" value={draft.total} onChange={(e) => set({ total: e.target.value })} placeholder="예: 1,100,000" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: R.textMid, fontWeight: 700, marginBottom: 2 }}>월 상환액</div>
          <MoneyInput className="modal-input" value={draft.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder="예: 160,000" />
        </div>
        <div style={{ width: 70 }}>
          <div style={{ fontSize: 10, color: R.textMid, fontWeight: 700, marginBottom: 2 }}>상환일</div>
          <input type="number" min={1} max={31} className="modal-input" value={draft.dueDay} onChange={(e) => set({ dueDay: e.target.value })} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: R.textMid, fontWeight: 700, marginBottom: 4 }}>용도 (빌린 돈이 어디로 갔나)</div>
        <div style={{ display: "flex", gap: 4 }}>
          {DEBT_PURPOSES.map((p) => (
            <button key={p.v} type="button" onClick={() => set({ purpose: p.v })}
              style={{ flex: 1, padding: "6px 4px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                background: draft.purpose === p.v ? "#FFE0E8" : "#fff",
                border: `1px solid ${draft.purpose === p.v ? R.rose400 : R.border}`,
                color: draft.purpose === p.v ? R.rose500 : R.textMid }}
              title={p.hint}>{p.label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button onClick={() => onSave(draft)} disabled={busy || !draft.name.trim()}
          style={{ flex: 1, padding: "8px", background: R.rose400, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: !draft.name.trim() ? 0.5 : 1 }}>저장</button>
        <button onClick={onCancel} style={{ padding: "8px 16px", background: "#fff", color: R.textMid, border: `1px solid ${R.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>취소</button>
      </div>
    </div>
  );
}
