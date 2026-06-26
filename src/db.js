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

// v4: 경제 멘토 위젯. 신규 테이블만 추가. 기존 데이터는 그대로 유지됨.
db.version(4).stores({
  monthly_status: "id",
  settings: "id",
  expenses: "++id, date, category",
  assets: "id",
  month_schedule: "id",
  mentor: "id",
  mentor_daily: "date",
  mentor_history: "++id, timestamp, mentorId"
});

// ---------- mentor ----------
const MENTOR_ID = "main";

export async function getMentor() {
  const row = await db.mentor.get(MENTOR_ID);
  return row || null;
}

export async function initMentor({ name = "", nickname = "" } = {}) {
  const existing = await getMentor();
  if (existing) return existing;
  const entry = {
    id: MENTOR_ID,
    name, nickname,
    photos: [],
    showPhoto: true,
    affinity: 0,
    installedAt: new Date(),
    affinityMaxedAt: null
  };
  await db.mentor.put(entry);
  return entry;
}

export async function updateMentor(patch) {
  const existing = (await getMentor()) || { id: MENTOR_ID };
  const next = { ...existing, ...patch, updatedAt: new Date() };
  await db.mentor.put(next);
  return next;
}

export async function adjustAffinity(delta) {
  const m = (await getMentor()) || (await initMentor());
  const cur = Number(m.affinity || 0);
  const raw = cur + Number(delta);
  const next = Math.max(0, Math.min(10, raw));
  const crossedMax = cur < 10 && next >= 10;
  const patch = { affinity: Number(next.toFixed(2)) };
  if (crossedMax && !m.affinityMaxedAt) patch.affinityMaxedAt = new Date();
  await updateMentor(patch);
  return { applied: Number((next - cur).toFixed(2)), affinity: patch.affinity, crossedMax };
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getTodayMentorUsage() {
  const key = todayKey();
  const row = await db.mentor_daily.get(key);
  return row || { date: key, adviceCount: 0, chatUsed: false };
}

export async function incMentorAdvice() {
  const row = await getTodayMentorUsage();
  const next = { ...row, adviceCount: (row.adviceCount || 0) + 1 };
  await db.mentor_daily.put(next);
  return next;
}

export async function markMentorChatUsed() {
  const row = await getTodayMentorUsage();
  const next = { ...row, chatUsed: true };
  await db.mentor_daily.put(next);
  return next;
}

export async function addMentorHistory(entry) {
  return db.mentor_history.add({
    mentorId: MENTOR_ID,
    timestamp: new Date(),
    ...entry
  });
}

export async function getMentorHistory({ limit = 100 } = {}) {
  return db.mentor_history.orderBy("timestamp").reverse().limit(limit).toArray();
}

export async function getRecentAdviceIds({ days = 7 } = {}) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await db.mentor_history
    .where("timestamp").above(new Date(since))
    .and((r) => r.type === "advice" && !!r.refId)
    .toArray();
  return new Set(rows.map((r) => r.refId));
}

export async function getRecentScenarioIds({ days = 30 } = {}) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await db.mentor_history
    .where("timestamp").above(new Date(since))
    .and((r) => r.type === "chat" && !!r.refId)
    .toArray();
  return new Set(rows.map((r) => r.refId));
}

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

// ---------- attendance ----------
export async function getAttendanceDates() {
  const row = await db.settings.get("attendance-dates");
  return Array.isArray(row?.value) ? row.value : [];
}

