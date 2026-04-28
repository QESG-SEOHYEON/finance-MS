// 픽셀 하트 — 검정 테두리 + 붉은 fill + 좌상단 흰색 하이라이트.
// fill(0~1) 에 따라 fill 레이어가 아래→위로 채워짐. 테두리·하이라이트는 항상 유지.

const DEFAULT_FILL = "#E8537A";
const DEFAULT_EMPTY = "#F4D4DC";
const OUTLINE = "#2A1A1F";
const HIGHLIGHT = "#FFF0F3";

// 7x6 Nintendo 스타일 픽셀 하트.
// # = outline, f = fill, * = highlight, . = 투명
//  . # # . # # .
//  # f * # f f #
//  # * f f f f #
//  . # f f f # .
//  . . # f # . .
//  . . . # . . .

const OUTLINE_RECTS = [
  [1, 0, 1, 1], [2, 0, 1, 1], [4, 0, 1, 1], [5, 0, 1, 1],
  [0, 1, 1, 1], [3, 1, 1, 1], [6, 1, 1, 1],
  [0, 2, 1, 1], [6, 2, 1, 1],
  [1, 3, 1, 1], [5, 3, 1, 1],
  [2, 4, 1, 1], [4, 4, 1, 1],
  [3, 5, 1, 1]
];
const FILL_RECTS = [
  [1, 1, 1, 1], [2, 1, 1, 1], [4, 1, 1, 1], [5, 1, 1, 1],
  [1, 2, 5, 1],
  [2, 3, 3, 1],
  [3, 4, 1, 1]
];
const HIGHLIGHT_RECTS = [
  [2, 1, 1, 1], // 상단 포인트
  [1, 2, 1, 1]  // 좌측 중간
];

function HeartSVG({ fillColor, size, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 6"
      shapeRendering="crispEdges"
      style={{ display: "block", ...style }}
    >
      {/* 채움 */}
      <g fill={fillColor}>
        {FILL_RECTS.map(([x, y, w, h], i) => (
          <rect key={`f${i}`} x={x} y={y} width={w} height={h} />
        ))}
      </g>
      {/* 테두리 */}
      <g fill={OUTLINE}>
        {OUTLINE_RECTS.map(([x, y, w, h], i) => (
          <rect key={`o${i}`} x={x} y={y} width={w} height={h} />
        ))}
      </g>
      {/* 하이라이트 (fill 위에 덮어씌움) */}
      <g fill={HIGHLIGHT}>
        {HIGHLIGHT_RECTS.map(([x, y, w, h], i) => (
          <rect key={`h${i}`} x={x} y={y} width={w} height={h} />
        ))}
      </g>
    </svg>
  );
}

export default function Heart({
  fill = 1,
  size = 22,
  color = DEFAULT_FILL,
  emptyColor = DEFAULT_EMPTY,
  glow = false
}) {
  const pct = Math.max(0, Math.min(1, Number(fill) || 0));
  const common = { position: "absolute", inset: 0 };
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
      {/* 빈 상태 레이어 */}
      <HeartSVG fillColor={emptyColor} size={size} style={common} />
      {/* 채움 레이어 — 하단 pct 만큼만 보이도록 위에서 클립 */}
      {pct > 0 && (
        <div style={{
          ...common,
          clipPath: `inset(${(1 - pct) * 100}% 0 0 0)`,
          WebkitClipPath: `inset(${(1 - pct) * 100}% 0 0 0)`,
          transition: "clip-path 0.6s ease",
          filter: glow && pct >= 1 ? `drop-shadow(0 0 3px ${color})` : undefined
        }}>
          <HeartSVG fillColor={color} size={size} />
        </div>
      )}
    </span>
  );
}

export function CompactHearts({ affinity = 0, size = 14, color = DEFAULT_FILL, emptyColor = DEFAULT_EMPTY }) {
  const a = Math.max(0, Math.min(10, Number(affinity) || 0));
  const perHeart = 10 / 3;
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {[0, 1, 2].map((i) => {
        const fill = Math.max(0, Math.min(1, (a - i * perHeart) / perHeart));
        return (
          <Heart key={i} fill={fill} size={size} color={color} emptyColor={emptyColor} glow={a >= 10} />
        );
      })}
    </span>
  );
}

export function DetailedHearts({ affinity = 0, size = 24, color = DEFAULT_FILL, emptyColor = DEFAULT_EMPTY }) {
  const a = Math.max(0, Math.min(10, Number(affinity) || 0));
  const isMax = a >= 10;
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
      {Array.from({ length: 10 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, a - i));
        return (
          <Heart key={i} fill={fill} size={size} color={color} emptyColor={emptyColor} glow={isMax} />
        );
      })}
    </span>
  );
}
