import { db, calcDebtPaidBefore, getUserProfile, getExpectedIncome } from "../db.js";
import { getTasksForMonth, getDaysInMonth } from "../schedule.js";

// 단일 월 집계: 고정 스케줄(실제/예상) + 변동지출(expenses)
// catImpactByKey: { [categoryKey]: nwImpact } — 없으면 expense fallback
export function aggregateMonth(tasks, checks, actuals, expenses, catImpactByKey = {}) {
  const result = {
    income: 0, incomeActual: 0,
    fixed: 0, fixedActual: 0,
    invest: 0, investActual: 0,
    debt: 0, debtActual: 0,
    general: 0, generalActual: 0,
    variable: 0,
    totalExpense: 0, totalExpenseActual: 0,
    savings: 0, savingsActual: 0,
    hasAnyData: false
  };

  for (const t of tasks) {
    const actual = actuals[t.id];
    const hasActual = actual !== undefined && actual !== null;
    const plannedAbs = Math.abs(t.amount);
    const actualAbs = hasActual ? Math.abs(Number(actual)) : plannedAbs;

    switch (t.type) {
      case "income":
        result.income += plannedAbs;
        result.incomeActual += actualAbs;
        if (plannedAbs > 0 || hasActual) result.hasAnyData = true;
        break;
      case "fixed":
        result.fixed += plannedAbs;
        result.fixedActual += actualAbs;
        result.hasAnyData = true;
        break;
      case "invest":
        result.invest += plannedAbs;
        result.investActual += actualAbs;
        result.hasAnyData = true;
        break;
      case "debt":
        result.debt += plannedAbs;
        result.debtActual += actualAbs;
        result.hasAnyData = true;
        break;
      case "general":
      case "variable":
        result.general += plannedAbs;
        result.generalActual += actualAbs;
        result.hasAnyData = true;
        break;
    }
  }

  // 변동지출 — 자산 종류가 "지출"인 카테고리만 variable 합산.
  // 수입 카테고리는 income 으로 라우팅. 자산/부채/중립은 차트 미반영.
  for (const e of expenses || []) {
    const impact = catImpactByKey[e.category] || "expense";
    if (impact === "expense") {
      result.variable += e.amount;
      result.hasAnyData = true;
    } else if (impact === "income") {
      result.income += e.amount;
      result.incomeActual += e.amount;
      result.hasAnyData = true;
    }
  }

  result.totalExpense = result.fixed + result.invest + result.debt + result.general + result.variable;
  result.totalExpenseActual = result.fixedActual + result.investActual + result.debtActual + result.generalActual + result.variable;

  result.savings = result.income - result.totalExpense;
  result.savingsActual = result.incomeActual - result.totalExpenseActual;

  return result;
}

// 여러 달 범위 집계 (차트용)
export async function aggregateRange(startYear, startMonth, endYear, endMonth) {
  const [profile, allMonthly, allExpenses, allSchedules, allSettings] = await Promise.all([
    getUserProfile(),
    db.monthly_status.toArray(),
    db.expenses.toArray(),
    db.month_schedule.toArray(),
    db.settings.toArray()
  ]);

  // 변동수입 월별 맵 로드
  const expectedIncomeByMonth = {};
  for (const s of allSettings) {
    const match = s.id.match(/^expected-income-(\d+)-(\d+)$/);
    if (match) expectedIncomeByMonth[`${Number(match[1])}-${Number(match[2])}`] = s.value || {};
  }
  const catImpactByKey = buildCatImpactByKey(allSettings);

  const months = [];
  let y = startYear, m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const monthKey = `${y}-${m}`;
    const row = allMonthly.find((r) => r.id === monthKey) || { checks: {}, actualAmounts: {} };
    const schedule = allSchedules.find((s) => s.id === monthKey);
    const debtPaidBefore = calcDebtPaidBefore(allMonthly, profile, y, m);
    const expectedIncomeThisMonth = expectedIncomeByMonth[monthKey] || {};

    const tasks = getTasksForMonth(y, m, {
      profile,
      customSchedule: schedule,
      expectedIncomeThisMonth,
      debtPaidBefore
    });

    const mm = String(m).padStart(2, "0");
    const prefix = `${y}-${mm}`;
    const monthExpenses = allExpenses.filter((e) => e.date && e.date.startsWith(prefix));

    const agg = aggregateMonth(tasks, row.checks || {}, row.actualAmounts || {}, monthExpenses, catImpactByKey);

    months.push({
      key: monthKey,
      label: `${y}.${mm}`,
      year: y,
      month: m,
      ...agg
    });

    m++;
    if (m > 12) { m = 1; y++; }
  }

  return months;
}

