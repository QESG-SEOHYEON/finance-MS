import { useState, useEffect } from "react";
import { fmt, fmtWon } from "../schedule.js";
import MoneyInput from "./MoneyInput.jsx";
import AssetTypeGuideModal, { AssetTypeHelpButton, IMPACT_BY_KEY } from "./AssetTypeGuide.jsx";

const TYPES = [
  { key: "income", label: "수입" },
  { key: "fixed", label: "고정지출" },
  { key: "invest", label: "투자/저축" },
  { key: "debt", label: "마통상환" },
  { key: "general", label: "일반 (약속·소비)" },
  { key: "variable", label: "기타 변동" }
];

// 카테고리 nwImpact → calendar task type (캘린더 색상/그룹용) — AssetTypeGuide 단일 소스 기반
const IMPACT_TO_TASK_TYPE = Object.fromEntries(
  Object.entries(IMPACT_BY_KEY).map(([k, g]) => [k, g.taskType || "general"])
);
const IMPACT_LABEL = Object.fromEntries(
  Object.entries(IMPACT_BY_KEY).map(([k, g]) => [k, g.label])
);

const ICON_PRESETS = [
  "💰", "💳", "💵", "💸", "🏦", "📈", "📊", "📉", "⚡", "🔑", "💼",
  "☕", "🍰", "🧁", "🍪", "🍩", "🍦", "🍓", "🍑", "🍒", "🍵", "🥐", "🍷", "🥂",
  "🌸", "🌷", "🌹", "🌺", "🌻", "🌼", "🌿", "🍀", "🌱", "🦋", "🌙", "☁️", "⭐", "✨", "🌟", "💫", "🌈",
  "🐰", "🐻", "🐱", "🐶", "🦊", "🐼", "🐨", "🦢",
  "🎀", "🎁", "🎉", "🎈", "💐", "🕯️", "💌", "💝", "💖", "💕", "💞", "💓", "❤️",
  "🛍️", "👗", "👜", "👠", "💄", "💅", "💎", "🎨", "🪞",
  "🏡", "🛁", "📚", "📝", "✏️", "📌", "📍", "📎", "🔖",
  "🌏", "✈️", "🎵", "🎬", "🏋️", "💊", "🩺"
];

