import { db, calcDebtPaidBefore, getUserProfile, getExpectedIncome } from "../db.js";
import { getTasksForMonth, getDaysInMonth } from "../schedule.js";

// 단일 월 집계: 고정 스케줄(실제/예상) + 변동지출(expenses)
export function aggregateMonth(tasks, checks, actuals, expenses) {
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

  for (const e of expenses || []) {
    result.variable += e.amount;
    result.hasAnyData = true;
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

    const agg = aggregateMonth(tasks, row.checks || {}, row.actualAmounts || {}, monthExpenses);

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
