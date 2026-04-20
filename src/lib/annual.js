// 연간 체크포인트 이벤트
export function checkpointsForMonth(month) {
  const items = [];
  if (month === 1) {
    items.push({
      icon: "💼",
      title: "연봉 협상 & 자동이체 조정",
      detail: "인상분 × 70%를 투자로 편입. 생활비 20%, 자기계발 10%."
    });
  }
  if (month === 3 || month === 6 || month === 9 || month === 12) {
    items.push({
      icon: "📊",
      title: `${month}월 말 포트폴리오 리밸런싱`,
      detail: "레버리지(SSO) 비중이 40% 이하인지 확인. 초과 시 VOO로 전환."
    });
  }
  if (month === 5) {
    items.push({
      icon: "📋",
      title: "종합소득세 확정신고",
      detail: "해외 ETF 양도차익 250만 초과 시 홈택스에서 신고."
    });
  }
  if (month === 11 || month === 12) {
    items.push({
      icon: "🧮",
      title: "연말 세금 최적화",
      detail: "손익 통산 실행 (손실 종목 매도 → 즉시 재매수). 양도차익 250만 이내로 관리."
    });
  }
  return items;
}
