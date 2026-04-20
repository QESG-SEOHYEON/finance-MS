import { useState, useMemo, useCallback, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getMonthStatus, setMonthStatus, setActualAmount,
  getView, setView, calcDebtPaidBefore, getExpensesForMonth,
  getMonthSchedule, setMonthSchedule,
  getUserProfile
} from "../db.js";
import { COLORS, fmt, fmtWon, getDaysInMonth, getTasksForMonth } from "../schedule.js";
import { aggregateMonth } from "../lib/aggregate.js";
import TopBar from "../components/TopBar.jsx";
import TaskEditor from "../components/TaskEditor.jsx";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const FILTERS = [
  { key: "all", label: "전체" },
  { key: "income", label: "수입" },
  { key: "fixed", label: "고정지출" },
  { key: "invest", label: "투자" },
  { key: "debt", label: "마통" },
  { key: "general", label: "일반" }
];

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [filter, setFilter] = useState("all");
  const [editTask, setEditTask] = useState(null); // { task, mode }
  const [bootLoaded, setBootLoaded] = useState(false);

  const allMonthly = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const monthRow = useLiveQuery(() => getMonthStatus(year, month), [year, month], null);
  const expenses = useLiveQuery(() => getExpensesForMonth(year, month), [year, month], []);
  const scheduleRow = useLiveQuery(() => getMonthSchedule(year, month), [year, month], null);
  const dbProfile = useLiveQuery(() => getUserProfile(), [], null);

  useEffect(() => {
    (async () => {
      const v = await getView();
      if (v?.year && v?.month) { setYear(v.year); setMonth(v.month); }
      setBootLoaded(true);
    })();
  }, []);

  const checks = monthRow?.checks || {};
  const actuals = monthRow?.actualAmounts || {};
  const debtPaidBefore = useMemo(
    () => calcDebtPaidBefore(allMonthly || [], dbProfile, year, month),
    [allMonthly, dbProfile, year, month]
  );
  const tasks = useMemo(
    () => getTasksForMonth(year, month, {
      profile: dbProfile,
      customSchedule: scheduleRow || undefined,
      debtPaidBefore
    }),
    [year, month, dbProfile, debtPaidBefore, scheduleRow]
  );
  const filteredTasks = filter === "all" ? tasks : tasks.filter((t) => t.type === filter);

  const checkedCount = tasks.filter((t) => checks[t.id]).length;
  const pct = tasks.length > 0 ? Math.round((checkedCount / tasks.length) * 100) : 0;

  const agg = useMemo(
    () => aggregateMonth(tasks, checks, actuals, expenses),
    [tasks, checks, actuals, expenses]
  );

  const toggle = useCallback(async (taskId) => {
    const next = { ...checks };
    if (next[taskId]) delete next[taskId];
    else next[taskId] = true;
    await setMonthStatus(year, month, { checks: next });
  }, [checks, year, month]);

  const saveActual = useCallback(async (taskId, amount) => {
    await setActualAmount(year, month, taskId, amount);
  }, [year, month]);

  // Schedule edit/add/delete
  const saveTaskEdit = useCallback(async (task, patch) => {
    const schedule = await getMonthSchedule(year, month);
    if (task?.isCustom) {
      const added = (schedule.added || []).map((a) =>
        a.id === task.id ? { ...a, ...patch } : a
      );
      await setMonthSchedule(year, month, { added });
    } else {
      const overrides = { ...(schedule.overrides || {}), [task.id]: patch };
      await setMonthSchedule(year, month, { overrides });
    }
  }, [year, month]);

  const addTask = useCallback(async (patch) => {
    const schedule = await getMonthSchedule(year, month);
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const added = [...(schedule.added || []), { id, ...patch }];
    await setMonthSchedule(year, month, { added });
  }, [year, month]);

  const deleteTask = useCallback(async (task) => {
    const schedule = await getMonthSchedule(year, month);
    if (task.isCustom) {
      const added = (schedule.added || []).filter((a) => a.id !== task.id);
      await setMonthSchedule(year, month, { added });
    } else {
      const hidden = [...(schedule.hidden || []), task.id];
      await setMonthSchedule(year, month, { hidden });
    }
    // also clear check/actual
    const next = { ...checks };
    delete next[task.id];
    const nextActuals = { ...actuals };
    delete nextActuals[task.id];
    await setMonthStatus(year, month, { checks: next, actualAmounts: nextActuals });
  }, [year, month, checks, actuals]);

  const resetMonthSchedule = useCallback(async () => {
    if (!confirm(`${year}년 ${month}월의 편집 내역을 모두 초기화할까요? (기본 스케줄로 복원)`)) return;
    await setMonthSchedule(year, month, { overrides: {}, hidden: [], added: [] });
  }, [year, month]);

  // 드래그 앤 드롭으로 이벤트 날짜 이동
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);

  const moveTaskToDay = useCallback(async (taskId, newDay) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.day === newDay) return;
    const schedule = await getMonthSchedule(year, month);
    if (task.isCustom) {
      const added = (schedule.added || []).map((a) =>
        a.id === taskId ? { ...a, day: newDay } : a
      );
      await setMonthSchedule(year, month, { added });
    } else {
      const overrides = {
        ...(schedule.overrides || {}),
        [taskId]: { ...(schedule.overrides?.[taskId] || {}), day: newDay }
      };
      await setMonthSchedule(year, month, { overrides });
    }
  }, [tasks, year, month]);

  // 완료 체크 세팅
  const setChecked = useCallback(async (taskId, v) => {
    const next = { ...checks };
    if (v) next[taskId] = true;
    else delete next[taskId];
    await setMonthStatus(year, month, { checks: next });
  }, [checks, year, month]);

  const changeMonth = useCallback(async (dir) => {
    let m = month + dir, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
    await setView(y, m);
  }, [year, month]);

  const goToday = useCallback(async () => {
    const y = today.getFullYear(), m = today.getMonth() + 1;
    setYear(y); setMonth(m);
    await setView(y, m);
  }, [today]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();

  const tasksByDay = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) (map[t.day] ||= []).push(t);
    return map;
  }, [filteredTasks]);

  // 빈 칸 오브제 배치 (월마다 고정, 앞/뒤 다른 순서)
  const decorPool = useMemo(() => [
    { src: "./pink-cloud.png", cls: "cal-decor" },
    { src: "./pixel-ribbon.png", cls: "cal-decor cal-decor-sm" },
    { src: "./pixel-heart.png", cls: "cal-decor" }
  ], []);
  const leadingDecors = useMemo(() => {
    const seed = year * 13 + month;
    const arr = [...decorPool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (seed * (i + 7)) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [year, month, decorPool]);
  const trailingDecors = useMemo(() => {
    const seed = year * 17 + month * 3 + 5;
    const arr = [...decorPool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (seed * (i + 11)) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [year, month, decorPool]);

  if (!bootLoaded || monthRow === null) {
    return <div style={{ padding: 40, color: "#B8A9A3" }}>불러오는 중...</div>;
  }

  return (
    <>
      <TopBar
        breadcrumb={["Dashboard", "Calendar"]}
        title="Calendar"
        subtitle="이번 달 고정 스케줄을 체크하고 실제 금액을 기록하세요"
        right={
          <>
            <button className="btn btn-icon" onClick={() => changeMonth(-1)}>‹</button>
            <button className="btn btn-icon" onClick={() => changeMonth(1)}>›</button>
            <button className="btn" onClick={goToday}>Today</button>
          </>
        }
      />

      {/* Filter + month title */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`chip ${filter === f.key ? "active" : ""}`}
              style={
                filter === f.key && f.key !== "all"
                  ? { background: COLORS[f.key].border, color: "#fff" }
                  : undefined
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {year}년 {month}월 · {pct}% ({checkedCount}/{tasks.length})
        </div>
      </div>

      {/* Calendar grid */}
      <div className="cal-grid" style={{ marginBottom: 24 }}>
        {DOW.map((d, i) => (
          <div key={d} className={`cal-dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{d}</div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => {
          const d = leadingDecors[i % leadingDecors.length];
          return (
            <div key={`e-${i}`} className="cal-cell empty">
              {d && <img src={d.src} alt="" className={d.cls} />}
            </div>
          );
        })}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const items = tasksByDay[day] || [];
          const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();
          const dow = new Date(year, month - 1, day).getDay();
          const isDragOver = dragOverDay === day && dragTaskId;
          return (
            <div
              key={day}
              className={`cal-cell ${isToday ? "today" : ""} ${isDragOver ? "drag-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (dragTaskId) setDragOverDay(day); }}
              onDragLeave={() => setDragOverDay((d) => d === day ? null : d)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/taskId") || dragTaskId;
                if (id) moveTaskToDay(id, day);
                setDragTaskId(null);
                setDragOverDay(null);
              }}
            >
              <div className={`cal-day-num ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}`}>
                {day}
              </div>
              {items.map((t) => {
                const isChecked = !!checks[t.id];
                const c = COLORS[t.type];
                return (
                  <div
                    key={t.id}
                    className={`cal-event ${isChecked ? "checked" : ""}`}
                    style={{ background: c.bg, color: c.text, borderLeft: `3px solid ${c.border}` }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/taskId", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragTaskId(t.id);
                    }}
                    onDragEnd={() => { setDragTaskId(null); setDragOverDay(null); }}
                    onClick={(e) => { e.stopPropagation(); setEditTask({ task: t, mode: "edit" }); }}
                    title={`${t.label} ${fmtWon(t.amount)} · 클릭=편집, 드래그=날짜 이동`}
                  >
                    <span className="cal-event-icon">{t.icon}</span>
                    <span className="cal-event-label">{t.label}</span>
                    <span className="cal-event-amt">{fmt(t.amount)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
        {(() => {
          const trailing = (7 - (firstDow + daysInMonth) % 7) % 7;
          if (trailing === 0) return null;
          return Array.from({ length: trailing }, (_, i) => {
            const d = trailingDecors[i % trailingDecors.length];
            return (
              <div key={`t-${i}`} className="cal-cell empty">
                {d && <img src={d.src} alt="" className={d.cls} />}
              </div>
            );
          });
        })()}
      </div>

      {/* Task list */}
      <div className="card">
        <div className="section-title">
          이번 달 할 일
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="section-meta">{filteredTasks.length}개</span>
            {scheduleRow && ((scheduleRow.added?.length || 0) + (scheduleRow.hidden?.length || 0) + Object.keys(scheduleRow.overrides || {}).length > 0) && (
              <button className="btn btn-sm" onClick={resetMonthSchedule} title="기본 스케줄로 복원">
                초기화
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setEditTask({ task: { day: today.getDate() }, mode: "create" })}
            >
              + 이벤트 추가
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {filteredTasks.map((t) => {
            const isChecked = !!checks[t.id];
            const c = COLORS[t.type];
            const actual = actuals[t.id];
            const planned = Math.abs(t.amount);
            const diff = actual !== undefined ? Number(actual) - planned : null;
            return (
              <div
                key={t.id}
                className={`task-row ${isChecked ? "checked" : ""}`}
                style={{ color: c.check }}
                onClick={() => toggle(t.id)}
                onDoubleClick={(e) => { e.stopPropagation(); setEditTask({ task: t, mode: "amount-only" }); }}
              >
                <div className="task-checkbox">{isChecked && "✓"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="task-title">
                    {t.icon} {t.label}
                    {t.isCustom && <span style={{ fontSize: 10, color: "#C08080", marginLeft: 6, fontWeight: 600 }}>custom</span>}
                  </div>
                  <div className="task-sub">{month}월 {t.day}일</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="task-amt" style={{ color: t.amount > 0 ? "#6BAF8D" : c.text }}>
                    {t.amount > 0 ? "+" : ""}{fmt(t.amount)}
                  </div>
                  {actual !== undefined && (
                    <div className="task-amt-actual">
                      실제 {fmtWon(t.amount < 0 ? -Math.abs(actual) : Math.abs(actual))}
                    </div>
                  )}
                  {diff !== null && diff !== 0 && (
                    <div className="task-amt-diff" style={{ color: diff > 0 ? "#C06060" : "#6BAF8D" }}>
                      {diff > 0 ? "+" : ""}{fmt(diff)} 차이
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => { e.stopPropagation(); setEditTask({ task: t, mode: "amount-only" }); }}
                    title="실제 금액 입력"
                  >
                    {actual !== undefined ? "금액" : "금액"}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => { e.stopPropagation(); setEditTask({ task: t, mode: "edit" }); }}
                    title="이벤트 편집 / 삭제"
                  >
                    편집
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
        <div className="card">
          <div className="section-title">
            {month}월 수입 · 지출 합산
            <span className="section-meta">예상 / 실제</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SummaryRow label="💰 수입 (급여)" planned={agg.income} actual={agg.incomeActual} positive />
            <SummaryRow label="💳 고정지출" planned={agg.fixed} actual={agg.fixedActual} />
            <SummaryRow label="📈 투자/저축" planned={agg.invest} actual={agg.investActual} />
            {agg.debt > 0 && <SummaryRow label="⚡ 마통상환" planned={agg.debt} actual={agg.debtActual} />}
            {agg.general > 0 && <SummaryRow label="🎉 일반 (약속·소비)" planned={agg.general} actual={agg.generalActual} />}
            <SummaryRow label="🛒 변동지출 (Expenses)" planned={null} actual={agg.variable} variableOnly />
            <div style={{ borderTop: "1px solid #EEF0F3", paddingTop: 10, marginTop: 4 }}>
              <SummaryRow label="합계 지출" planned={agg.totalExpense} actual={agg.totalExpenseActual} bold />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            {month}월 저축 여력
          </div>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 12, color: "#B8A9A3" }}>예상 저축액</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: agg.savings >= 0 ? "#6BAF8D" : "#C06060", marginTop: 4 }}>
              {agg.savings >= 0 ? "+" : ""}{fmtWon(agg.savings)}
            </div>
          </div>
          {agg.savingsActual !== agg.savings && (
            <div style={{ textAlign: "center", paddingBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#B8A9A3" }}>실제 기준</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: agg.savingsActual >= 0 ? "#6BAF8D" : "#C06060", marginTop: 4 }}>
                {agg.savingsActual >= 0 ? "+" : ""}{fmtWon(agg.savingsActual)}
              </div>
              {(() => {
                const diff = agg.savingsActual - agg.savings;
                if (diff === 0) return null;
                return (
                  <div style={{ fontSize: 12, fontWeight: 600, color: diff > 0 ? "#6BAF8D" : "#C06060", marginTop: 4 }}>
                    예상 대비 {diff > 0 ? "+" : ""}{fmt(diff)}
                  </div>
                );
              })()}
            </div>
          )}
          <div style={{ background: "#FAF5F3", borderRadius: 10, padding: 12, fontSize: 12, color: "#7A6060" }}>
            수입 {fmtWon(agg.incomeActual)} − 지출 {fmtWon(agg.totalExpenseActual)} = 저축 {fmtWon(agg.savingsActual)}
          </div>
        </div>
      </div>

      {editTask && (
        <TaskEditor
          task={editTask.task}
          mode={editTask.mode}
          daysInMonth={daysInMonth}
          actual={editTask.task?.id ? actuals[editTask.task.id] : undefined}
          checked={editTask.task?.id ? !!checks[editTask.task.id] : false}
          onSave={async (patch) => {
            if (editTask.mode === "create") {
              await addTask(patch);
            } else if (editTask.mode === "amount-only") {
              await saveActual(editTask.task.id, patch.actualAmount);
            } else {
              const { completed, ...rest } = patch;
              await saveTaskEdit(editTask.task, rest);
              if (completed !== undefined) await setChecked(editTask.task.id, completed);
            }
          }}
          onDelete={editTask.mode === "edit" ? () => deleteTask(editTask.task) : null}
          onClose={() => setEditTask(null)}
        />
      )}
    </>
  );
}

function SummaryRow({ label, planned, actual, positive, variableOnly, bold }) {
  const diff = !variableOnly && planned !== null ? actual - planned : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: bold ? 14 : 13 }}>
      <div style={{ flex: 1, fontWeight: bold ? 700 : 600, color: bold ? "#4A3535" : "#374151" }}>{label}</div>
      {!variableOnly && planned !== null && (
        <div style={{ width: 90, textAlign: "right", color: "#B8A9A3" }}>{fmtWon(planned)}</div>
      )}
      <div style={{
        width: 100, textAlign: "right", fontWeight: 700,
        color: positive ? "#6BAF8D" : variableOnly ? "#D97706" : "#4A3535"
      }}>
        {fmtWon(actual)}
      </div>
      {diff !== null && diff !== 0 ? (
        <div style={{ width: 70, textAlign: "right", fontSize: 11, fontWeight: 600, color: diff > 0 ? "#C06060" : "#6BAF8D" }}>
          {diff > 0 ? "+" : ""}{fmt(diff)}
        </div>
      ) : (
        <div style={{ width: 70 }} />
      )}
    </div>
  );
}
