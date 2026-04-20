// 월별 고정 스케줄은 사용자 프로필 (incomeSources + debtItems) 기반으로 동적 생성.
// 사용자가 Calendar 편집으로 추가한 이벤트는 month_schedule.added 에 저장되어 별도 병합됨.

export const COLORS = {
  income:   { bg: "#F0FAF5", border: "#6BAF8D", text: "#3B7A5A", check: "#6BAF8D" },
  fixed:    { bg: "#FFF5F5", border: "#C08080", text: "#8B4F4F", check: "#C08080" },
  invest:   { bg: "#F5F0FA", border: "#9B7EC0", text: "#6B4F8B", check: "#9B7EC0" },
  debt:     { bg: "#FFF0F5", border: "#D4A0A0", text: "#8B5A5A", check: "#D4A0A0" },
  variable: { bg: "#FAF5F0", border: "#C0A07E", text: "#8B6F4F", check: "#C0A07E" },
  general:  { bg: "#FEF0EC", border: "#D49080", text: "#8B5F4F", check: "#D49080" }
};

export function getMondays(year, month) {
  const mondays = [];
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month - 1) {
    mondays.push(d.getDate());
    d.setDate(d.getDate() + 7);
  }
  return mondays;
}

export function getDaysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

export function fmt(n) {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 10000) {
    const sign = n < 0 ? "-" : "";
    const v = abs / 10000;
    return sign + (abs % 10000 === 0 ? v.toFixed(0) : v.toFixed(1)) + "만";
  }
  return n.toLocaleString();
}

export function fmtWon(n) {
  return (n < 0 ? "-" : "") + Math.abs(n).toLocaleString() + "원";
}

/**
 * 프로필 + 월별 변동 수입 데이터로부터 기본 이벤트 생성.
 * - incomeSources: 각 수입원별 income 이벤트. variable이면 해당 월의 expectedAmount 사용, 없으면 0
 * - debtItems: 부채 상환 이벤트 (debtEnabled일 때만, 누적 상환액이 총액 이상이면 제외)
 */
function buildDefaultTasks(year, month, profile, expectedIncomeThisMonth, debtPaidBefore) {
  const out = [];
  if (!profile) return out;
  const daysInMonth = getDaysInMonth(year, month);
  const clamp = (d) => Math.max(1, Math.min(daysInMonth, Number(d) || 1));

  // 수입
  for (const src of profile.incomeSources || []) {
    // 변동 수입이고 입금일 없으면 월말로 표시 (일정 없이 해당 월 합계에 포함됨)
    const day = (src.day == null || src.day === "")
      ? daysInMonth
      : clamp(src.day);
    const isVariable = src.type === "variable";
    let amount;
    if (isVariable) {
      const map = expectedIncomeThisMonth || {};
      // 해당 월에 예상치가 등록되어 있으면 사용, 없으면 온보딩 때 입력한 기본 금액으로 fallback
      const explicit = map[src.id];
      amount = explicit != null && explicit !== "" ? Number(explicit) : Number(src.amount) || 0;
    } else {
      amount = Number(src.amount) || 0;
    }
    out.push({
      label: src.name || "수입",
      amount,
      type: "income",
      icon: "💰",
      day,
      id: `${year}-${month}-${day}-src-${src.id}`,
      _sourceId: src.id,
      _variable: isVariable
    });
  }

  // 부채 상환
  if (profile.debtEnabled && Array.isArray(profile.debtItems)) {
    const paidMap = debtPaidBefore || {};
    for (const d of profile.debtItems) {
      const total = Number(d.total) || 0;
      const monthly = Number(d.monthly) || 0;
      const paid = Number(paidMap[d.id]) || 0;
      if (total > 0 && paid >= total) continue; // 완납 후 제외
      const day = clamp(d.dueDay);
      out.push({
        label: `${d.name || "부채"} 상환`,
        amount: -monthly,
        type: "debt",
        icon: "⚡",
        day,
        id: `${year}-${month}-${day}-debt-${d.id}`,
        _debtId: d.id
      });
    }
  }

  return out;
}

/**
 * @param {number} year
 * @param {number} month
 * @param {object} opts
 *   - profile: 사용자 프로필 (온보딩에서 저장)
 *   - customSchedule: month_schedule 레코드 (overrides/hidden/added)
 *   - expectedIncomeByMonth: variable 소스의 월별 예상 수입 { [sourceId]: amount }
 *   - debtPaidBefore: 이 월 이전까지의 부채별 누적 상환액 { [debtId]: amount }
 */
export function getTasksForMonth(year, month, opts = {}) {
  const { profile, customSchedule, expectedIncomeThisMonth, debtPaidBefore } = opts;
  const tasks = [];
  const custom = customSchedule || { overrides: {}, hidden: [], added: [] };
  const hiddenSet = new Set(custom.hidden || []);

  const defaultTasks = buildDefaultTasks(year, month, profile, expectedIncomeThisMonth, debtPaidBefore);

  for (const base of defaultTasks) {
    if (hiddenSet.has(base.id)) continue;
    const ov = (custom.overrides || {})[base.id];
    tasks.push(ov ? { ...base, ...ov, id: base.id } : base);
  }

  for (const added of custom.added || []) {
    tasks.push({ ...added, isCustom: true });
  }

  tasks.sort((a, b) => a.day - b.day);
  return tasks;
}
