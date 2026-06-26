// 부채 관리 — 대출별 잔액 계산 + 용도 메타.
// debtItem: { id, name, total, monthly, dueDay, purpose }
//   purpose: 빌린 돈의 행선지 (추가 대출 거래의 순자산 라우팅에 사용)

export const DEBT_PURPOSES = [
  { v: "living", label: "💸 생활비·현금", impact: "debt_up_cash",  hint: "현금으로 들어온 대출" },
  { v: "asset",  label: "🏠 전세·자산",   impact: "debt_up_asset", hint: "전세대출 등 자산으로" },
  { v: "invest", label: "📈 투자(빚투)",  impact: "debt_up_asset", hint: "투자에 쓴 대출" }
];

export const purposeMeta = (v) => DEBT_PURPOSES.find((p) => p.v === v) || DEBT_PURPOSES[0];

// 대출별 누적 상환액·잔액 계산.
// 상환 기록 매칭: task id `...-debt-{debtId}` (신규) 또는 라벨에 '마통상환' 포함(legacy → 첫 대출).
//  - actualAmount 있으면 그 값, 없고 체크만 되어 있으면 그 대출의 monthly 로 추정.
export function computeDebtBalances(debtItems, allMonthly) {
  const items = (debtItems || []).map((d) => ({
    ...d,
    total: Number(d.total) || 0,
    monthly: Number(d.monthly) || 0,
    paid: 0
  }));
  if (items.length === 0) return items;
  const byId = Object.fromEntries(items.map((d) => [d.id, d]));
  const legacyTarget = items.find((d) => /마통|마이너스/.test(d.name || "")) || items[0];

  for (const row of allMonthly || []) {
    const checks = row.checks || {};
    const actuals = row.actualAmounts || {};
    const seen = new Set();
    for (const tid in actuals) {
      const m = String(tid).match(/-debt-(.+)$/);
      const amt = Math.abs(Number(actuals[tid]) || 0);
      if (m && byId[m[1]]) { byId[m[1]].paid += amt; seen.add(tid); }
      else if (/마통상환/.test(tid) && legacyTarget) { legacyTarget.paid += amt; seen.add(tid); }
    }
    for (const tid in checks) {
      if (!checks[tid] || seen.has(tid)) continue;
      const m = String(tid).match(/-debt-(.+)$/);
      if (m && byId[m[1]]) byId[m[1]].paid += byId[m[1]].monthly;
      else if (/마통상환/.test(tid) && legacyTarget) legacyTarget.paid += legacyTarget.monthly;
    }
  }

  for (const d of items) d.balance = Math.max(0, d.total - d.paid);
  return items;
}

export function totalDebtRemaining(debtItems, allMonthly) {
  return computeDebtBalances(debtItems, allMonthly).reduce((s, d) => s + d.balance, 0);
}
