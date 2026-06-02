import { useState, useMemo, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db, DEBT_TOTAL, PROFILE,
  getMonthStatus, getNetWorth, setNetWorth,
  calcDebtPaidBefore, getExpensesForMonth,
  getCustomGoals, setCustomGoals,
  getCustomCheckpoints, setCustomCheckpoints,
  getMonthSchedule,
  getCashBalance, setCashBalance,
  getUserProfile, mergeProfile,
  getAttendanceDates
} from "../db.js";
import { fmt, fmtWon, getTasksForMonth } from "../schedule.js";
import { currentPhaseFrom, getUserPhases } from "../lib/phase.js";
import { checkpointsForMonth } from "../lib/annual.js";
import { detectRisks } from "../lib/risks.js";
import { EXPENSE_CATEGORIES, mergeCategories } from "../lib/expenseCategories.js";
import { aggregateRange } from "../lib/aggregate.js";
import TopBar from "../components/TopBar.jsx";
import MentorCard from "../components/mentor/MentorCard.jsx";
import AttendanceStrip from "../components/AttendanceStrip.jsx";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from "recharts";

// Rose palette tokens
const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  rose600: "#8B4F4F",
  mint: "#6BAF8D",
  mintLight: "#E8F5EE",
  lavender: "#9B7EC0",
  lavenderLight: "#F3EEF8",
  warm: "#C0A07E",
  warmLight: "#F5F0EA",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  cream: "#FAF5F3",
  creamDark: "#F0EBE8",
  border: "#EDE5E2",
  overBudget: "#C06060",
};

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const dbProfile = useLiveQuery(() => getUserProfile(), [], null);
  const profile = mergeProfile(dbProfile);

  const [netWorth, setNW] = useState(profile.currentNetWorth);
  const [editNW, setEditNW] = useState(false);
  const [nwDraft, setNwDraft] = useState("");

  // 여윳자금 (즉시 인출 가능 현금) — 월별 독립, 과거 월로 이동 가능
  const [cashY, setCashY] = useState(year);
  const [cashM, setCashM] = useState(month);
  const cashSel = useLiveQuery(() => getCashBalance(cashY, cashM), [cashY, cashM], null);
  const cashSelPrev = useLiveQuery(() => {
    const pm = cashM === 1 ? 12 : cashM - 1;
    const py = cashM === 1 ? cashY - 1 : cashY;
    return getCashBalance(py, pm);
  }, [cashY, cashM], null);
  const [editCash, setEditCash] = useState(false);
  const [cashDraft, setCashDraft] = useState("");
  const shiftCashMonth = (dir) => {
    setEditCash(false);
    let nm = cashM + dir, ny = cashY;
    if (nm > 12) { nm = 1; ny++; }
    if (nm < 1) { nm = 12; ny--; }
    setCashM(nm); setCashY(ny);
  };
  const isCashCurrentMonth = cashY === year && cashM === month;

  // Chart range
  const [chartFrom, setChartFrom] = useState(`${year}-01`);
  const [chartTo, setChartTo] = useState(`${year}-12`);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    (async () => {
      const v = await getNetWorth();
      setNW(v);
    })();
  }, []);

  // Chart data reload when range or DB changes
  const allMonthlyForChart = useLiveQuery(() => db.monthly_status.toArray(), []);
  const allExpensesForChart = useLiveQuery(() => db.expenses.toArray(), []);
  useEffect(() => {
    if (allMonthlyForChart === undefined || allExpensesForChart === undefined) return;
    const [fy, fm] = chartFrom.split("-").map(Number);
    const [ty, tm] = chartTo.split("-").map(Number);
    if (!fy || !fm || !ty || !tm) return;
    aggregateRange(fy, fm, ty, tm).then(setChartData);
  }, [chartFrom, chartTo, allMonthlyForChart, allExpensesForChart]);

  const allMonthly = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const monthRow = useLiveQuery(() => getMonthStatus(year, month), [year, month], null);
  const attendanceDates = useLiveQuery(() => getAttendanceDates(), [], []);
  const expenses = useLiveQuery(() => getExpensesForMonth(year, month), [year, month], []);
  const scheduleRow = useLiveQuery(() => getMonthSchedule(year, month), [year, month], null);

  const customCategoriesList = useLiveQuery(
    () => db.settings.get("custom-categories").then((r) => r?.value || []),
    [],
    []
  );
  const categoryOverrides = useLiveQuery(
    () => db.settings.get("category-overrides").then((r) => r?.value || {}),
    [],
    {}
  );
  const dashboardHidden = useLiveQuery(
    () => db.settings.get("dashboard-categories-hidden").then((r) => r?.value || []),
    [],
    []
  );
  const allCategories = useMemo(
    () => mergeCategories(categoryOverrides || {}, customCategoriesList || []),
    [categoryOverrides, customCategoriesList]
  );
  const toggleDashboardCategory = async (key) => {
    const hidden = dashboardHidden || [];
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    await db.settings.put({ id: "dashboard-categories-hidden", value: next });
  };

  const debtPaidBefore = useMemo(
    () => calcDebtPaidBefore(allMonthly || [], year, month),
    [allMonthly, year, month]
  );
  const tasks = useMemo(
    () => getTasksForMonth(year, month, debtPaidBefore, scheduleRow || undefined),
    [year, month, debtPaidBefore, scheduleRow]
  );
  const checks = monthRow?.checks || {};
  const actuals = monthRow?.actualAmounts || {};

  const debtPaidThisMonth = tasks.filter((t) => t.type === "debt" && checks[t.id]).length * 160000;
  const debtPaidTotal = Math.min(DEBT_TOTAL, debtPaidBefore + debtPaidThisMonth);
  const debtRemaining = Math.max(0, DEBT_TOTAL - debtPaidTotal);

  const userPhases = useLiveQuery(() => getUserPhases(), [], []);
  const phase = currentPhaseFrom(userPhases, today);
  const defaultCheckpoints = checkpointsForMonth(month);

  // 출석 통계는 AttendanceStrip 컴포넌트가 내부에서 처리.

  // Editable phase goals
  const [phaseCustom, setPhaseCustom] = useState({ added: [], hidden: [] });
  const [newGoal, setNewGoal] = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);

  // Editable checkpoints — { added: [], hidden: [titles], overrides: { [defaultTitle]: { title, detail } } }
  const [cpState, setCpState] = useState({ added: [], hidden: [], overrides: {} });
  const [newCPTitle, setNewCPTitle] = useState("");
  const [showCPInput, setShowCPInput] = useState(false);
  const [editingCP, setEditingCP] = useState(null); // { cp, title, detail } | null

  useEffect(() => {
    getCustomGoals(phase.num).then(setPhaseCustom);
  }, [phase.num]);

  useEffect(() => {
    getCustomCheckpoints(year, month).then((raw) => {
      // backward compat: 이전엔 array로 저장됐었음
      if (Array.isArray(raw)) setCpState({ added: raw, hidden: [], overrides: {} });
      else setCpState({
        added: raw?.added || [],
        hidden: raw?.hidden || [],
        overrides: raw?.overrides || {}
      });
    });
  }, [year, month]);

  const visibleGoals = [
    ...phase.goals.filter((g) => !phaseCustom.hidden.includes(g)),
    ...phaseCustom.added
  ];

  // 기본 체크포인트는 hidden 제외 + override 적용. 사용자가 추가한 건 그대로 뒤에.
  const visibleDefaults = defaultCheckpoints
    .filter((c) => !cpState.hidden.includes(c.title))
    .map((c) => {
      const ov = cpState.overrides[c.title];
      return ov
        ? { ...c, icon: ov.icon ?? c.icon, title: ov.title ?? c.title, detail: ov.detail ?? c.detail }
        : c;
    });
  const allCheckpoints = [
    ...visibleDefaults.map((c) => ({ ...c, _kind: "default", _key: c.title })),
    ...cpState.added.map((c, i) => ({ ...c, _kind: "added", _key: `added-${i}`, isCustom: true }))
  ];

  const addGoal = async () => {
    if (!newGoal.trim()) return;
    const next = { ...phaseCustom, added: [...phaseCustom.added, newGoal.trim()] };
    setPhaseCustom(next);
    await setCustomGoals(phase.num, next);
    setNewGoal("");
    setShowGoalInput(false);
  };

  const hideGoal = async (goal) => {
    const isCustom = phaseCustom.added.includes(goal);
    let next;
    if (isCustom) {
      next = { ...phaseCustom, added: phaseCustom.added.filter((g) => g !== goal) };
    } else {
      next = { ...phaseCustom, hidden: [...phaseCustom.hidden, goal] };
    }
    setPhaseCustom(next);
    await setCustomGoals(phase.num, next);
  };

  const saveCPs = async (next) => {
    setCpState(next);
    await setCustomCheckpoints(year, month, next);
  };

  const addCheckpoint = async () => {
    if (!newCPTitle.trim()) return;
    const next = {
      ...cpState,
      added: [...cpState.added, { icon: "📌", title: newCPTitle.trim(), detail: "" }]
    };
    await saveCPs(next);
    setNewCPTitle("");
    setShowCPInput(false);
  };

  const removeCheckpoint = async (cp) => {
    if (cp._kind === "default") {
      // 기본 항목: hidden 목록에 추가 (overrides도 같이 정리)
      const overrides = { ...cpState.overrides };
      delete overrides[cp._key];
      await saveCPs({ ...cpState, hidden: [...cpState.hidden, cp._key], overrides });
    } else {
      // 사용자 추가 항목: added 배열에서 제거
      const i = Number(String(cp._key).replace("added-", ""));
      const added = cpState.added.filter((_, j) => j !== i);
      await saveCPs({ ...cpState, added });
    }
  };

  const editCheckpoint = (cp) => {
    setEditingCP({ cp, icon: cp.icon || "📌", title: cp.title, detail: cp.detail || "" });
  };

  const saveCPEdit = async () => {
    if (!editingCP) return;
    const trimmedTitle = editingCP.title.trim();
    if (!trimmedTitle) return;
    const detail = editingCP.detail.trim();
    const icon = (editingCP.icon || "").trim() || "📌";
    const cp = editingCP.cp;

    if (cp._kind === "default") {
      const overrides = { ...cpState.overrides, [cp._key]: { icon, title: trimmedTitle, detail } };
      await saveCPs({ ...cpState, overrides });
    } else {
      const i = Number(String(cp._key).replace("added-", ""));
      const added = cpState.added.map((c, j) =>
        j === i ? { ...c, icon, title: trimmedTitle, detail } : c
      );
      await saveCPs({ ...cpState, added });
    }
    setEditingCP(null);
  };

  const resetDefaultCheckpoints = async () => {
    await saveCPs({ ...cpState, hidden: [], overrides: {} });
  };

  const goalDate = new Date(profile.goalDate);
  const monthsToGoal = Math.max(
    0,
    (goalDate.getFullYear() - year) * 12 + (goalDate.getMonth() + 1 - month)
  );
  const nwPct = Math.min(100, (netWorth / profile.goalAmount) * 100);
  const remaining = Math.max(0, profile.goalAmount - netWorth);

  // 변동지출 집계 (카테고리별 동적 합산)
  const expenseSums = useMemo(() => {
    const sums = { total: 0 };
    const knownKeys = new Set(allCategories.map((c) => c.key));
    for (const c of allCategories) sums[c.key] = 0;
    for (const e of expenses || []) {
      const raw = e.category;
      const cat = raw === "social" ? "leisure" : raw === "transit" ? "other" : raw;
      if (knownKeys.has(cat)) sums[cat] += e.amount;
      else sums.other = (sums.other || 0) + e.amount; // 고아 키는 기타지출로 합산
      sums.total += e.amount;
    }
    return sums;
  }, [expenses, allCategories]);

  // 변동지출 StatCard sub 에 상위 3개 카테고리 표시
  const topCategoriesText = useMemo(() => {
    const entries = allCategories
      .map((c) => ({ c, amt: expenseSums[c.key] || 0 }))
      .filter((x) => x.amt > 0)
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 3);
    if (entries.length === 0) return "아직 기록 없음";
    return entries.map(({ c, amt }) => `${c.icon} ${fmt(amt)}`).join(" · ");
  }, [allCategories, expenseSums]);

  // 위험 신호
  const cardTask = tasks.find((t) => t.label === "카드값");
  const cardActual = cardTask ? actuals[cardTask.id] : undefined;
  const debtTask = tasks.find((t) => t.type === "debt");
  const debtDelayed = debtTask && today.getDate() > 26 && !checks[debtTask.id];
  const risks = detectRisks({
    balance: monthRow?.balance,
    variableTotal: expenseSums.total,
    foodTotal: expenseSums.food,
    cardActual,
    debtDelayed,
    today
  });

  const saveNW = useCallback(async () => {
    setEditNW(false);
    if (nwDraft !== "" && !Number.isNaN(Number(nwDraft))) {
      await setNetWorth(nwDraft);
      setNW(Number(nwDraft));
    }
  }, [nwDraft]);

  return (
    <>
      <TopBar
        breadcrumb={["Finance", "Dashboard"]}
        title={profile.dashboardTitle || `${profile.name}의 메소창고`}
        subtitle={`오늘 ${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")} · 29세 순자산 1억 목표`}
      />

      {/* Risk banner */}
      {risks.length > 0 && (
        <div className="risk-stack">
          {risks.map((r) => (
            <div
              key={r.id}
              className="risk-item"
              style={{ background: r.meta.bg, borderColor: r.meta.color }}
            >
              <div
                className="risk-icon"
                style={{ background: r.meta.color, color: "#fff" }}
              >
                !
              </div>
              <div style={{ flex: 1 }}>
                <div className="risk-title" style={{ color: r.meta.color }}>
                  [{r.meta.label}] {r.title}
                </div>
                <div className="risk-detail">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 경제 멘토 위젯 (컴팩트) */}
      <div style={{ marginBottom: 16 }}>
        <MentorCard variant="compact" />
      </div>

      {/* Top overview row: Net worth (wider) + 3 stat cards stacked */}
      <div className="dashboard-overview" style={{ marginBottom: 16 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: R.textLight, marginBottom: 2 }}>현재 순자산</div>
            {editNW ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  className="modal-input"
                  value={nwDraft}
                  onChange={(e) => setNwDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveNW(); }}
                  style={{ width: 180, padding: "8px 12px", fontSize: 20 }}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={saveNW}>저장</button>
                <button className="btn btn-sm" onClick={() => setEditNW(false)}>취소</button>
              </div>
            ) : (
              <div
                style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, cursor: "pointer", color: R.textDark, lineHeight: 1.2 }}
                onClick={() => { setNwDraft(String(netWorth)); setEditNW(true); }}
              >
                {fmtWon(netWorth)}
              </div>
            )}
            <div style={{ fontSize: 11, color: R.textMid, marginTop: 3 }}>
              탭하여 수정
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: R.textLight }}>목표까지</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: R.rose500 }}>
              {fmt(remaining)}
            </div>
            <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>
              {monthsToGoal}개월 · 월 {fmt(Math.ceil(remaining / Math.max(1, monthsToGoal)))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="progress-track" style={{ height: 8 }}>
            <div
              className="progress-fill"
              style={{ width: `${nwPct}%`, background: `linear-gradient(90deg, ${R.rose400}, ${R.mint})` }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: R.textLight, marginTop: 4 }}>
            <span>0</span>
            <span>{nwPct.toFixed(1)}% 달성</span>
            <span>1억</span>
          </div>
        </div>

        {/* Quick nav — 다른 페이지 바로가기 */}
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: `1px solid ${R.border}`,
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8
        }}>
          <QuickNavCard icon="📅" label="자산 캘린더" sub="이번 달 일정" color={R.rose400} target="calendar" />
          <QuickNavCard icon="💸" label="지출 관리" sub={`이번 달 ${fmt(expenseSums.total)}`} color={R.warm} target="expenses" />
          <QuickNavCard icon="📰" label="오늘의 경제" sub="뉴스 · 멘토" color={R.lavender} target="economy" />
        </div>
      </div>

      {/* 4 stat cards stacked vertically */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
        {/* 여윳자금 (월별 기록) */}
        <div
          className="card-sm"
          style={{
            padding: "12px 14px",
            background: "linear-gradient(135deg, #FFF5F3 0%, #FFF0EC 100%)",
            borderColor: "#D4A0A0"
          }}
        >
          {/* 헤더: 타이틀 + 월 네비 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: R.textLight, fontWeight: 700, letterSpacing: 0.5 }}>
              💰 여윳자금 {!isCashCurrentMonth && <span style={{ color: R.rose500 }}>· 과거 기록</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => shiftCashMonth(-1)}
                style={{
                  width: 20, height: 20, border: "none", background: "rgba(255,255,255,0.7)",
                  borderRadius: 4, cursor: "pointer", fontSize: 11, color: R.textMid,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}
                title="이전 달"
              >‹</button>
              <div style={{ fontSize: 11, fontWeight: 700, color: R.textDark, minWidth: 62, textAlign: "center" }}>
                {cashY}.{String(cashM).padStart(2, "0")}
              </div>
              <button
                onClick={() => shiftCashMonth(1)}
                disabled={isCashCurrentMonth}
                style={{
                  width: 20, height: 20, border: "none",
                  background: isCashCurrentMonth ? "transparent" : "rgba(255,255,255,0.7)",
                  borderRadius: 4,
                  cursor: isCashCurrentMonth ? "default" : "pointer",
                  fontSize: 11, color: isCashCurrentMonth ? R.textLight : R.textMid,
                  opacity: isCashCurrentMonth ? 0.3 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}
                title="다음 달"
              >›</button>
            </div>
          </div>

          {/* 값 / 입력 */}
          {editCash ? (
            <div style={{ display: "flex", gap: 4 }}>
              <input
                type="number"
                className="modal-input"
                value={cashDraft}
                onChange={(e) => setCashDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setCashBalance(cashY, cashM, cashDraft === "" ? null : cashDraft);
                    setEditCash(false);
                  }
                  if (e.key === "Escape") setEditCash(false);
                }}
                autoFocus
                placeholder="잔고"
                style={{ flex: 1, padding: "4px 8px", fontSize: 14, fontWeight: 700 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setCashBalance(cashY, cashM, cashDraft === "" ? null : cashDraft); setEditCash(false); }}
                style={{ padding: "0 10px", height: 28 }}
              >✓</button>
            </div>
          ) : (
            <div
              onClick={() => {
                setCashDraft(cashSel?.amount != null ? String(cashSel.amount) : "");
                setEditCash(true);
              }}
              style={{ cursor: "pointer" }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: cashSel?.amount != null ? R.textDark : R.textLight }}>
                {cashSel?.amount != null ? fmt(cashSel.amount) : "탭하여 입력"}
              </div>
              {cashSel?.amount != null && cashSelPrev?.amount != null && (() => {
                const diff = cashSel.amount - cashSelPrev.amount;
                const color = diff > 0 ? R.mint : diff < 0 ? R.overBudget : R.textLight;
                return (
                  <div style={{ fontSize: 10, color, marginTop: 2, fontWeight: 600 }}>
                    전월 대비 {diff > 0 ? "+" : ""}{fmt(diff)}
                  </div>
                );
              })()}
              {cashSel?.amount == null && (
                <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>
                  {isCashCurrentMonth ? "월급 전날 잔고 기록" : "이 달은 기록 없음"}
                </div>
              )}
            </div>
          )}
        </div>

        <StatCard
          label="마통 상환"
          value={debtRemaining <= 0 ? "완납 ✓" : fmt(debtPaidTotal)}
          sub={debtRemaining <= 0 ? "" : `/ ${fmt(DEBT_TOTAL)} · 남은 ${fmt(debtRemaining)}`}
          pct={(debtPaidTotal / DEBT_TOTAL) * 100}
          color={debtRemaining <= 0 ? R.mint : R.lavender}
        />
        <StatCard
          label="이번 달 변동지출"
          value={fmt(expenseSums.total)}
          sub={topCategoriesText}
          pct={(expenseSums.total / 890000) * 100}
          color={expenseSums.total > 890000 ? R.overBudget : R.warm}
        />
        <StatCard
          label="이번 달 실행률"
          value={`${tasks.length > 0 ? Math.round((tasks.filter(t => checks[t.id]).length / tasks.length) * 100) : 0}%`}
          sub={`${tasks.filter(t => checks[t.id]).length}/${tasks.length} 완료`}
          pct={tasks.length > 0 ? (tasks.filter(t => checks[t.id]).length / tasks.length) * 100 : 0}
          color={R.mint}
        />
      </div>
      </div>{/* /dashboard-overview */}

      {/* YoY Chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">
          수입 · 지출 · 저축 추이
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="month"
              value={chartFrom}
              onChange={(e) => setChartFrom(e.target.value)}
              className="btn btn-sm"
              style={{ fontFamily: "inherit" }}
            />
            <span style={{ color: R.textLight, fontSize: 12 }}>~</span>
            <input
              type="month"
              value={chartTo}
              onChange={(e) => setChartTo(e.target.value)}
              className="btn btn-sm"
              style={{ fontFamily: "inherit" }}
            />
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={R.border} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: R.textLight }} />
              <YAxis
                tick={{ fontSize: 11, fill: R.textLight }}
                tickFormatter={(v) => fmt(v)}
                width={60}
              />
              <Tooltip
                formatter={(v, name) => [fmtWon(v), name]}
                labelStyle={{ fontWeight: 700, color: R.textDark }}
                contentStyle={{ borderRadius: 12, border: `1px solid ${R.border}`, fontSize: 12, background: "rgba(255,255,255,0.95)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line
                name="수입"
                dataKey="incomeActual"
                stroke={R.mint}
                strokeWidth={2}
                dot={{ r: 3, fill: R.mint }}
              />
              <Line
                name="총지출"
                dataKey="totalExpenseActual"
                stroke={R.rose400}
                strokeWidth={2}
                dot={{ r: 3, fill: R.rose400 }}
              />
              <Line
                name="저축"
                dataKey="savingsActual"
                stroke={R.lavender}
                strokeWidth={2.5}
                dot={{ r: 4, fill: R.lavender }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: R.textLight, fontSize: 13 }}>
            데이터를 입력하면 차트가 표시됩니다
          </div>
        )}
      </div>

      {/* 출석 도장 */}
      <AttendanceStrip
        attendanceDates={attendanceDates}
        today={today}
        year={year}
        month={month}
      />

      {/* Phase + 이번 달 체크포인트 + 카테고리 */}
      <div className="dashboard-bottom">
        <div className="card">
          <div className="section-title">
            현재 Phase: {phase.num}. {phase.name}
            <span className="section-meta">{phase.range}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {visibleGoals.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: R.textMid }}>
                <span style={{ flex: 1 }}>• {g}</span>
                <button
                  onClick={() => hideGoal(g)}
                  style={{ background: "none", border: "none", color: R.textLight, fontSize: 14, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}
                  title="삭제"
                >×</button>
              </div>
            ))}
          </div>
          {showGoalInput ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="modal-input"
                style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addGoal(); if (e.key === "Escape") setShowGoalInput(false); }}
                placeholder="새 목표 입력"
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={addGoal}>추가</button>
              <button className="btn btn-sm" onClick={() => setShowGoalInput(false)}>취소</button>
            </div>
          ) : (
            <button
              className="btn btn-sm"
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => setShowGoalInput(true)}
            >+ 목표 추가</button>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {userPhases.map((p) => (
              <div
                key={p.num}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 10,
                  background: p.num === phase.num ? R.lavenderLight : R.cream,
                  border: `1px solid ${p.num === phase.num ? R.lavender : R.border}`,
                  fontSize: 11
                }}
              >
                <div style={{ fontWeight: 700, color: p.num === phase.num ? R.lavender : R.textLight }}>
                  Phase {p.num}
                </div>
                <div style={{ color: R.textLight, marginTop: 2 }}>{p.name}</div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 8,
            background: R.cream, border: `1px dashed ${R.border}`,
            fontSize: 11, color: R.textLight, textAlign: "center"
          }}>
            메인 Phase 수정은 좌측 사이드바의 ⚙️ 프로필 편집에서 가능합니다.
          </div>
        </div>

        <div className="card">
          <div className="section-title">이번 달 체크포인트</div>
          {allCheckpoints.length === 0 && !showCPInput ? (
            <div style={{ fontSize: 13, color: R.textLight, padding: "12px 0" }}>
              이번 달은 특별한 이벤트가 없습니다.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allCheckpoints.map((c) => (
                <div key={c._key} style={{ display: "flex", gap: 10, padding: 10, background: R.cream, borderRadius: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{c.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{c.title}</div>
                    {c.detail && <div style={{ fontSize: 12, color: R.textMid, marginTop: 2 }}>{c.detail}</div>}
                  </div>
                  <button
                    onClick={() => editCheckpoint(c)}
                    style={{ background: "none", border: "none", color: R.textLight, fontSize: 13, padding: "2px 4px", flexShrink: 0 }}
                    title="수정"
                  >✏️</button>
                  <button
                    onClick={() => removeCheckpoint(c)}
                    style={{ background: "none", border: "none", color: R.textLight, fontSize: 14, padding: "2px 6px", flexShrink: 0 }}
                    title={c._kind === "default" ? "이번 달 목록에서 숨기기" : "삭제"}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          {showCPInput ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="modal-input"
                style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
                value={newCPTitle}
                onChange={(e) => setNewCPTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCheckpoint(); if (e.key === "Escape") setShowCPInput(false); }}
                placeholder="체크포인트 입력"
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={addCheckpoint}>추가</button>
              <button className="btn btn-sm" onClick={() => setShowCPInput(false)}>취소</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                className="btn btn-sm"
                style={{ flex: 1 }}
                onClick={() => setShowCPInput(true)}
              >+ 체크포인트 추가</button>
              {(cpState.hidden.length > 0 || Object.keys(cpState.overrides).length > 0) && (
                <button
                  className="btn btn-sm"
                  onClick={resetDefaultCheckpoints}
                  title="기본 체크포인트의 숨김/편집을 원복"
                >기본 복원</button>
              )}
            </div>
          )}
        </div>

      {/* 변동지출 카테고리 요약 */}
      <DashboardCategorySummary
        year={year}
        month={month}
        allCategories={allCategories}
        expenseSums={expenseSums}
        dashboardHidden={dashboardHidden || []}
        onToggle={toggleDashboardCategory}
        R={R}
      />
      </div>{/* /dashboard-bottom */}

      {editingCP && (
        <div className="modal-backdrop" onClick={() => setEditingCP(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-title">체크포인트 편집</div>
            <div className="modal-sub">
              {editingCP.cp._kind === "default"
                ? `기본 항목을 이번 달(${month}월)에만 다른 문구로 덮어쓰기 합니다.`
                : "사용자 추가 항목 수정"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: R.textMid, marginBottom: 4 }}>아이콘</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    className="modal-input"
                    style={{ width: 60, fontSize: 22, textAlign: "center", padding: "6px 4px" }}
                    value={editingCP.icon}
                    onChange={(e) => setEditingCP({ ...editingCP, icon: e.target.value })}
                    maxLength={4}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                    {["📌", "💼", "📊", "📋", "🧮", "🎯", "💰", "📈", "🛡️", "🎁", "🌸", "✨"].map((emo) => (
                      <button
                        key={emo}
                        onClick={() => setEditingCP({ ...editingCP, icon: emo })}
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          border: `1px solid ${editingCP.icon === emo ? R.rose400 : R.border}`,
                          background: editingCP.icon === emo ? "#FFF5F5" : "#fff",
                          cursor: "pointer", fontSize: 16, padding: 0,
                          fontFamily: "inherit"
                        }}
                      >{emo}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: R.textMid, marginBottom: 4 }}>제목</div>
                <input
                  className="modal-input"
                  value={editingCP.title}
                  onChange={(e) => setEditingCP({ ...editingCP, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCPEdit(); }}
                  autoFocus
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: R.textMid, marginBottom: 4 }}>상세 (선택)</div>
                <textarea
                  className="modal-input"
                  rows={3}
                  style={{ resize: "vertical", fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}
                  value={editingCP.detail}
                  onChange={(e) => setEditingCP({ ...editingCP, detail: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-sm" onClick={() => setEditingCP(null)}>취소</button>
              <button className="btn btn-primary btn-sm" onClick={saveCPEdit}>저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuickNavCard({ icon, label, sub, color, target }) {
  return (
    <button
      onClick={() => { window.location.hash = `/${target}`; }}
      style={{
        padding: "10px 12px", borderRadius: 10,
        background: "#fff", border: `1px solid ${R.border}`,
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 10,
        textAlign: "left", transition: "all 0.15s"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = R.border;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: color + "22", color: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, flexShrink: 0
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: R.textDark }}>{label}</div>
        <div style={{ fontSize: 10, color: R.textLight, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sub}
        </div>
      </div>
      <div style={{ fontSize: 16, color: R.textLight, flexShrink: 0 }}>›</div>
    </button>
  );
}

function StatCard({ label, value, sub, pct, color }) {
  return (
    <div className="card-sm" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: R.textLight }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, letterSpacing: -0.5, color: R.textDark }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: R.textMid, marginTop: 2 }}>{sub}</div>}
      <div className="progress-track" style={{ marginTop: 8, height: 4 }}>
        <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

function DashboardCategorySummary({ year, month, allCategories, expenseSums, dashboardHidden, onToggle, R }) {
  const [manage, setManage] = useState(false);
  const visible = allCategories.filter((c) => !dashboardHidden.includes(c.key));
  const hiddenList = allCategories.filter((c) => dashboardHidden.includes(c.key));

  return (
    <div className="card">
      <div className="section-title">
        카테고리별 지출
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="section-meta">{year}.{String(month).padStart(2, "0")}</span>
          <button
            className="btn btn-sm"
            onClick={() => setManage((v) => !v)}
            style={{
              padding: "0 10px", fontSize: 11,
              background: manage ? R.rose400 : "#fff",
              color: manage ? "#fff" : R.textMid,
              borderColor: manage ? R.rose400 : R.border
            }}
            title="대시보드에 표시할 카테고리 선택"
          >{manage ? "완료" : "✎ 표시 관리"}</button>
        </div>
      </div>

      {manage && (
        <div style={{
          fontSize: 11, color: R.textMid, background: R.cream,
          padding: "8px 10px", borderRadius: 8, marginBottom: 10,
          lineHeight: 1.5
        }}>
          체크된 카테고리만 대시보드에 표시됩니다. 기록 데이터는 유지됩니다.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(manage ? allCategories : visible).map((c) => {
          const amt = expenseSums[c.key] || 0;
          const pct = c.cap ? Math.min(100, (amt / c.cap) * 100) : 0;
          const over = c.cap && amt > c.cap;
          const isHidden = dashboardHidden.includes(c.key);
          return (
            <div
              key={c.key}
              onClick={manage ? () => onToggle(c.key) : undefined}
              style={{
                padding: 10, background: c.bg, borderRadius: 10,
                opacity: manage && isHidden ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 10,
                cursor: manage ? "pointer" : "default",
                border: manage ? `1.5px solid ${isHidden ? "transparent" : c.color}` : "1.5px solid transparent",
                transition: "all 0.15s"
              }}
            >
              {manage && (
                <div
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    border: `2px solid ${c.color}`,
                    background: isHidden ? "#fff" : c.color,
                    color: "#fff",
                    fontSize: 14, fontWeight: 800, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "none"
                  }}
                >{isHidden ? "" : "✓"}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 12, color: c.color, fontWeight: 700 }}>
                    {c.icon} {c.label}
                    {manage && (
                      <span style={{ fontSize: 10, color: R.textLight, fontWeight: 500, marginLeft: 8 }}>
                        {isHidden ? "· 숨김" : "· 표시 중"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: over ? R.overBudget : R.textDark }}>
                    {fmt(amt)}
                  </div>
                </div>
                {c.cap && (
                  <>
                    <div className="progress-track" style={{ marginTop: 6, height: 3 }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: over ? R.overBudget : c.color }} />
                    </div>
                    <div style={{ fontSize: 10, color: R.textLight, marginTop: 3 }}>
                      상한 {fmt(c.cap)}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {!manage && hiddenList.length > 0 && (
          <div style={{ fontSize: 10, color: R.textLight, textAlign: "center", padding: "4px 0" }}>
            · {hiddenList.length}개 카테고리 숨김 (표시 관리에서 조정)
          </div>
        )}
      </div>
    </div>
  );
}