// mode: "edit" | "create" | "amount-only"
export default function TaskEditor({ task, actual, checked = false, mode = "edit", daysInMonth, allCategories = [], onSave, onDelete, onClose }) {
  const isCreate = mode === "create";
  const isAmountOnly = mode === "amount-only";
  const [label, setLabel] = useState(task?.label || "");
  const [day, setDay] = useState(task?.day || 1);
  const [type, setType] = useState(task?.type || "variable");
  const [categoryKey, setCategoryKey] = useState(task?.category || "");
  const [icon, setIcon] = useState(task?.icon || "📌");
  const [isDone, setIsDone] = useState(checked);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [amount, setAmount] = useState(
    isCreate ? "" : (actual ?? Math.abs(task?.amount ?? 0))
  );

  useEffect(() => {
    if (task) {
      setLabel(task.label || "");
      setDay(task.day || 1);
      setType(task.type || "variable");
      setCategoryKey(task.category || "");
      setIcon(task.icon || "📌");
      if (!isCreate) setAmount(actual ?? Math.abs(task.amount ?? 0));
    }
    setIsDone(checked);
  }, [task?.id, checked]);

  const selectedCat = allCategories.find((c) => c.key === categoryKey);
  const catImpact = selectedCat?.nwImpact;
  // 카테고리 선택 시 task type 자동 매핑
  const effectiveType = catImpact ? (IMPACT_TO_TASK_TYPE[catImpact] || type) : type;

  const planned = task ? Math.abs(task.amount) : 0;
  const diff = amount !== "" && !isAmountOnly ? 0 : Number(amount) - planned;

  const handleSave = () => {
    const amt = amount === "" ? 0 : Number(amount);
    const signedAbs = Math.abs(amt);
    // 수입은 양수, 그 외는 음수로 저장 (캘린더 task amount 컨벤션)
    const signed = effectiveType === "income" ? signedAbs : -signedAbs;
    if (isAmountOnly) {
      onSave({ actualAmount: amt === 0 ? null : amt });
    } else {
      onSave({
        label: label.trim() || "새 항목",
        day: Number(day),
        type: effectiveType,
        category: categoryKey || undefined,
        icon: selectedCat?.icon || icon,
        amount: signed,
        completed: isDone
      });
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-title">
          {isCreate ? "이벤트 추가" : isAmountOnly ? `${icon} ${label}` : "이벤트 편집"}
        </div>
        <div className="modal-sub">
          {isAmountOnly
            ? `예상 ${fmtWon(task.amount)} · 실제 금액 입력`
            : "제목, 카테고리/자산 종류, 날짜, 금액"}
        </div>

        {!isAmountOnly && (
          <>
            {!isCreate && (
              <label style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                background: isDone ? "#F0FAF5" : "#FAF5F3", borderRadius: 10,
                marginBottom: 12, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: `1px solid ${isDone ? "#6BAF8D" : "#EDE5E2"}`
              }}>
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => setIsDone(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "#6BAF8D" }}
                />
                <span style={{ color: isDone ? "#3B7A5A" : "#7A6060" }}>
                  {isDone ? "✓ 완료됨" : "완료로 표시"}
                </span>
              </label>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                className="modal-input"
                onClick={() => setShowIconPicker((v) => !v)}
                style={{
                  width: 60, padding: "10px 8px", fontSize: 22, textAlign: "center",
                  cursor: "pointer", background: "#fff"
                }}
                title="이모지 선택"
              >
                {selectedCat?.icon || icon}
              </button>
              <input
                className="modal-input"
                placeholder="제목 (예: 카드값, 보너스)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            {showIconPicker && (
              <div style={{
                background: "#FAF5F3", border: "1px solid #EDE5E2", borderRadius: 10,
                padding: 10, marginBottom: 10
              }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="직접 입력 (이모지 붙여넣기 가능)"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value || "📌")}
                    className="modal-input"
                    style={{ flex: 1, fontSize: 14, padding: "8px 10px" }}
                    maxLength={4}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => setShowIconPicker(false)}>닫기</button>
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4,
                  maxHeight: 200, overflowY: "auto"
                }}>
                  {ICON_PRESETS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => { setIcon(ic); setShowIconPicker(false); }}
                      style={{
                        width: 32, height: 32, borderRadius: 8, fontSize: 18,
                        border: icon === ic ? "2px solid #C08080" : "1px solid transparent",
                        background: icon === ic ? "#FFF0EC" : "#fff",
                        cursor: "pointer", padding: 0,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}
                    >{ic}</button>
                  ))}
                </div>
              </div>
            )}

            {/* 카테고리 (선택) */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4 }}>
                카테고리 (선택)
              </div>
              <select
                className="modal-input"
                value={categoryKey}
                onChange={(e) => setCategoryKey(e.target.value)}
              >
                <option value="">(선택 안 함 — 직접 자산 종류 지정)</option>
                {allCategories.map((c) => (
                  <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>

            {/* 자산 종류 — 카테고리에 있으면 자동, 없으면 직접 선택 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <span>자산 종류</span>
                <AssetTypeHelpButton onClick={() => setShowGuide(true)} />
              </div>
              {catImpact ? (
                <div style={{
                  padding: "8px 10px", background: "#FAF5F3",
                  border: "1px solid #EDE5E2", borderRadius: 8,
                  fontSize: 12, color: "#7A6060"
                }}>
                  이미 자산 종류가 정해진 카테고리예요 — <strong style={{ color: "#A66060" }}>{IMPACT_LABEL[catImpact] || catImpact}</strong>
                </div>
              ) : (
                <select
                  className="modal-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
            </div>

            {/* 날짜 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4 }}>
                일 (1 ~ {daysInMonth || 31})
              </div>
              <input
                type="number"
                className="modal-input"
                placeholder="일"
                min={1}
                max={daysInMonth || 31}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                style={{ width: 100 }}
              />
            </div>
          </>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4 }}>
          금액 (양수)
        </div>
        <MoneyInput
          className="modal-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          autoFocus
          placeholder="금액"
        />

        {isAmountOnly && amount !== "" && !Number.isNaN(Number(amount)) && diff !== 0 && (
          <div style={{ fontSize: 12, color: "#7A6060", marginTop: 8 }}>
            예상 대비{" "}
            <span style={{ color: diff > 0 ? "#C06060" : "#6BAF8D", fontWeight: 700 }}>
              {diff > 0 ? "+" : ""}{fmt(diff)}
            </span>
          </div>
        )}

        <div className="modal-actions">
          {!isCreate && !isAmountOnly && onDelete && (
            <button
              className="btn btn-sm"
              style={{ marginRight: "auto", color: "#C06060" }}
              onClick={() => { onDelete(); onClose(); }}
            >삭제</button>
          )}
          {isAmountOnly && actual !== undefined && actual !== null && (
            <button
              className="btn btn-sm"
              style={{ marginRight: "auto" }}
              onClick={() => { onSave({ actualAmount: null }); onClose(); }}
            >초기화</button>
          )}
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {isCreate ? "추가" : "저장"}
          </button>
        </div>

        {showGuide && <AssetTypeGuideModal onClose={() => setShowGuide(false)} />}
      </div>
    </div>
  );
}