export async function markAttendance(dateKey) {
  const dates = await getAttendanceDates();
  if (dates.includes(dateKey)) return dates;
  const next = [...dates, dateKey].sort();
  await db.settings.put({ id: "attendance-dates", value: next });
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

// ---------- 백업 / 복원 (기기 이전용 JSON) ----------
const BACKUP_TABLES = [
  "monthly_status", "settings", "expenses", "assets",
  "month_schedule", "mentor", "mentor_daily", "mentor_history"
];

// 모든 테이블을 JSON 객체로 덤프
export async function exportAllData() {
  const data = {};
  for (const t of BACKUP_TABLES) {
    try { data[t] = await db[t].toArray(); }
    catch { data[t] = []; }
  }
  return {
    app: "finance-calendar",
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    data
  };
}

// 백업 JSON 을 DB 에 복원. 기본은 전체 교체(replace) — 기기 이전 시 그대로 옮김.
export async function importAllData(payload, { replace = true } = {}) {
  if (!payload || payload.app !== "finance-calendar" || !payload.data || typeof payload.data !== "object") {
    throw new Error("올바른 백업 파일이 아니에요.");
  }
  const data = payload.data;
  const tables = BACKUP_TABLES.filter((t) => db[t]); // 존재하는 테이블만
  await db.transaction("rw", tables.map((t) => db[t]), async () => {
    for (const t of tables) {
      const rows = Array.isArray(data[t]) ? data[t] : [];
      if (replace) await db[t].clear();
      if (rows.length) await db[t].bulkPut(rows);
    }
  });
  return { tables: tables.length };
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

// ---------- 월별 여윳자금 (즉시 인출 가능 현금 잔고) ----------
export async function getCashBalance(year, month) {
  const row = await db.settings.get(`cash-balance-${year}-${month}`);
  return row?.value;
}
export async function setCashBalance(year, month, amount) {
  if (amount === null || amount === "" || amount === undefined) {
    await db.settings.delete(`cash-balance-${year}-${month}`);
  } else {
    await db.settings.put({
      id: `cash-balance-${year}-${month}`,
      value: { amount: Number(amount), updatedAt: new Date() }
    });
  }
}

// =====================================================================
// v2: 순자산 자동 계산 / 반복 일정 / orphan 복원 / 자산 마법사 / 업데이트 안내
// =====================================================================

// ---------- 순자산 모드 / 초기 유동자산 ----------
export async function getNetWorthMode() {
  const row = await db.settings.get("netWorth-mode");
  return row?.value || "manual";
}
export async function setNetWorthMode(mode) {
  await db.settings.put({ id: "netWorth-mode", value: mode });
}
export async function getInitialLiquid() {
  const row = await db.settings.get("initialLiquid");
  return Number(row?.value) || 0;
}
export async function setInitialLiquid(value) {
  await db.settings.put({ id: "initialLiquid", value: Number(value) });
}
// 초기 부채 baseline (순자산 = 현금 + 투자 − 부채). null이면 미설정(프로필 debtItems 합으로 기본값).
export async function getInitialDebt() {
  const row = await db.settings.get("initialDebt");
  return row?.value == null ? null : Number(row.value);
}
export async function setInitialDebt(value) {
  await db.settings.put({ id: "initialDebt", value: Number(value) });
}

// ---------- 부채 (profile.debtItems) ----------
export async function getDebts() {
  const p = await getUserProfile();
  return Array.isArray(p?.debtItems) ? p.debtItems : [];
}
export async function setDebts(items) {
  await setUserProfile({ debtItems: items, debtEnabled: items.length > 0 });
  return items;
}

// ---------- 자산 마법사 1회성 완료 플래그 ----------
export async function isAssetSetupDone() {
  const row = await db.settings.get("asset-setup-done");
  return !!row?.value;
}
export async function markAssetSetupDone() {
  await db.settings.put({ id: "asset-setup-done", value: true });
}

// ---------- 업데이트 안내(WhatsNew) 1회성 완료 플래그 ----------
export async function isWhatsNewSeen(version) {
  const row = await db.settings.get(`whats-new-${version}-seen`);
  return !!row?.value;
}
export async function markWhatsNewSeen(version) {
  await db.settings.put({ id: `whats-new-${version}-seen`, value: true });
}
export async function clearWhatsNewSeen(version) {
  await db.settings.delete(`whats-new-${version}-seen`);
}

// 커스텀 카테고리에 자산 종류(nwImpact) 일괄 부여
export async function updateCustomCategoryImpacts(impactMap) {
  const row = await db.settings.get("custom-categories");
  const list = Array.isArray(row?.value) ? row.value : [];
  const next = list.map((c) => impactMap[c.key] ? { ...c, nwImpact: impactMap[c.key] } : c);
  await db.settings.put({ id: "custom-categories", value: next });
}

// ---------- 반복 일정 (모든 task type 통합 · 월/주/격주 주기) ----------
export async function getRecurringTasks() {
  const row = await db.settings.get("recurring-tasks");
  return Array.isArray(row?.value) ? row.value : [];
}
export async function setRecurringTasks(items) {
  await db.settings.put({ id: "recurring-tasks", value: items });
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function computeRecurringDays(r, year, month, daysInMonth) {
  if (r.frequency === "monthly") {
    return [Math.min(Number(r.dayOfMonth) || 1, daysInMonth)];
  }
  const wd = Number(r.weekday);
  if (Number.isNaN(wd)) return [];
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === wd) days.push(d);
  }
  if (r.frequency === "weekly") return days;
  if (r.frequency === "biweekly") {
    const offset = Number(r.weekOffset) || 0;
    return days.filter((d) => (isoWeekOf(new Date(year, month - 1, d)) % 2) === offset);
  }
  return [];
}

// 기존 recurring-expenses → 신규 recurring-tasks 로 마이그레이션 (1회 실행)
export async function migrateRecurringExpensesToTasks() {
  const flagRow = await db.settings.get("recurring-migrated");
  if (flagRow?.value) return { migrated: 0, already: true };

  const legacyRow = await db.settings.get("recurring-expenses");
  const legacyItems = Array.isArray(legacyRow?.value) ? legacyRow.value : [];
  if (!legacyItems.length) {
    await db.settings.put({ id: "recurring-migrated", value: true });
    return { migrated: 0, already: false };
  }

  const existingTasks = await getRecurringTasks();
  const migrated = legacyItems.map((item) => ({
    id: `rt-mig-${item.id || Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    label: item.memo || `반복 지출${item.subcategory ? " · " + item.subcategory : ""}`,
    type: "fixed",
    category: item.category || "",
    subcategory: item.subcategory || "",
    amount: Math.abs(Number(item.amount) || 0),
    memo: item.memo || "",
    frequency: "monthly",
    dayOfMonth: Number(item.dayOfMonth) || 1,
    _migratedFrom: "recurring-expenses"
  }));
  await setRecurringTasks([...existingTasks, ...migrated]);
  await db.settings.delete("recurring-expenses");
  await db.settings.put({ id: "recurring-migrated", value: true });
  return { migrated: migrated.length, already: false };
}

export async function applyRecurringTasksForMonth(year, month) {
  const items = await getRecurringTasks();
  if (!items.length) return 0;
  const schedule = await getMonthSchedule(year, month);
  const added = Array.isArray(schedule?.added) ? [...schedule.added] : [];
  const existingIds = new Set(added.map((t) => t.id));
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;

  for (const r of items) {
    const days = computeRecurringDays(r, year, month, daysInMonth);
    for (const day of days) {
      const id = `recur-${r.id}-${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (existingIds.has(id)) continue;
      const positiveTypes = new Set(["income"]);
      const negativeTypes = new Set(["fixed", "invest", "debt", "general"]);
      const absAmount = Math.abs(Number(r.amount) || 0);
      const signed = positiveTypes.has(r.type) ? absAmount : (negativeTypes.has(r.type) ? -absAmount : absAmount);
      added.push({
        id,
        label: r.label || "(반복 일정)",
        type: r.type || "general",
        category: r.category || "",
        subcategory: r.subcategory || "",
        amount: signed,
        day,
        icon: r.icon || (r.type === "income" ? "💰" : r.type === "invest" ? "📈" : r.type === "debt" ? "⚡" : "📌"),
        memo: r.memo || "",
        isRecurring: true,
        _recurringId: r.id
      });
      existingIds.add(id);
      count++;
    }
  }
  if (count > 0) await setMonthSchedule(year, month, { added });
  return count;
}

// ---------- Orphaned task references — 스케줄 변경 후 데이터 보호 ----------
// 데이터에 남아있지만 현재 코드 기준으로 그려지지 않는 task ID를 찾음.
export async function getOrphanedTaskRefs() {
  const { getTasksForMonth } = await import("./schedule.js");
  const allMonthly = await db.monthly_status.toArray();
  const allSchedules = await db.month_schedule.toArray();
  const settingsAll = await db.settings.toArray();
  const profile = await getUserProfile();
  const expectedIncomeByMonth = {};
  for (const s of settingsAll) {
    const mt = s.id && s.id.match(/^expected-income-(\d+)-(\d+)$/);
    if (mt) expectedIncomeByMonth[`${Number(mt[1])}-${Number(mt[2])}`] = s.value || {};
  }
  const overridesMap = {};
  for (const s of allSchedules) overridesMap[s.id] = s;

  // 데이터가 있는 모든 월에 대해 현재 코드 기준 정상 task ID를 모음
  const validIds = new Set();
  for (const m of allMonthly) {
    const [y, mo] = String(m.id).split("-").map(Number);
    if (!y || !mo) continue;
    const debtPaidBefore = calcDebtPaidBefore(allMonthly, profile, y, mo);
    const tasks = getTasksForMonth(y, mo, {
      profile,
      customSchedule: overridesMap[m.id],
      expectedIncomeThisMonth: expectedIncomeByMonth[m.id] || {},
      debtPaidBefore
    });
    for (const t of tasks) validIds.add(t.id);
  }
  for (const s of allSchedules) {
    for (const t of (s.added || [])) validIds.add(t.id);
  }

  const orphans = new Map();
  const touch = (id, monthId) => {
    if (!orphans.has(id)) orphans.set(id, { id, monthIds: [], actualSum: 0, hasCheck: false, hasOverride: false, override: null });
    const o = orphans.get(id);
    if (monthId && !o.monthIds.includes(monthId)) o.monthIds.push(monthId);
  };
  for (const m of allMonthly) {
    for (const id in (m.actualAmounts || {})) {
      if (validIds.has(id)) continue;
      touch(id, m.id);
      orphans.get(id).actualSum += Math.abs(Number(m.actualAmounts[id]) || 0);
    }
    for (const id in (m.checks || {})) {
      if (!m.checks[id] || validIds.has(id)) continue;
      touch(id, m.id);
      orphans.get(id).hasCheck = true;
    }
  }
  for (const s of allSchedules) {
    for (const id in (s.overrides || {})) {
      if (validIds.has(id)) continue;
      touch(id, s.id);
      orphans.get(id).hasOverride = true;
      orphans.get(id).override = s.overrides[id];
    }
  }
  return Array.from(orphans.values());
}

function parseTaskId(id) {
  const parts = String(id).split("-");
  if (parts.length < 4) return null;
  const [y, mo, day, ...labelParts] = parts;
  const yy = Number(y), mm = Number(mo), dd = Number(day);
  if (!yy || !mm || !dd) return null;
  return { year: yy, month: mm, day: dd, label: labelParts.join("-") };
}

// orphan을 user-added task로 복원 — 데이터 있는 각 월의 month_schedule.added에 task 추가
export async function restoreOrphanTask(orphan, customLabel) {
  const parsed = parseTaskId(orphan.id);
  if (!parsed) return false;
  const label = customLabel || orphan.override?.label || parsed.label || "복원된 항목";
  const baseAmount = orphan.override?.amount ?? 0;
  const type = orphan.override?.type || "general";
  const icon = orphan.override?.icon || "📌";

  for (const monthId of orphan.monthIds) {
    if (!/^\d+-\d+$/.test(monthId)) continue;
    const sched = await db.month_schedule.get(monthId) || { id: monthId, overrides: {}, hidden: [], added: [] };
    const added = Array.isArray(sched.added) ? [...sched.added] : [];
    if (added.find((t) => t.id === orphan.id)) continue;
    added.push({
      id: orphan.id,
      label, type, icon,
      day: parsed.day,
      amount: baseAmount,
      category: orphan.override?.category,
      isCustom: true,
      _restored: true
    });
    await db.month_schedule.put({ ...sched, id: monthId, added });
  }
  return true;
}

// orphan 데이터 삭제
export async function deleteOrphanData(orphan) {
  const allMonthly = await db.monthly_status.toArray();
  for (const m of allMonthly) {
    let changed = false;
    if (m.actualAmounts && m.actualAmounts[orphan.id] !== undefined) {
      const nextActuals = { ...m.actualAmounts };
      delete nextActuals[orphan.id];
      m.actualAmounts = nextActuals;
      changed = true;
    }
    if (m.checks && m.checks[orphan.id] !== undefined) {
      const nextChecks = { ...m.checks };
      delete nextChecks[orphan.id];
      m.checks = nextChecks;
      changed = true;
    }
    if (changed) await db.monthly_status.put(m);
  }
  const allSchedules = await db.month_schedule.toArray();
  for (const s of allSchedules) {
    if (s.overrides && s.overrides[orphan.id]) {
      const nextOv = { ...s.overrides };
      delete nextOv[orphan.id];
      await db.month_schedule.put({ ...s, overrides: nextOv });
    }
  }
}
