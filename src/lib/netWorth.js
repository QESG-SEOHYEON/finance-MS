// 순자산 자동 계산 (이체식 / double-entry, 4버킷).
//   순자산(total) = 현금(liquid) + 투자(invested) − 부채(debt)
// 각 거래를 (총자산Δ, 현금Δ, 부채Δ) 3축으로 기록. 투자Δ = 총자산Δ − 현금Δ + 부채Δ.

import { db, calcDebtPaidBefore, getUserProfile } from "../db.js";
import { getTasksForMonth } from "../schedule.js";
import { computeDebtBalances } from "./debt.js";

// 캘린더 task type별 매핑 (schedule.js의 5가지 type)
export const TASK_TYPE_META = {
  income:  { totalSign: +1, liquidSign: +1, debtSign:  0, label: "수입" },
  fixed:   { totalSign: -1, liquidSign: -1, debtSign:  0, label: "고정지출" },
  invest:  { totalSign:  0, liquidSign: -1, debtSign:  0, label: "투자(묶인 자산)" },
  debt:    { totalSign:  0, liquidSign: -1, debtSign: -1, label: "부채 상환" },
  general: { totalSign: -1, liquidSign: -1, debtSign:  0, label: "일반 지출" }
};

// 카테고리 nwImpact별 매핑 (8종)
export const CAT_IMPACT_META = {
  income:        { totalSign: +1, liquidSign: +1, debtSign:  0, label: "수입" },
  liquid_asset:  { totalSign: +1, liquidSign: +1, debtSign:  0, label: "유동 자산↑" },
  expense:       { totalSign: -1, liquidSign: -1, debtSign:  0, label: "지출/소비" },
  locked_asset:  { totalSign:  0, liquidSign: -1, debtSign:  0, label: "묶인 자산↑" },
  debt_down:     { totalSign:  0, liquidSign: -1, debtSign: -1, label: "부채 상환" },
  debt_up_cash:  { totalSign:  0, liquidSign: +1, debtSign: +1, label: "대출↑ (현금으로)" },
  debt_up_asset: { totalSign:  0, liquidSign:  0, debtSign: +1, label: "대출↑ (자산으로)" },
  neutral:       { totalSign:  0, liquidSign:  0, debtSign:  0, label: "중립" }
};

export const CAT_IMPACT_KEYS = Object.keys(CAT_IMPACT_META);

export function getNwImpact(category) {
  if (!category) return "expense";
  if (typeof category === "string") return "expense";
  return category.nwImpact || "expense";
}

export function entryBucketDeltas(e) {
  return {
    total: e.totalDelta,
    liquid: e.liquidDelta,
    invested: e.totalDelta - e.liquidDelta + e.debtDelta,
    debt: e.debtDelta
  };
}

