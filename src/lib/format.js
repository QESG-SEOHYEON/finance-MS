// 금액 한글 단위 표기: 1234000 → "123만원", 100000000 → "1억원"
export function formatKorean(n) {
  const num = Number(n);
  if (!num || isNaN(num)) return "";
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 100000000) {
    const eok = abs / 100000000;
    const man = Math.floor((abs % 100000000) / 10000);
    if (man === 0) return `${sign}${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(2)}억원`;
    return `${sign}${Math.floor(eok)}억 ${man.toLocaleString()}만원`;
  }
  if (abs >= 10000) {
    const man = abs / 10000;
    return `${sign}${man % 1 === 0 ? man.toFixed(0) : man.toFixed(1)}만원`;
  }
  return `${sign}${abs.toLocaleString()}원`;
}
