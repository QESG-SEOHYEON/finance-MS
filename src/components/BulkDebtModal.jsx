import { useState, useMemo } from "react";
import { getMonthSchedule, setMonthSchedule } from "../db.js";
import { fmt, fmtWon } from "../schedule.js";

/**
 * 부채 상환 일정 일괄 추가 모달
 * 시작월 ~ 종료월 사이 각 달에 debt 타입 이벤트를 month_schedule.added로 생성.
 * 이후 각 월 캘린더에서 개별 금액 편집 가능.
 */
export default function BulkDebtModal({ onClose }) {
  const [name, setName] = useState("");
  const [dueDay, setDueDay] = useState(20);
  const [startMonth, setStartMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [endMonth, setEndMonth] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [icon, setIcon] = useState("⚡");

  const monthsCount = useMemo(() => {
    if (!startMonth || !endMonth) return 0;
    const [sy, sm] = startMonth.split("-").map(Number);
    const [ey, em] = endMonth.split("-").map(Number);
    if (!sy || !sm || !ey || !em) return 0;
    const diff = (ey - sy) * 12 + (em - sm) + 1;
    return diff > 0 ? diff : 0;
  }, [startMonth, endMonth]);

  const totalAmount = useMemo(() => {
    const m = Number(monthlyAmount) || 0;
    return m * monthsCount;
  }, [monthlyAmount, monthsCount]);

  const canSubmit = name.trim() && startMonth && endMonth && monthsCount > 0 && Number(monthlyAmount) > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const [sy, sm] = startMonth.split("-").map(Number);
    const amount = -Math.abs(Number(monthlyAmount));
    const groupId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let y = sy, m = sm;
    let installment = 1;
    for (let i = 0; i < monthsCount; i++) {
      const schedule = await getMonthSchedule(y, m);
      const daysInMonth = new Date(y, m, 0).getDate();
      const day = Math.min(Number(dueDay) || 1, daysInMonth);
      const event = {
        id: `${groupId}-${installment}`,
        label: `${name.trim()} (${installment}회)`,
        amount,
        type: "debt",
        icon,
        day,
        _bulkGroup: groupId
      };
      const added = [...(schedule.added || []), event];
      await setMonthSchedule(y, m, { added });
      m++; installment++;
      if (m > 12) { m = 1; y++; }
    }
    alert(`${monthsCount}개월치 상환 일정이 캘린더에 추가되었습니다.\n각 월 캘린더에서 금액을 개별 수정할 수 있습니다.`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-title">⚡ 부채 상환 일정 일괄 추가</div>
        <div className="modal-sub">
          시작/종료 월을 지정하면 해당 기간의 매월 상환 이벤트를 캘린더에 생성합니다.
          각 월의 금액은 이후 캘린더에서 개별 수정 가능 (원금/이자 변동 반영).
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="modal-input"
              style={{ width: 68, fontSize: 18, textAlign: "center", padding: "10px 8px" }}
              value={icon}
              onChange={(e) => setIcon(e.target.value || "⚡")}
              maxLength={4}
            />
            <input
              className="modal-input"
              placeholder="대출 이름 (예: 한국장학 생활비)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: 1 }}
              autoFocus
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4 }}>상환 시작 월</div>
              <input
                type="month"
                className="modal-input"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4 }}>상환 종료 월</div>
              <input
                type="month"
                className="modal-input"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4 }}>월 상환액 (평균)</div>
              <input
                type="number"
                className="modal-input"
                placeholder="예: 13500"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 4 }}>상환일</div>
              <input
                type="number"
                min={1} max={31}
                className="modal-input"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {monthsCount > 0 && monthlyAmount && (
            <div style={{
              background: "#FFF5F3", borderRadius: 10, padding: 12,
              border: "1px solid #EDE5E2", fontSize: 12, color: "#7A6060", lineHeight: 1.6
            }}>
              📊 <b>{monthsCount}회 × {fmt(Number(monthlyAmount))}</b> = 총 <b>{fmtWon(totalAmount)}</b>
              <div style={{ fontSize: 11, color: "#B8A9A3", marginTop: 4 }}>
                매월 같은 금액으로 우선 생성됨 · 실제 회차별 금액 차이는 캘린더에서 수정
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.4 }}
          >
            {monthsCount}개월 일괄 추가
          </button>
        </div>
      </div>
    </div>
  );
}
