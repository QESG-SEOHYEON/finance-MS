import Dexie from "dexie";

// Fallback 기본값 (온보딩 완료 전, 또는 값이 비어있을 때만 사용)
export const DEFAULT_DEBT_TOTAL = 1100000;
export const DEFAULT_DEBT_MONTHLY = 160000;
export const DEFAULT_SALARY = 3100000;

export const PROFILE = {
  name: "사용자",
  age: 0,
  birthYear: 2000,
  currentNetWorth: 0,
  goalAmount: 100000000,
  goalDate: "2030-01-01",
  salary: DEFAULT_SALARY,
  subtitle: "재무 관제 시작",
  expenseBudgetCap: 890000,
  debtEnabled: false,
  debtTotal: 0,
  debtMonthly: 0,
  debtDueDay: 26
};

// 하위 호환: 기존 코드에서 DEBT_TOTAL / DEBT_MONTHLY / SALARY import 하는 부분이 있음
// 프로필 로드 전까지는 fallback, 이후엔 DB 값을 쓰도록 점진적 교체 예정
export const DEBT_TOTAL = DEFAULT_DEBT_TOTAL;
export const DEBT_MONTHLY = DEFAULT_DEBT_MONTHLY;
export const SALARY = DEFAULT_SALARY;

export const db = new Dexie("FinanceCalendarDB");

db.version(2).stores({
  monthly_status: "id",
  settings: "id",
  expenses: "++id, date, category",
  assets: "id"
}).upgrade(async (tx) => {
  // v1 -> v2 migration: no-op, just new tables
});

db.version(3).stores({
  monthly_status: "id",
  settings: "id",
  expenses: "++id, date, category",
  assets: "id",
  month_schedule: "id"
});

// ---------- monthly_status ----------
export async function getMonthStatus(year, month) {
  const id = `${year}-${month}`;
  const row = await db.monthly_status.get(id);
  return row || { id, checks: {}, balance: "", actualAmounts: {} };
}

export async function setMonthStatus(year, month, patch) {
  const id = `${year}-${month}`;
  const existing = (await db.monthly_status.get(id)) || {
    id, checks: {}, balance: "", actualAmounts: {}, createdAt: new Date()
  };
  const next = { ...existing, ...patch, updatedAt: new Date() };
  await db.monthly_status.put(next);
  return next;
}

export async function setActualAmount(year, month, taskId, amount) {
  const row = await getMonthStatus(year, month);
  const actualAmounts = { ...(row.actualAmounts || {}) };
  if (amount === null || amount === "" || amount === undefined) {
    delete actualAmounts[taskId];
  } else {
    actualAmounts[taskId] = Number(amount);
  }
  return setMonthStatus(year, month, { actualAmounts });
}

// ---------- settings ----------
export async function getView() {
  const row = await db.settings.get("view");
  return row?.value || null;
}

export async function setView(year, month) {
  await db.settings.put({ id: "view", value: { year, month } });
}

export async function getNetWorth() {
  const row = await db.settings.get("netWorth");
  return row?.value ?? PROFILE.currentNetWorth;
}

export async function setNetWorth(value) {
  await db.settings.put({ id: "netWorth", value: Number(value) });
}

// ---------- expenses ----------
export async function addExpense({ date, category, subcategory, amount, memo }) {
  return db.expenses.add({
    date, category, subcategory: subcategory || null,
    amount: Number(amount), memo: memo || "",
    createdAt: new Date()
  });
}

export async function updateExpense(id, patch) {
  return db.expenses.update(id, patch);
}

export async function deleteExpense(id) {
  return db.expenses.delete(id);
}

// ---------- custom presets per category ----------
export async function getCustomPresets(categoryKey) {
  const row = await db.settings.get(`presets-${categoryKey}`);
  return row?.value || [];
}

export async function setCustomPresets(categoryKey, presets) {
  await db.settings.put({ id: `presets-${categoryKey}`, value: presets });
}

// ---------- default preset overrides ----------
export async function getPresetOverrides(categoryKey) {
  const row = await db.settings.get(`preset-overrides-${categoryKey}`);
  return row?.value || {};
}

export async function setPresetOverrides(categoryKey, overrides) {
  await db.settings.put({ id: `preset-overrides-${categoryKey}`, value: overrides });
}

// ---------- custom categories ----------
export async function getCustomCategories() {
  const row = await db.settings.get("custom-categories");
  return row?.value || [];
}

export async function setCustomCategoriesStore(list) {
  await db.settings.put({ id: "custom-categories", value: list });
}

export async function getCategoryOverrides() {
  const row = await db.settings.get("category-overrides");
  return row?.value || {};
}

export async function setCategoryOverrides(overrides) {
  await db.settings.put({ id: "category-overrides", value: overrides });
}

export async function migrateExpensesCategory(fromKey, toKey) {
  const rows = await db.expenses.where("category").equals(fromKey).toArray();
  await Promise.all(rows.map((r) => db.expenses.update(r.id, { category: toKey })));
  return rows.length;
}

// ---------- recurring expenses ----------
export async function getRecurring() {
  const row = await db.settings.get("recurring-expenses");
  return row?.value || [];
}

export async function setRecurring(items) {
  await db.settings.put({ id: "recurring-expenses", value: items });
}

