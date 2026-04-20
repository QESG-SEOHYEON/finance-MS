import { useState, useEffect } from "react";
import { fmt, fmtWon } from "../schedule.js";

export default function AmountEditor({ task, actual, onSave, onClose }) {
  const [value, setValue] = useState(actual ?? Math.abs(task.amount));

  useEffect(() => {
    setValue(actual ?? Math.abs(task.amount));
  }, [task, actual]);

  const planned = Math.abs(task.amount);
  const diff = Number(value) - planned;

  const save = () => {
    onSave(value === "" ? null : Number(value));
    onClose();
  };

  const reset = () => {
    onSave(null);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{task.icon} {task.label}</div>
        <div className="modal-sub">
          예상 {fmtWon(task.amount)} · 실제 금액을 입력하세요
        </div>
        <input
          type="number"
          inputMode="numeric"
          className="modal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          autoFocus
          placeholder="실제 금액"
        />
        {value !== "" && !Number.isNaN(Number(value)) && (
          <div style={{ fontSize: 12, color: "#7A6060", marginTop: 8 }}>
            예상 대비{" "}
            <span style={{ color: diff > 0 ? "#C06060" : diff < 0 ? "#6BAF8D" : "#7A6060", fontWeight: 700 }}>
              {diff > 0 ? "+" : ""}{fmt(diff)}
            </span>
          </div>
        )}
        <div className="modal-actions">
          {actual !== undefined && actual !== null && (
            <button className="btn btn-sm" onClick={reset}>초기화</button>
          )}
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}
