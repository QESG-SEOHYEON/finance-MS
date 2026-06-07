// 콤마 자동 표시 금액 입력. <input type="text"> 드롭인 대체.
// - value: 숫자 또는 숫자 문자열 (raw)
// - onChange: (e) => ... 표준 onChange 형태로 동작 (e.target.value = raw 숫자 문자열)
export default function MoneyInput({ value, onChange, allowNegative = false, ...rest }) {
  const raw = value === null || value === undefined ? "" : String(value);
  const cleaned = raw.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, "");
  const display = cleaned === "" || cleaned === "-"
    ? cleaned
    : Number(cleaned).toLocaleString("ko-KR");

  const handle = (e) => {
    const next = e.target.value.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, "");
    onChange?.({ ...e, target: { ...e.target, value: next } });
  };

  return (
    <input
      type="text"
      inputMode={allowNegative ? "numeric" : "numeric"}
      autoComplete="off"
      {...rest}
      value={display}
      onChange={handle}
    />
  );
}