export async function applyRecurringForMonth(year, month) {
  const items = await getRecurring();
  if (!items.length) return 0;
  const mm = String(month).padStart(2, "0");
  const existing = await getExpensesForMonth(year, month);
  let added = 0;
  for (const r of items) {
    const key = `recur:${r.id}`;
    if (existing.some((e) => e.memo === key)) continue;
    const d = Math.min(r.dayOfMonth || 1, new Date(year, month, 0).getDate());
    await addExpense({
      date: `${year}-${mm}-${String(d).padStart(2, "0")}`,
      category: r.category,
      subcategory: r.subcategory,
      amount: Number(r.amount),
      memo: key
    });
    added++;
  }
  return added;
}

export async function getExpensesForMonth(year, month) {
  const mm = String(month).padStart(2, "0");
  const prefix = `${year}-${mm}`;
  return db.expenses
    .where("date")
    .startsWith(prefix)
    .reverse()
    .sortBy("date");
}

// ---------- user profile / onboarding ----------
export async function getUserProfile() {
  const row = await db.settings.get("user-profile");
  return row?.value || null;
}

export async function setUserProfile(patch) {
  const existing = (await getUserProfile()) || {};
  const next = { ...existing, ...patch, updatedAt: new Date() };
  await db.settings.put({ id: "user-profile", value: next });
  return next;
}

export async function isOnboardingComplete() {
  const row = await db.settings.get("onboarding-complete");
  return !!row?.value;
}

export async function markOnboardingComplete() {
  await db.settings.put({
    id: "onboarding-complete",
    value: { completedAt: new Date(), version: 1 }
  });
}

export async function resetOnboarding() {
  await db.settings.delete("onboarding-complete");
}

/**
 * 모든 DB 데이터 삭제 후 새로고침. 개발·테스트용.
 */
export async function resetAllData() {
  try {
    await db.delete();
  } catch {}
  try {
    localStorage.clear();
  } catch {}
  location.reload();
}

// 효과적 프로필: DB 값 우선, 없으면 PROFILE 기본값
export function mergeProfile(dbProfile) {
  return { ...PROFILE, ...(dbProfile || {}) };
}

// ---------- month schedule (user overrides) ----------
export async function getMonthSchedule(year, month) {
  const id = `${year}-${month}`;
  const row = await db.month_schedule.get(id);
  return row || { id, overrides: {}, hidden: [], added: [] };
}

export async function setMonthSchedule(year, month, patch) {
  const id = `${year}-${month}`;
  const existing = await getMonthSchedule(year, month);
  const next = { ...existing, ...patch, updatedAt: new Date() };
  await db.month_schedule.put(next);
  return next;
}

// ---------- custom goals / checkpoints ----------
export async function getCustomGoals(phaseNum) {
  const row = await db.settings.get(`phase-goals-${phaseNum}`);
  return row?.value || { added: [], hidden: [] };
}

export async function setCustomGoals(phaseNum, value) {
  await db.settings.put({ id: `phase-goals-${phaseNum}`, value });
}

export async function getCustomCheckpoints(year, month) {
  const row = await db.settings.get(`checkpoints-${year}-${month}`);
  return row?.value || [];
}

export async function setCustomCheckpoints(year, month, items) {
  await db.settings.put({ id: `checkpoints-${year}-${month}`, value: items });
}

// ---------- 누적 부채 상환 (debtItems 기반) ----------
// 반환: { [debtId]: paidAmount } 맵.
// Task id 포맷: `{year}-{month}-{day}-debt-{debtId}` 에서 debtId 추출.
export function calcDebtPaidBefore(allMonthly, profile, year, month) {
  const paid = {};
  const debts = profile?.debtItems || [];
  if (debts.length === 0) return paid;
  for (const d of debts) paid[d.id] = 0;
  const monthlyById = Object.fromEntries(debts.map((d) => [d.id, Number(d.monthly) || 0]));
  const totalById = Object.fromEntries(debts.map((d) => [d.id, Number(d.total) || 0]));
  for (const row of allMonthly) {
    const [y, m] = row.id.split("-").map(Number);
    if (y < year || (y === year && m < month)) {
      const checks = row.checks || {};
      for (const key of Object.keys(checks)) {
        if (!checks[key]) continue;
        const match = key.match(/-debt-(.+)$/);
        if (match) {
          const id = match[1];
          if (monthlyById[id] != null) paid[id] = Math.min(totalById[id] || Infinity, paid[id] + monthlyById[id]);
        }
      }
    }
  }
  return paid;
}

// 총 상환액 (모든 부채 합)
export function sumDebtPaid(paidMap) {
  return Object.values(paidMap || {}).reduce((a, b) => a + b, 0);
}
export function sumDebtTotal(profile) {
  return (profile?.debtItems || []).reduce((s, d) => s + (Number(d.total) || 0), 0);
}

// ---------- 변동 수입 월별 예상치 ----------
export async function getExpectedIncome(year, month) {
  const row = await db.settings.get(`expected-income-${year}-${month}`);
  return row?.value || {};
}
export async function setExpectedIncome(year, month, map) {
  await db.settings.put({ id: `expected-income-${year}-${month}`, value: map });
}