// ISO 주 계산 (월요일 시작)
function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function formatYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekLabel(d) {
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 주간 집계 — [startYear, startMonth, endYear, endMonth] 기간을 주 단위로 쪼개서
 * 각 주의 수입/지출/저축 합산 반환.
 */
export async function aggregateWeeklyRange(startYear, startMonth, endYear, endMonth) {
  const [profile, allMonthly, allExpenses, allSchedules, allSettings] = await Promise.all([
    getUserProfile(),
    db.monthly_status.toArray(),
    db.expenses.toArray(),
    db.month_schedule.toArray(),
    db.settings.toArray()
  ]);

  const expectedIncomeByMonth = {};
  for (const s of allSettings) {
    const match = s.id.match(/^expected-income-(\d+)-(\d+)$/);
    if (match) expectedIncomeByMonth[`${Number(match[1])}-${Number(match[2])}`] = s.value || {};
  }

  // 기간 전체 범위 만들기
  const rangeStart = new Date(startYear, startMonth - 1, 1);
  const rangeEnd = new Date(endYear, endMonth, 0); // 말일

  // 각 월의 task 목록을 한 번씩 생성 (재활용)
  const tasksPerMonth = new Map();
  const monthKeysInRange = new Set();
  {
    let y = startYear, m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const monthKey = `${y}-${m}`;
      monthKeysInRange.add(monthKey);
      const row = allMonthly.find((r) => r.id === monthKey) || { checks: {}, actualAmounts: {} };
      const schedule = allSchedules.find((s) => s.id === monthKey);
      const debtPaidBefore = calcDebtPaidBefore(allMonthly, profile, y, m);
      const expectedIncomeThisMonth = expectedIncomeByMonth[monthKey] || {};
      const tasks = getTasksForMonth(y, m, {
        profile, customSchedule: schedule, expectedIncomeThisMonth, debtPaidBefore
      });
      tasksPerMonth.set(monthKey, { tasks, checks: row.checks || {}, actuals: row.actualAmounts || {} });
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }

  // 주별 버킷 초기화
  const weeks = [];
  let cursor = startOfWeek(rangeStart);
  // 기간 시작의 주가 범위 이전일 수 있음 → 범위 내 주만 만들되, 첫 주가 포함되면 포함
  while (cursor <= rangeEnd) {
    weeks.push({
      start: new Date(cursor),
      key: formatYMD(cursor),
      label: weekLabel(cursor),
      income: 0, incomeActual: 0,
      totalExpense: 0, totalExpenseActual: 0,
      variable: 0,
      hasAnyData: false
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  const bucketOfDate = (d) => {
    const wStart = startOfWeek(d);
    return weeks.find((w) => w.key === formatYMD(wStart));
  };

  // Task를 주별로 배분
  for (const monthKey of monthKeysInRange) {
    const [y, m] = monthKey.split("-").map(Number);
    const { tasks, actuals } = tasksPerMonth.get(monthKey);
    for (const t of tasks) {
      const d = new Date(y, m - 1, t.day);
      const bucket = bucketOfDate(d);
      if (!bucket) continue;
      const actual = actuals[t.id];
      const hasActual = actual !== undefined && actual !== null;
      const plannedAbs = Math.abs(t.amount);
      const actualAbs = hasActual ? Math.abs(Number(actual)) : plannedAbs;
      if (t.type === "income") {
        bucket.income += plannedAbs;
        bucket.incomeActual += actualAbs;
      } else {
        bucket.totalExpense += plannedAbs;
        bucket.totalExpenseActual += actualAbs;
      }
      if (plannedAbs > 0 || hasActual) bucket.hasAnyData = true;
    }
  }

  // 변동지출 (expenses)을 주별로 배분
  for (const e of allExpenses) {
    if (!e.date) continue;
    const d = new Date(e.date);
    if (d < weeks[0]?.start || d > rangeEnd) continue;
    const bucket = bucketOfDate(d);
    if (!bucket) continue;
    bucket.variable += e.amount;
    bucket.totalExpense += e.amount;
    bucket.totalExpenseActual += e.amount;
    bucket.hasAnyData = true;
  }

  // 저축 계산
  for (const w of weeks) {
    w.savings = w.income - w.totalExpense;
    w.savingsActual = w.incomeActual - w.totalExpenseActual;
  }

  return weeks;
}

// ---------- v2: 카테고리 자산 종류 맵 / 연 단위 / 일 단위 집계 ----------

// settings 배열에서 category-overrides + custom-categories 의 nwImpact 맵 생성
function buildCatImpactByKey(allSettings) {
  const overridesRow = allSettings.find((s) => s.id === "category-overrides");
  const customRow = allSettings.find((s) => s.id === "custom-categories");
  const overrides = overridesRow?.value || {};
  const customs = Array.isArray(customRow?.value) ? customRow.value : [];
  const map = {
    food: overrides.food?.nwImpact || "expense",
    leisure: overrides.leisure?.nwImpact || "expense",
    other: overrides.other?.nwImpact || "expense"
  };
  for (const c of customs) map[c.key] = c.nwImpact || "expense";
  return map;
}

// 월별 집계 결과를 연 단위로 합산
export function rollupByYear(monthData) {
  const map = new Map();
  const numericKeys = [
    "income", "incomeActual", "fixed", "fixedActual",
    "invest", "investActual", "debt", "debtActual",
    "general", "generalActual", "variable",
    "totalExpense", "totalExpenseActual",
    "savings", "savingsActual"
  ];
  for (const d of monthData) {
    let cur = map.get(d.year);
    if (!cur) {
      cur = { key: `${d.year}`, label: `${d.year}`, year: d.year, month: null };
      for (const k of numericKeys) cur[k] = 0;
      map.set(d.year, cur);
    }
    for (const k of numericKeys) cur[k] += d[k] || 0;
  }
  return Array.from(map.values()).sort((a, b) => a.year - b.year);
}

// 일 단위 집계 (range 안의 모든 일자 펼치기)
export async function aggregateDays(startYear, startMonth, endYear, endMonth) {
  const [profile, allMonthly, allExpenses, allSchedules, allSettings] = await Promise.all([
    getUserProfile(),
    db.monthly_status.toArray(),
    db.expenses.toArray(),
    db.month_schedule.toArray(),
    db.settings.toArray()
  ]);

  const expectedIncomeByMonth = {};
  for (const s of allSettings) {
    const match = s.id.match(/^expected-income-(\d+)-(\d+)$/);
    if (match) expectedIncomeByMonth[`${Number(match[1])}-${Number(match[2])}`] = s.value || {};
  }
  const catImpactByKey = buildCatImpactByKey(allSettings);

  const out = [];
  let y = startYear, m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const monthKey = `${y}-${m}`;
    const row = allMonthly.find((r) => r.id === monthKey) || { checks: {}, actualAmounts: {} };
    const schedule = allSchedules.find((s) => s.id === monthKey);
    const debtPaidBefore = calcDebtPaidBefore(allMonthly, profile, y, m);
    const tasks = getTasksForMonth(y, m, {
      profile,
      customSchedule: schedule,
      expectedIncomeThisMonth: expectedIncomeByMonth[monthKey] || {},
      debtPaidBefore
    });
    const checks = row.checks || {};
    const actuals = row.actualAmounts || {};
    const mm = String(m).padStart(2, "0");
    const monthExpenses = allExpenses.filter((e) => e.date && e.date.startsWith(`${y}-${mm}`));
    const dim = new Date(y, m, 0).getDate();

    for (let d = 1; d <= dim; d++) {
      const dd = String(d).padStart(2, "0");
      const dateStr = `${y}-${mm}-${dd}`;
      const dayTasks = tasks.filter((t) => t.day === d);
      const dayExpenses = monthExpenses.filter((e) => e.date === dateStr);
      const agg = aggregateMonth(dayTasks, checks, actuals, dayExpenses, catImpactByKey);
      out.push({
        key: dateStr,
        label: `${m}/${d}`,
        year: y, month: m, day: d,
        ...agg
      });
    }
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
