// 픽셀 아트 핑크 버튼. 외곽 진한 핑크 + 내부 옅은 핑크 + 계단형 코너.
// clip-path polygon 으로 모서리 픽셀 컷 구현.

const STEP = 4; // 픽셀 코너 크기

function steppedClip(step = STEP) {
  const s = `${step}px`;
  const is = `calc(100% - ${step}px)`;
  return `polygon(
    0 ${s}, ${s} ${s}, ${s} 0,
    ${is} 0, ${is} ${s}, 100% ${s},
    100% ${is}, ${is} ${is}, ${is} 100%,
    ${s} 100%, ${s} ${is}, 0 ${is}
  )`;
}

// 파스텔 톤 — 톤다운된 핑크/민트/크림. 접근성 위해 텍스트는 약간 진하게.
const PALETTES = {
  pink: { border: "#F5A6C8", bg: "#FFE0ED", fg: "#A84A75", disabledBg: "#F5EAF0", disabledBorder: "#E5C8D4", disabledFg: "#C4A5B3" },
  mint: { border: "#A5D9BE", bg: "#DFF3E8", fg: "#3E7A5C", disabledBg: "#EBF2ED", disabledBorder: "#C7DDD1", disabledFg: "#9DB7AA" },
  cream: { border: "#E0BDA8", bg: "#FFEADB", fg: "#8A5A40", disabledBg: "#F5EBE3", disabledBorder: "#D8C4B5", disabledFg: "#B09A89" }
};

export default function PixelButton({
  children,
  onClick,
  disabled = false,
  palette = "pink",
  size = "md",  // "sm" | "md" | "lg"
  fullWidth = false,
  title,
  style: extraStyle = {}
}) {
  const c = PALETTES[palette] || PALETTES.pink;
  const sz = size === "lg"
    ? { pad: "12px 22px", font: 14, letter: 2 }
    : size === "sm"
      ? { pad: "6px 12px", font: 11, letter: 1 }
      : { pad: "10px 18px", font: 13, letter: 1.5 };
  const bg = disabled ? c.disabledBg : c.bg;
  const border = disabled ? c.disabledBorder : c.border;
  const fg = disabled ? c.disabledFg : c.fg;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        position: "relative",
        width: fullWidth ? "100%" : "auto",
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        ...extraStyle
      }}
    >
      {/* 외곽 진한 핑크 (계단형) */}
      <span style={{
        position: "absolute", inset: 0,
        background: border,
        clipPath: steppedClip(STEP),
        WebkitClipPath: steppedClip(STEP)
      }} />
      {/* 내부 옅은 핑크 (한 겹 안쪽) */}
      <span style={{
        position: "absolute", inset: STEP,
        background: bg,
        clipPath: steppedClip(STEP - 1),
        WebkitClipPath: steppedClip(STEP - 1)
      }} />
      {/* 텍스트 */}
      <span style={{
        position: "relative", zIndex: 1,
        display: "block",
        padding: sz.pad,
        color: fg,
        fontSize: sz.font,
        fontWeight: 400,
        letterSpacing: "0.5px",
        fontFamily: "'Galmuri11', 'Press Start 2P', 'DungGeunMo', monospace",
        lineHeight: 1.3
      }}>{children}</span>
    </button>
  );
}

// 픽셀 말풍선 — 계단형 코너 + 지정 색 테두리. 자식은 Galmuri 폰트 상속.
export function PixelBubble({
  children,
  border = "#C08080",
  bg = "#fff",
  padding = "10px 14px",
  fontSize = 13,
  color = "#4A3535",
  fullWidth = false,
  extra = {}
}) {
  return (
    <div style={{
      position: "relative",
      display: fullWidth ? "block" : "inline-block",
      width: fullWidth ? "100%" : "auto",
      ...extra
    }}>
      <span style={{
        position: "absolute", inset: 0,
        background: border,
        clipPath: steppedClip(STEP),
        WebkitClipPath: steppedClip(STEP)
      }} />
      <span style={{
        position: "absolute", inset: STEP,
        background: bg,
        clipPath: steppedClip(STEP - 1),
        WebkitClipPath: steppedClip(STEP - 1)
      }} />
      <div style={{
        position: "relative", zIndex: 1,
        padding,
        fontFamily: "'Galmuri11', 'Press Start 2P', 'DungGeunMo', monospace",
        fontSize,
        color,
        lineHeight: 1.5,
        letterSpacing: "0.3px"
      }}>{children}</div>
    </div>
  );
}
