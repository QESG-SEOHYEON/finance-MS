import { useState } from "react";
import { createPortal } from "react-dom";
import { setRecurringTasks } from "../db.js";
import MoneyInput from "./MoneyInput.jsx";
import AssetTypeGuideModal, { AssetTypeHelpButton, IMPACT_BY_KEY } from "./AssetTypeGuide.jsx";

const R = {
  rose400: "#C08080", rose500: "#A66060",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  border: "#EDE5E2", cream: "#FAF5F3", accentLight: "#FFE0E8"
};

const TYPES = [
  { v: "income",  label: "💰 수입" },
  { v: "fixed",   label: "🏠 고정지출" },
  { v: "invest",  label: "📈 투자" },
  { v: "debt",    label: "⚡ 부채 상환" },
  { v: "general", label: "📌 일반" }
];

const FREQS = [
  { v: "monthly",  label: "매월" },
  { v: "weekly",   label: "매주" },
  { v: "biweekly", label: "격주" }
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function RecurringTaskEditor({ initial, allItems, allCategories, onClose }) {
  const [label, setLabel] = useState(initial?.label || "");
  const [type, setType] = useState(initial?.type || "income");
  const [category, setCategory] = useState(initial?.category || "");
  const [frequency, setFrequency] = useState(initial?.frequency || "monthly");
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth || 25);
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [weekOffset, setWeekOffset] = useState(initial?.weekOffset || 0);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [showGuide, setShowGuide] = useState(false);

  const isEdit = !!initial?.id;

  const save = async () => {
    const amt = Number(amount);
    if (!label.trim() || Number.isNaN(amt) || amt === 0) return;
    const id = initial?.id || `rt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id, label: label.trim(), type, category, amount: Math.abs(amt), memo: memo.trim(),
      frequency,
      ...(frequency === "monthly" ? { dayOfMonth: Number(dayOfMonth) } : {}),
      ...(frequency !== "monthly" ? { weekday: Number(weekday) } : {}),
      ...(frequency === "biweekly" ? { weekOffset: Number(weekOffset) } : {})
    };
    const next = isEdit
      ? (allItems || []).map((r) => (r.id === id ? entry : r))
      : [...(allItems || []), entry];
    await setRecurringTasks(next);
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-title">{isEdit ? "반복 일정 편집" : "반복 일정 추가"}</div>
        <div className="modal-sub">매월/매주/격주로 자동 반복되는 수입·지출·투자 등록</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="라벨">
            <input className="modal-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: N잡 부수입, 청년적금" autoFocus />
          </Field>

          <Field label="카테고리 (선택)">
            <select className="modal-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">(선택 안 함)</option>
              {(allCategories || []).map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </Field>

          {(() => {
            const cat = (allCategories || []).find((c) => c.key === category);
            const catImpact = cat?.nwImpact;
            const lockedByCat = !!catImpact;
            const IMPACT_LABEL = Object.fromEntries(
              Object.entries(IMPACT_BY_KEY).map(([k, g]) => [k, g.label])
            );
            return (
              <Field label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  자산 종류
                  <AssetTypeHelpButton onClick={() => setShowGuide(true)} />
                </span>
              }>
                {lockedByCat ? (
                  <div style={{
                    padding: "8px 10px",
                    background: R.cream || "#FAF5F3",
                    border: `1px solid ${R.border}`,
                    borderRadius: 8,
                    fontSize: 12, color: R.textMid
                  }}>
                    이미 자산 종류가 정해진 카테고리예요 — <strong style={{ color: R.rose500 }}>{IMPACT_LABEL[catImpact] || catImpact}</strong>
                    <div style={{ fontSize: 10, color: R.textLight, marginTop: 4 }}>
                      바꾸려면 카테고리 자체의 자산 종류를 수정하세요.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
                    {TYPES.map((t) => (
                      <button key={t.v} type="button" onClick={() => setType(t.v)} style={pillStyle(type === t.v)}>{t.label}</button>
                    ))}
                  </div>
                )}
              </Field>
            );
          })()}

          <Field label="주기">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {FREQS.map((f) => (
                <button key={f.v} type="button" onClick={() => setFrequency(f.v)} style={pillStyle(frequency === f.v)}>{f.label}</button>
              ))}
            </div>
          </Field>

          {frequency === "monthly" ? (
            <Field label="매월 며칠">
              <input type="number" min="1" max="31" className="modal-input" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} style={{ width: 100 }} />
            </Field>
          ) : (
            <Field label={frequency === "weekly" ? "매주 요일" : "격주 요일"}>
              <div style={{ display: "flex", gap: 4 }}>
                {WEEKDAYS.map((d, i) => (
                  <button key={d} type="button" onClick={() => setWeekday(i)} style={{ ...pillStyle(weekday === i), flex: 1, padding: "6px 0" }}>{d}</button>
                ))}
              </div>
              {frequency === "biweekly" && (
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {[0, 1].map((o) => (
                    <button key={o} type="button" onClick={() => setWeekOffset(o)} style={{ ...pillStyle(weekOffset === o), flex: 1 }}>
                      {o === 0 ? "짝수 주" : "홀수 주"}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}

          <Field label="금액 (원)">
            <MoneyInput className="modal-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200,000" />
          </Field>

          <Field label="메모 (선택)">
            <input className="modal-input" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </div>

        <div className="modal-actions">
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save}>저장</button>
        </div>
        {showGuide && <AssetTypeGuideModal onClose={() => setShowGuide(false)} />}
      </div>
    </div>,
    document.body
  );
}

function pillStyle(active) {
  return {
    padding: "6px 8px",
    background: active ? R.accentLight : "#fff",
    border: `1px solid ${active ? R.rose400 : R.border}`,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: active ? 700 : 500,
    color: active ? R.rose500 : R.textMid,
    cursor: "pointer", fontFamily: "inherit", textAlign: "center"
  };
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: R.textMid, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
