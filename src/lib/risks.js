// 위험 신호 감지 (FINANCE_DATA.md 10번 항목 기반)

const LEVELS = {
  urgent: { label: "긴급", color: "#C06060", bg: "#FFF5F5" },
  high:   { label: "높음", color: "#C08060", bg: "#FFF8F3" },
  medium: { label: "중간", color: "#C0A07E", bg: "#FAF5F0" }
};

export function detectRisks({
  balance,
  variableTotal,
  foodTotal,
  cardActual,
  debtDelayed,
  today
}) {
  const risks = [];

  // 식비 40만 초과
  if (foodTotal > 400000) {
    risks.push({
      id: "food-over",
      level: "high",
      title: "식비 40만 원 초과",
      detail: `이번 달 식비 ${fmt(foodTotal)}. 외식 2회 제한 + 장보기 주 1회 고정.`
    });
  }

  // 변동지출 100만 초과
  if (variableTotal > 1000000) {
    risks.push({
      id: "variable-over",
      level: "high",
      title: "변동지출 100만 원 초과",
      detail: `총 ${fmt(variableTotal)}. 식비 40만 상한 + 약속 2회 제한.`
    });
  }

  // 카드값 40만 초과
  if (cardActual && cardActual > 400000) {
    risks.push({
      id: "card-over",
      level: "medium",
      title: "카드값 40만 원 초과",
      detail: `이번 달 카드값 ${fmt(cardActual)}. 체크카드로 전환 검토.`
    });
  }

  // 잔고 30만 이하 (급여일 전 5일)
  if (balance && Number(balance) > 0 && Number(balance) <= 300000 && today) {
    const day = today.getDate();
    if (day >= 20 && day <= 25) {
      risks.push({
        id: "balance-low",
        level: "urgent",
        title: "통장 잔고 30만 원 이하",
        detail: `현재 ${fmt(Number(balance))}. 변동지출 10만 축소 + ETF 1회 스킵 고려.`
      });
    }
  }

  // 마통 상환 지연 (26일 지났는데 미체크)
  if (debtDelayed) {
    risks.push({
      id: "debt-delay",
      level: "urgent",
      title: "마통 상환 지연",
      detail: "26일 지났는데 마통 상환이 미체크 상태. 식비 추가 절감 또는 예비비 보충."
    });
  }

  return risks.map((r) => ({ ...r, meta: LEVELS[r.level] }));
}

function fmt(n) {
  if (Math.abs(n) >= 10000) {
    const v = n / 10000;
    return (n % 10000 === 0 ? v.toFixed(0) : v.toFixed(1)) + "만";
  }
  return n.toLocaleString();
}
