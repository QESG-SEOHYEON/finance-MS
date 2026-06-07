// 순자산 자동 계산.
// 카테고리/Task type별 부호 + 유동성 분류 → 총자산 / 즉시 인출 / 묶인 자산 분리.

import { db, calcDebtPaidBefore, getUserProfile } from "../db.js";
import { getTasksForMonth } from "../schedule.js";

// 캘린더 task type별 매핑 (schedule.js의 5가지 type)
// invest는 단순 이동 관점으로 0 (현금→투자 위치만 바뀐 것으로 봄)
export const TASK_TYPE_META = {
  income:  { sign: +1, liquid: true },
  fixed:   { sign: -1, liquid: true },
  invest:  { sign:  0, liquid: false },  // 자산 형태만 바뀜 (현금↓ 투자↑)
  debt:    { sign: +1, liquid: false },  // 부채 감소 → 순자산 +
  general: { sign: -1, liquid: true }
};

// 카테고리 nwImpact별 매핑 (6종)
export const CAT_IMPACT_META = {
  liquid_asset: { sign: +1, liquid: true,  label: "유동 자산↑" },
  locked_asset: { sign: +1, liquid: false, label: "묶인 자산↑" },
  debt_down:    { sign: +1, liquid: false, label: "부채 감소" },
  income:       { sign: +1, liquid: true,  label: "수입" },
  expense:      { sign: -1, liquid: true,  label: "지출/소비" },
  neutral:      { sign:  0, liquid: false, label: "중립" }
};

export const CAT_IMPACT_KEYS = Object.keys(CAT_IMPACT_META);

// 카테고리 객체에서 nwImpact 추출 (없으면 expense fallback)
export function getNwImpact(category) {
  if (!category) return "expense";
  if (typeof category === "string") return "expense";
  return category.nwImpact || "expense";
}

// 모든 expenses 합산 + 모든 monthly_status actualAmounts 합산
// initialNW, initialLiquid는 사용자가 onboarding/수동 입력한 기준값
// tasks: 현재 월 task (legacy). 더 정확한 계산을 위해 내부에서 모든 월 schedule을 모은다.
export async function computeNetWorth({ initialNW, initialLiquid, categories, tasks }) {
  const expensesAll = await db.expenses.toArray();
  const monthlyAll = await db.monthly_status.toArray();
  const schedulesAll = await db.month_schedule.toArray();
  const settingsAll = await db.settings.toArray();
  const profile = await getUserProfile();

  // expected-income-{y}-{m} 맵 (프로필 기반 수입 task 생성에 필요)
  const expectedIncomeByMonth = {};
  for (const s of settingsAll) {
    const mt = s.id && s.id.match(/^expected-income-(\d+)-(\d+)$/);
    if (mt) expectedIncomeByMonth[`${Number(mt[1])}-${Number(mt[2])}`] = s.value || {};
  }
  const scheduleByMonth = {};
  for (const s of schedulesAll) scheduleByMonth[s.id] = s;

  // 모든 월의 task 정의를 ID로 인덱싱.
  // GH는 프로필 기반으로 매월 income/debt task를 런타임 생성하므로,
  // monthly_status 가 있는 모든 월에 대해 getTasksForMonth 로 task 를 복원해 인덱싱한다.
  const taskById = {};
  for (const t of tasks || []) taskById[t.id] = t;
  for (const m of monthlyAll) {
    const mk = m.id; // "YYYY-M"
    const [yy, mm] = String(mk).split("-").map(Number);
    if (!yy || !mm) continue;
    const debtPaidBefore = calcDebtPaidBefore(monthlyAll, profile, yy, mm);
    const monthTasks = getTasksForMonth(yy, mm, {
      profile,
      customSchedule: scheduleByMonth[mk],
      expectedIncomeThisMonth: expectedIncomeByMonth[mk] || {},
      debtPaidBefore
    });
    for (const t of monthTasks) taskById[t.id] = t;
  }
  // month_schedule.added 도 보강 (혹시 누락분)
  for (const s of schedulesAll) {
    for (const t of (s?.added || [])) taskById[t.id] = t;
  }

  // 카테고리 key → nwImpact 매핑 테이블 (시스템 + 커스텀)
  const catImpactByKey = {};
  for (const c of categories || []) {
    catImpactByKey[c.key] = c.nwImpact || "expense";
  }

  // breakdown: 카테고리 영향별 누적
  const breakdown = {};
  for (const k of CAT_IMPACT_KEYS) breakdown[k] = 0;
  let taskTotal = 0;
  let taskLiquidDelta = 0;

  // 1) expenses 합산
  let expenseTotal = 0;
  let expenseLiquidDelta = 0;
  for (const e of expensesAll) {
    const impactKey = catImpactByKey[e.category] || "expense";
    const meta = CAT_IMPACT_META[impactKey];
    if (!meta) continue;
    const amount = Number(e.amount) || 0;
    breakdown[impactKey] += amount;
    expenseTotal += amount * meta.sign;
    if (meta.liquid) expenseLiquidDelta += amount * meta.sign;
  }

  // 2) 캘린더 task 합산 (모든 월 누적) — 카테고리 자산 종류가 있으면 그게 우선
  // - actualAmount 입력되어 있으면 그 값
  // - 없는데 체크되어 있으면 task.amount(계획값) 으로 fallback
  for (const m of monthlyAll) {
    const actuals = m.actualAmounts || {};
    const checks = m.checks || {};
    const seenIds = new Set();
    for (const taskId in actuals) {
      seenIds.add(taskId);
      const task = taskById[taskId];
      if (!task) continue;
      let meta;
      const catImpactKey = task.category ? catImpactByKey[task.category] : null;
      meta = catImpactKey ? CAT_IMPACT_META[catImpactKey] : TASK_TYPE_META[task.type];
      if (!meta) continue;
      const amount = Math.abs(Number(actuals[taskId]) || 0);
      taskTotal += amount * meta.sign;
      if (meta.liquid) taskLiquidDelta += amount * meta.sign;
    }
    // 체크되어 있는데 actualAmount 미입력인 task는 계획값으로 fallback
    for (const taskId in checks) {
      if (!checks[taskId] || seenIds.has(taskId)) continue;
      const task = taskById[taskId];
      if (!task) continue;
      let meta;
      const catImpactKey = task.category ? catImpactByKey[task.category] : null;
      meta = catImpactKey ? CAT_IMPACT_META[catImpactKey] : TASK_TYPE_META[task.type];
      if (!meta) continue;
      const amount = Math.abs(Number(task.amount) || 0);
      taskTotal += amount * meta.sign;
      if (meta.liquid) taskLiquidDelta += amount * meta.sign;
    }
  }

  const totalDelta = expenseTotal + taskTotal;
  const liquidDelta = expenseLiquidDelta + taskLiquidDelta;

  const total = (initialNW || 0) + totalDelta;
  const liquid = (initialLiquid || 0) + liquidDelta;
  const locked = total - liquid;

  return {
    total,
    liquid,
    locked,
    breakdown,
    totalDelta,
    liquidDelta
  };
}