export async function computeNetWorth({ initialNW, initialLiquid, initialDebt, debtItems, categories, tasks }) {
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

  // GH는 프로필 기반으로 매월 income/debt task를 런타임 생성하므로, 모든 월에 대해 복원해 인덱싱.
  const taskById = {};
  for (const t of tasks || []) taskById[t.id] = t;
  for (const m of monthlyAll) {
    const mk = m.id;
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
  for (const s of schedulesAll) {
    for (const t of (s?.added || [])) taskById[t.id] = t;
  }

  const catImpactByKey = {};
  const catLabelByKey = {};
  for (const c of categories || []) {
    catImpactByKey[c.key] = c.nwImpact || "expense";
    catLabelByKey[c.key] = c.label;
  }

  const entries = [];
  let totalDelta = 0, liquidDelta = 0, debtDelta = 0;
  const breakdown = {};
  for (const k of CAT_IMPACT_KEYS) breakdown[k] = 0;

  const push = (e) => {
    totalDelta += e.totalDelta;
    liquidDelta += e.liquidDelta;
    debtDelta += e.debtDelta;
    if (breakdown[e.impactKey] !== undefined) breakdown[e.impactKey] += e.amount;
    entries.push(e);
  };

  // 1) 변동지출 (expenses)
  for (const e of expensesAll) {
    const impactKey = catImpactByKey[e.category] || "expense";
    const meta = CAT_IMPACT_META[impactKey];
    if (!meta) continue;
    const amount = Math.abs(Number(e.amount) || 0);
    push({
      date: String(e.date || "").slice(0, 10),
      category: e.category,
      categoryLabel: catLabelByKey[e.category] || e.category || "(없음)",
      label: e.memo || e.subcategory || "지출",
      amount,
      impactKey,
      impactLabel: meta.label,
      totalDelta: amount * meta.totalSign,
      liquidDelta: amount * meta.liquidSign,
      debtDelta: amount * meta.debtSign,
      source: "expense"
    });
  }

  // 2) 캘린더 task (actualAmount 우선, 없고 체크되면 계획값 fallback)
  for (const m of monthlyAll) {
    const [y, mo] = String(m.id).split("-").map(Number);
    const mm = mo ? String(mo).padStart(2, "0") : "01";
    const actuals = m.actualAmounts || {};
    const checks = m.checks || {};
    const seen = new Set();

    const handle = (taskId, rawAmount) => {
      const task = taskById[taskId];
      if (!task) return;
      const catKey = task.category ? catImpactByKey[task.category] : null;
      const directKey = !catKey && task.nwImpact ? task.nwImpact : null;
      const meta = catKey ? CAT_IMPACT_META[catKey] : directKey ? CAT_IMPACT_META[directKey] : TASK_TYPE_META[task.type];
      if (!meta) return;
      const amount = Math.abs(Number(rawAmount) || 0);
      const dd = task.day ? String(task.day).padStart(2, "0") : "01";
      // 카테고리 없는 task(월급·반복지출 등)는 라벨별로 묶고 "라벨 · 자산종류"로 표기
      const noCat = !task.category;
      push({
        date: (y && mo) ? `${y}-${mm}-${dd}` : String(m.id),
        category: task.category || `_lbl:${task.label || "항목"}`,
        categoryLabel: noCat ? `${task.label || "항목"} · ${meta.label}` : (catLabelByKey[task.category] || task.category),
        label: task.label || "항목",
        amount,
        impactKey: catKey || directKey || `task:${task.type}`,
        impactLabel: meta.label || "기타",
        totalDelta: amount * meta.totalSign,
        liquidDelta: amount * meta.liquidSign,
        debtDelta: amount * meta.debtSign,
        source: "task"
      });
    };

    for (const taskId in actuals) { seen.add(taskId); handle(taskId, actuals[taskId]); }
    for (const taskId in checks) {
      if (!checks[taskId] || seen.has(taskId)) continue;
      const t = taskById[taskId];
      if (t) handle(taskId, t.amount);
    }
  }

  const total = (initialNW || 0) + totalDelta;
  const liquid = (initialLiquid || 0) + liquidDelta;

  // 부채: debtItems 가 주어지면 대출별 잔액 합 단일 소스. 없으면 레거시 폴백.
  const debtBalances = debtItems ? computeDebtBalances(debtItems, monthlyAll) : null;
  const balanceSum = debtBalances ? debtBalances.reduce((s, d) => s + d.balance, 0) : null;
  const totalsSum = debtBalances ? debtBalances.reduce((s, d) => s + d.total, 0) : 0;
  const debt = balanceSum != null ? balanceSum : ((initialDebt || 0) + debtDelta);
  const invested = total - liquid + debt;

  return {
    total, liquid, invested, debt,
    totalDelta, liquidDelta, debtDelta,
    initialNW: initialNW || 0,
    initialLiquid: initialLiquid || 0,
    initialDebt: debtItems ? totalsSum : (initialDebt || 0),
    debtBalances,
    breakdown,
    entries
  };
}
