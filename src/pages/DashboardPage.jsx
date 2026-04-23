import { useState, useMemo, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db, PROFILE,
  getMonthStatus, getNetWorth, setNetWorth,
  calcDebtPaidBefore, getExpensesForMonth,
  getCustomGoals, setCustomGoals,
  getCustomCheckpoints, setCustomCheckpoints,
  getMonthSchedule,
  getUserProfile, mergeProfile
} from "../db.js";
import { fmt, fmtWon, getTasksForMonth } from "../schedule.js";
import { currentPhaseFrom, getUserPhases } from "../lib/phase.js";
import { checkpointsForMonth } from "../lib/annual.js";
import { detectRisks } from "../lib/risks.js";
import { EXPENSE_CATEGORIES, mergeCategories } from "../lib/expenseCategories.js";
import { aggregateRange, aggregateWeeklyRange } from "../lib/aggregate.js";
import TopBar from "../components/TopBar.jsx";
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

  // Chart range
  const [chartMode, setChartMode] = useState("month"); // "month" | "week"
  const [chartFromMonth, setChartFromMonth] = useState(`${year}-01`);
  const [chartToMonth, setChartToMonth] = useState(`${year}-12`);
  const defaultFromDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 56); // 8주 전
    return d.toISOString().slice(0, 10);
  }, [today]);
  const defaultToDate = useMemo(() => today.toISOString().slice(0, 10), [today]);
  const [chartFromDate, setChartFromDate] = useState(defaultFromDate);
  const [chartToDate, setChartToDate] = useState(defaultToDate);
  const [chartData, setChartData] = useState([]);
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");

  useEffect(() => {
    (async () => {
      const v = await getNetWorth();
      if (v != null) setNW(v);
    })();
  }, []);

  useEffect(() => {
    // 온보딩 완료 후 프로필이 처음 로드되면 초기 순자산으로 세팅
    if (dbProfile && dbProfile.currentNetWorth != null) {
      getNetWorth().then((v) => {
        if (v == null || v === 0) setNW(dbProfile.currentNetWorth);
      });
    }
  }, [dbProfile?.currentNetWorth]);

  // Chart data reload when range or ANY relevant DB changes
  const allMonthlyForChart = useLiveQuery(() => db.monthly_status.toArray(), []);
  const allExpensesForChart = useLiveQuery(() => db.expenses.toArray(), []);
  const allSchedulesForChart = useLiveQuery(() => db.month_schedule.toArray(), []);
  const allSettingsForChart = useLiveQuery(() => db.settings.toArray(), []);
  useEffect(() => {
    if (
      allMonthlyForChart === undefined ||
      allExpensesForChart === undefined ||
      allSchedulesForChart === undefined ||
      allSettingsForChart === undefined
    ) return;
    let fy, fm, ty, tm;
    if (chartMode === "week") {
      const from = new Date(chartFromDate);
      const to = new Date(chartToDate);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) return;
      fy = from.getFullYear(); fm = from.getMonth() + 1;
      ty = to.getFullYear(); tm = to.getMonth() + 1;
    } else {
      const fromParts = chartFromMonth.split("-").map(Number);
      const toParts = chartToMonth.split("-").map(Number);
      fy = fromParts[0]; fm = fromParts[1];
      ty = toParts[0]; tm = toParts[1];
    }
    if (!fy || !fm || !ty || !tm) return;
    const fn = chartMode === "week" ? aggregateWeeklyRange : aggregateRange;
    fn(fy, fm, ty, tm).then((data) => {
      // week 모드: 선택 날짜 범위와 겹치는 주만 필터링
      if (chartMode === "week" && data[0]?.start) {
        const from = new Date(chartFromDate);
        const to = new Date(chartToDate);
        setChartData(data.filter((w) => {
          const wEnd = new Date(w.start);
          wEnd.setDate(wEnd.getDate() + 6);
          return wEnd >= from && w.start <= to;
        }));
      } else {
        setChartData(data);
      }
    });
  }, [
    chartFromMonth, chartToMonth, chartFromDate, chartToDate, chartMode,
    allMonthlyForChart, allExpensesForChart,
    allSchedulesForChart, allSettingsForChart
  ]);

  const allMonthly = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const monthRow = useLiveQuery(() => getMonthStatus(year, month), [year, month], null);
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
  const checks = monthRow?.checks || {};
  const actuals = monthRow?.actualAmounts || {};

  // 부채 총액 / 이번 달 상환
  const debtTotal = (dbProfile?.debtItems || []).reduce((s, d) => s + (Number(d.total) || 0), 0);
  const debtPaidBeforeSum = Object.values(debtPaidBefore || {}).reduce((a, b) => a + b, 0);
  const debtPaidThisMonth = tasks
    .filter((t) => t.type === "debt" && checks[t.id])
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const debtPaidTotal = Math.min(debtTotal, debtPaidBeforeSum + debtPaidThisMonth);
  const debtRemaining = Math.max(0, debtTotal - debtPaidTotal);

  const userPhases = useLiveQuery(() => getUserPhases(), [], []);
  const phase = currentPhaseFrom(userPhases, today);
  const defaultCheckpoints = checkpointsForMonth(month);

  // Editable phase goals
  const [phaseCustom, setPhaseCustom] = useState({ added: [], hidden: [] });
  const [newGoal, setNewGoal] = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);

  // Editable checkpoints
  const [customCPs, setCustomCPs] = useState([]);
  const [newCPTitle, setNewCPTitle] = useState("");
  const [showCPInput, setShowCPInput] = useState(false);

  useEffect(() => {
    getCustomGoals(phase.num).then(setPhaseCustom);
  }, [phase.num]);

  useEffect(() => {
    getCustomCheckpoints(year, month).then(setCustomCPs);
  }, [year, month]);

  const visibleGoals = [
    ...phase.goals.filter((g) => !phaseCustom.hidden.includes(g)),
    ...phaseCustom.added
  ];

  const allCheckpoints = [...defaultCheckpoints, ...customCPs];

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

  const addCheckpoint = async () => {
    if (!newCPTitle.trim()) return;
    const next = [...customCPs, { icon: "📌", title: newCPTitle.trim(), detail: "", isCustom: true }];
    setCustomCPs(next);
    await setCustomCheckpoints(year, month, next);
    setNewCPTitle("");
    setShowCPInput(false);
  };

  const removeCheckpoint = async (idx) => {
    const customStart = defaultCheckpoints.length;
    const customIdx = idx - customStart;
    if (customIdx < 0) return;
    const next = customCPs.filter((_, i) => i !== customIdx);
    setCustomCPs(next);
    await setCustomCheckpoints(year, month, next);
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
      else sums.other = (sums.other || 0) + e.amount;
      sums.total += e.amount;
    }
    return sums;
  }, [expenses, allCategories]);

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
        title={profile.dashboardTitle || `${profile.name}의 자산관리앱`}
        subtitle={
          profile.dashboardSubtitle ||
          `오늘 ${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}${profile.goalAmount ? ` · 목표 ${fmt(profile.goalAmount)}` : ""}`
        }
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

      {/* 3 stat cards stacked vertically */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
        <StatCard
          label="마통 상환"
          value={debtRemaining <= 0 ? "완납 ✓" : fmt(debtPaidTotal)}
          sub={debtRemaining <= 0 ? "" : `/ ${fmt(debtTotal)} · 남은 ${fmt(debtRemaining)}`}
          pct={(debtPaidTotal / debtTotal) * 100}
          color={debtRemaining <= 0 ? R.mint : R.lavender}
        />
        <StatCard
          label="이번 달 변동지출"
          value={fmt(expenseSums.total)}
          sub={topCategoriesText}
          pct={(expenseSums.total / (profile.expenseBudgetCap || 890000)) * 100}
          color={expenseSums.total > (profile.expenseBudgetCap || 890000) ? R.overBudget : R.warm}
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: "#F3F4F6", borderRadius: 8, padding: 2 }}>
              {[
                { key: "month", label: "월별" },
                { key: "week", label: "주간" }
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setChartMode(m.key)}
                  style={{
                    padding: "4px 12px", borderRadius: 6,
                    background: chartMode === m.key ? "#fff" : "transparent",
                    border: "none", fontSize: 12, fontWeight: 600,
                    color: chartMode === m.key ? R.textDark : R.textMid,
                    cursor: "pointer", boxShadow: chartMode === m.key ? "0 1px 2px rgba(0,0,0,0.08)" : "none"
                  }}
                >{m.label}</button>
              ))}
            </div>
            {chartMode === "week" ? (
              <>
                <input
                  type="date"
                  value={chartFromDate}
                  onChange={(e) => setChartFromDate(e.target.value)}
                  className="btn btn-sm"
                  style={{ fontFamily: "inherit" }}
                />
                <span style={{ color: R.textLight, fontSize: 12 }}>~</span>
                <input
                  type="date"
                  value={chartToDate}
                  onChange={(e) => setChartToDate(e.target.value)}
                  className="btn btn-sm"
                  style={{ fontFamily: "inherit" }}
                />
              </>
            ) : (
              <>
                <input
                  type="month"
                  value={chartFromMonth}
                  onChange={(e) => setChartFromMonth(e.target.value)}
                  className="btn btn-sm"
                  style={{ fontFamily: "inherit" }}
                />
                <span style={{ color: R.textLight, fontSize: 12 }}>~</span>
                <input
                  type="month"
                  value={chartToMonth}
                  onChange={(e) => setChartToMonth(e.target.value)}
                  className="btn btn-sm"
                  style={{ fontFamily: "inherit" }}
                />
              </>
            )}
          </div>
        </div>

        {/* Y축 범위 조정 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 11, color: R.textMid }}>
          <span>Y축 범위:</span>
          <input
            type="number"
            placeholder="최소 (자동)"
            value={yMin}
            onChange={(e) => setYMin(e.target.value)}
            className="btn btn-sm"
            style={{ width: 110, padding: "0 8px", fontFamily: "inherit", fontWeight: 500 }}
          />
          <span style={{ color: R.textLight }}>~</span>
          <input
            type="number"
            placeholder="최대 (자동)"
            value={yMax}
            onChange={(e) => setYMax(e.target.value)}
            className="btn btn-sm"
            style={{ width: 110, padding: "0 8px", fontFamily: "inherit", fontWeight: 500 }}
          />
          {(yMin !== "" || yMax !== "") && (
            <button
              className="btn btn-sm"
              onClick={() => { setYMin(""); setYMax(""); }}
              style={{ padding: "0 10px" }}
            >초기화</button>
          )}
        </div>

        {chartData.length > 0 && chartData.some((m) => m.hasAnyData) ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={R.border} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: R.textLight }} />
              <YAxis
                tick={{ fontSize: 11, fill: R.textLight }}
                tickFormatter={(v) => fmt(v)}
                width={60}
                domain={[
                  yMin !== "" && !isNaN(Number(yMin)) ? Number(yMin) : "auto",
                  yMax !== "" && !isNaN(Number(yMax)) ? Number(yMax) : "auto"
                ]}
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
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: R.textLight, fontSize: 13, textAlign: "center", padding: "0 24px", whiteSpace: "pre-line", lineHeight: 1.6 }}>
            {dbProfile
              ? "선택한 기간에 표시할 데이터가 없습니다.\nCalendar에서 이벤트를 추가하거나 Expenses에 지출을 기록해 보세요."
              : "온보딩을 완료하면 수입·지출·저축 추이가 표시됩니다."}
          </div>
        )}
      </div>

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
        </div>

        <div className="card">
          <div className="section-title">이번 달 체크포인트</div>
          {allCheckpoints.length === 0 && !showCPInput ? (
            <div style={{ fontSize: 13, color: R.textLight, padding: "12px 0" }}>
              이번 달은 특별한 이벤트가 없습니다.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allCheckpoints.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: 10, background: R.cream, borderRadius: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{c.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{c.title}</div>
                    {c.detail && <div style={{ fontSize: 12, color: R.textMid, marginTop: 2 }}>{c.detail}</div>}
                  </div>
                  {c.isCustom && (
                    <button
                      onClick={() => removeCheckpoint(i)}
                      style={{ background: "none", border: "none", color: R.textLight, fontSize: 14, padding: "2px 6px", flexShrink: 0 }}
                      title="삭제"
                    >×</button>
                  )}
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
            <button
              className="btn btn-sm"
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => setShowCPInput(true)}
            >+ 체크포인트 추가</button>
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
