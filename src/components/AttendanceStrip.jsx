import { useMemo, useState } from "react";
import { calendarDateKey } from "../lib/attendance.js";

const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  rose200: "#F0D5D5",
  rose100: "#FCEAEA",
  cream: "#FAF5F3",
  creamDark: "#F0EBE8",
  border: "#EDE5E2",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  pathPink: "#F4C0CB"
};

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

const STATE_LABEL_COLOR = {
  attended: "#B07F8F",
  today:    "#8E5B6E",
  past:     "#A89B95",
  future:   "#C8BDB6"
};

// ───────────────────────────── Pixel cat (transparent PNG, mirrored right) ─────────────────────────────
// ───────────────────────────── Pixel signpost (START / GOAL) ─────────────────────────────
function PixelSign({ kind }) {
  // kind: "start" | "goal"
  const isStart = kind === "start";
  const palette = isStart
    ? { bg: "#D6EBC8", text: "#3F7232", border: "#3F7232", shadow: "#2D5224" }
    : { bg: "#FFD0DC", text: "#9F3A55", border: "#9F3A55", shadow: "#6E2238" };
  return (
    <div style={{
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      lineHeight: 1,
      pointerEvents: "none",
      userSelect: "none"
    }}>
      <div style={{
        background: palette.bg,
        border: `1.5px solid ${palette.border}`,
        color: palette.text,
        fontFamily: "'Galmuri11', monospace",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0,
        padding: "1px 5px 0",
        // 픽셀 모서리(스텝)
        clipPath:
          "polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)",
        boxShadow: `1px 2px 0 ${palette.shadow}`
      }}>
        {isStart ? "START" : "GOAL"}
      </div>
      {/* 막대기 (목재 폴 느낌) */}
      <div style={{ width: 2, height: 6, background: "#8B6E4E", marginTop: 0 }} />
      <div style={{ width: 4, height: 1, background: "#6E5239" }} />
    </div>
  );
}

function PixelCat({ size = 32 }) {
  // 외곽 wrapper에서 좌우반전을 처리 (img 자체에는 catBob 키프레임이 transform을 점유하므로)
  return (
    <div style={{
      display: "inline-block",
      transform: "scaleX(-1)",
      lineHeight: 0
    }}>
      <img
        src="./pixel-cat.png"
        alt=""
        className="pixel-cat-sprite"
        width={size}
        height={size}
        style={{
          display: "block",
          imageRendering: "pixelated"
        }}
        aria-hidden
      />
    </div>
  );
}

// ───────────────────────────── Pixel flower shapes ─────────────────────────────
// B=petal main, L=petal light, D=petal shadow, Y=center
const FLOWER_SHAPES = [
  // 1. 둥근 5겹꽃 (데이지/벚꽃 풍)
  [
    "................",
    ".....LBBBL......",
    "....LBBBBBL.....",
    "...LBBBYBBBL....",
    "..LBBBYYYBBBL...",
    "..LBBYYDYYBBL...",
    "..LBBBYYYBBBL...",
    "...LBBBYBBBL....",
    "....LBBBBBL.....",
    ".....LBBBL......",
    "................",
    "................"
  ],
  // 2. 옆으로 넓은 꽃 (4잎+가운데)
  [
    "................",
    "...LBBL..LBBL...",
    "..LBBBBLLBBBBL..",
    ".LBBBBBBBBBBBBL.",
    "LBBBBBLYYLBBBBBL",
    "LBBBBLYYYYLBBBBL",
    "LBBBBLYYYYLBBBBL",
    "LBBBBBLYYLBBBBBL",
    ".LBBBBBBBBBBBBL.",
    "..LBBBBLLBBBBL..",
    "...LBBL..LBBL...",
    "................"
  ],
  // 3. 튤립 / 세로로 봉긋한 꽃
  [
    "................",
    ".....LBBBL......",
    "....LBBBBBL.....",
    "....LBBBBBL.....",
    "....LBBYBBL.....",
    "....LBYYYBL.....",
    "....LBBYBBL.....",
    "....LBBBBBL.....",
    ".....LBBBL......",
    "......LDL.......",
    "................",
    "................"
  ],
  // 4. 작은 꽃 + 잎
  [
    "................",
    "......BBB.......",
    ".....BLLBB......",
    "....BLLYLLB.....",
    "....BLYYYLB.....",
    "....BLLYLLB.....",
    ".....BLLBB......",
    "......BBB.......",
    "................",
    ".LD..........DL.",
    "LLDD........DDLL",
    "LLDD........DDLL"
  ],
  // 5. 비대칭 들꽃 (오른쪽 큼직)
  [
    "................",
    "...LBBBLLBBBL...",
    "..LBBBBBBBBBBL..",
    "..LBBBYYYBBBBL..",
    ".LBBBYYYYYBBBL..",
    ".LBBBYYDYYBBBL..",
    ".LBBBBYYYBBBBL..",
    "..LBBBBBBBBBL...",
    "...LBBBBBBBL....",
    "....LBBBBBL.....",
    "................",
    "................"
  ],
  // 6. 옆으로 살짝 기운 꽃
  [
    "................",
    "....LBBBBL......",
    "...LBBBBBBL.....",
    "..LBBBYBBBBL....",
    "..LBBYYYBBBL....",
    "..LBBYDYBBBL....",
    "..LBBBYBBBL.....",
    "...LBBBBBL......",
    "....LBBBL.......",
    ".....LBL........",
    "................",
    "................"
  ]
];
// Keep alias for downstream code that still says STONE_SHAPES
const STONE_SHAPES = FLOWER_SHAPES;

// 벡터 꽃 — 원 N개로 꽃잎 + 가운데 꽃심. 어떤 각도에서도 깨끗.
const ATTENDED_PALETTES = [
  { petal: "#FCD0D9", petalDark: "#E8AFC0", center: "#FFD876" }, // 핑크
  { petal: "#DCC6E8", petalDark: "#BFA8D0", center: "#FFD876" }, // 라벤더
  { petal: "#FCE9A8", petalDark: "#E0C880", center: "#F5A040" }, // 옐로우
  { petal: "#FCC8B8", petalDark: "#DFA095", center: "#FFD876" }, // 코랄피치
  { petal: "#C8E4D2", petalDark: "#A4C5B0", center: "#FFD876" }, // 민트
  { petal: "#C8DEF0", petalDark: "#A4BFD5", center: "#FFD876" }, // 스카이
  { petal: "#F4D8E8", petalDark: "#D8B4C8", center: "#FFD876" }, // 베이비 로즈
  { petal: "#E8DCC8", petalDark: "#C4B898", center: "#F5A040" }  // 베이지/크림
];
function PixelStone({ state, day, size = 42, shapeIndex = 0 }) {
  // 출석은 day별로 색상 다양하게, 그 외는 단일 톤
  const attendedPalette = ATTENDED_PALETTES[day % ATTENDED_PALETTES.length];
  const palettes = {
    attended: attendedPalette,
    today:    { petal: "#FAB7C8", petalDark: "#D894AA", center: "#FFC840" },
    past:     { petal: "#B8AFA9", petalDark: "#8A827C", center: "#9A9180" },  // 더 어둡게
    future:   { petal: "#F4EFEB", petalDark: "#D6CDC6", center: "#E8DFCC" }   // 유지
  };
  const p = palettes[state];
  const variants = [
    { petals: 5, petalR: 0.22, centerR: 0.13, offset: 0.26 },
    { petals: 4, petalR: 0.26, centerR: 0.14, offset: 0.27 },
    { petals: 6, petalR: 0.19, centerR: 0.15, offset: 0.26 },
    { petals: 5, petalR: 0.20, centerR: 0.17, offset: 0.24 },
    { petals: 8, petalR: 0.15, centerR: 0.16, offset: 0.27 },
    { petals: 5, petalR: 0.24, centerR: 0.12, offset: 0.27 }
  ];
  const v = variants[shapeIndex % variants.length];
  const cx = size / 2;
  const cy = size / 2;
  const petalR = size * v.petalR;
  const centerR = size * v.centerR;
  const offset = size * v.offset;
  const angles = Array.from({ length: v.petals }, (_, i) => (i * 360) / v.petals);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {/* 꽃잎 그림자 */}
      {angles.map((a, i) => {
        const rad = (a * Math.PI) / 180;
        const x = cx + Math.cos(rad) * offset;
        const y = cy + Math.sin(rad) * offset;
        return <circle key={`d-${i}`} cx={x + 0.6} cy={y + 0.8} r={petalR} fill={p.petalDark} />;
      })}
      {/* 꽃잎 */}
      {angles.map((a, i) => {
        const rad = (a * Math.PI) / 180;
        const x = cx + Math.cos(rad) * offset;
        const y = cy + Math.sin(rad) * offset;
        return <circle key={`p-${i}`} cx={x} cy={y} r={petalR} fill={p.petal} />;
      })}
      {/* 꽃심 */}
      <circle cx={cx} cy={cy} r={centerR} fill={p.center} />
    </svg>
  );
}

// ───────────────────────────── Yearly aggregator ─────────────────────────────
function buildYearlyData(attendanceDates, year) {
  const setOfDates = new Set(attendanceDates);
  const data = [];
  for (let m = 1; m <= 12; m++) {
    const days = new Date(year, m, 0).getDate();
    let count = 0;
    for (let dd = 1; dd <= days; dd++) {
      const k = `${year}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      if (setOfDates.has(k)) count++;
    }
    data.push({ month: m, count, days, rate: count / days });
  }
  return data;
}

// ───────────────────────────── Main ─────────────────────────────
export default function AttendanceStrip({ attendanceDates, today, year, month }) {
  const [mode, setMode] = useState("week");
  // useLiveQuery 일시 undefined 가드
  const safeDates = Array.isArray(attendanceDates) ? attendanceDates : [];
  const safeToday = today instanceof Date ? today : new Date();

  const attendanceSet = useMemo(() => new Set(safeDates), [safeDates]);
  const isViewingCurrent = year === safeToday.getFullYear() && month === safeToday.getMonth() + 1;
  const todayDay = isViewingCurrent ? today.getDate() : null;
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const firstDow = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);

  // 이번 달 daily
  const daily = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const key = calendarDateKey(year, month, day);
      const attended = attendanceSet.has(key);
      const isToday = todayDay === day;
      const isFuture = todayDay != null && day > todayDay;
      let state;
      if (isToday) state = "today";
      else if (attended) state = "attended";
      else if (isFuture) state = "future";
      else state = "past";
      return { day, attended, isToday, isFuture, state };
    });
  }, [attendanceSet, daysInMonth, todayDay, year, month]);

  // 월간(전체 달) 주(week) 단위로
  const weekRows = useMemo(() => {
    const rows = [];
    let cur = Array(firstDow).fill(null);
    for (const d of daily) {
      cur.push(d);
      if (cur.length === 7) { rows.push(cur); cur = []; }
    }
    if (cur.length) {
      while (cur.length < 7) cur.push(null);
      rows.push(cur);
    }
    return rows;
  }, [daily, firstDow]);

  // 주간: 오늘이 속한 일~토 (이번 달 보기일 때만; 아니면 1일 포함 주)
  const currentWeek = useMemo(() => {
    const anchor = todayDay ?? 1;
    const dow = new Date(year, month - 1, anchor).getDay();
    // 일요일을 주 시작으로
    const sundayOfThisWeek = anchor - dow;
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = sundayOfThisWeek + i;
      if (day < 1 || day > daysInMonth) {
        week.push(null);
        continue;
      }
      week.push(daily[day - 1]);
    }
    return week;
  }, [daily, todayDay, year, month, daysInMonth]);

  const catDay = useMemo(() => {
    if (todayDay) return todayDay;
    const attended = daily.filter((d) => d.attended).map((d) => d.day);
    return attended.length > 0 ? attended[attended.length - 1] : 1;
  }, [todayDay, daily]);

  const thisMonthCount = daily.filter((d) => d.attended).length;

  const yearlyData = useMemo(() => buildYearlyData(safeDates, year), [safeDates, year]);
  const yearlyTotal = yearlyData.reduce((s, m) => s + m.count, 0);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-title" style={{ marginBottom: 4 }}>
        🐾 출석 도장
        <span className="section-meta">
          이번 달 {thisMonthCount}/{daysInMonth}일 · 누적 {safeDates.length}일
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          fontFamily: "'Galmuri11', monospace",
          fontSize: 14,
          color: R.rose500,
          letterSpacing: "-0.3px"
        }}>
          {mode === "year"
            ? `${year}년`
            : mode === "week"
              ? `이번 주 (${month}월)`
              : `이번 달 · ${year}.${String(month).padStart(2, "0")}`}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "week",  label: "주간" },
            { key: "month", label: "월간" },
            { key: "year",  label: "연간" }
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className="btn btn-sm"
              style={mode === opt.key ? { background: R.rose400, color: "#fff", borderColor: R.rose400 } : {}}
            >{opt.label}</button>
          ))}
        </div>
      </div>

      {mode === "week"  && <DailyPath weekRows={[currentWeek]} catDay={catDay} singleRow />}
      {mode === "month" && <DailyPath weekRows={weekRows} catDay={catDay} showSigns lastDay={daysInMonth} />}
      {mode === "year"  && <YearlyLine data={yearlyData} year={year} total={yearlyTotal} />}
    </div>
  );
}

// ───────────────────────────── Daily path (week/month) ─────────────────────────────
function DailyPath({ weekRows, catDay, singleRow = false, showSigns = false, lastDay }) {
  const STONE_W = singleRow ? 52 : 44;
  const STONE_H = STONE_W;
  const ROW_PADDING_TOP = singleRow ? 44 : 46;
  const ROW_PADDING_BOTTOM = showSigns ? 26 : 10;  // GOAL 표지판 공간
  const STONE_ROW_HEIGHT = STONE_H + ROW_PADDING_TOP + ROW_PADDING_BOTTOM;
  const LABEL_ROW_HEIGHT = 22;
  const WEEK_ROW_GAP = 6;

  return (
    <div>
      {/* 요일 라벨 */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        marginBottom: 4, padding: "0 2px"
      }}>
        {WEEK_LABELS.map((d, i) => (
          <div key={d} style={{
            textAlign: "center", fontSize: 10, fontWeight: 700,
            color: i === 0 ? R.rose400 : i === 6 ? "#7E9EC0" : R.textLight,
            letterSpacing: 0.5
          }}>{d}</div>
        ))}
      </div>

      {weekRows.map((row, ri) => {
        // 벡터 꽃: 회전 자유. jitter·사이즈·회전·모양으로 다양화.
        const stones = row.map((d, ci) => {
          if (!d) return null;
          const seed1 = Math.sin(d.day * 12.9898 + ri * 78.233) * 43758.5453;
          const seed2 = Math.sin(d.day * 39.345 + ri * 11.135) * 7281.111;
          const seed3 = Math.sin(d.day * 78.123 + ri * 4.567) * 9123.999;
          const r1 = seed1 - Math.floor(seed1);
          const r2 = seed2 - Math.floor(seed2);
          const r3 = seed3 - Math.floor(seed3);
          const jitter = Math.floor(r1 * 11) - 5;
          const sizeDelta = Math.floor(r2 * 9) - 4;
          const rotation = Math.floor(r3 * 73) - 36;   // -36 ~ +36도 (꽃은 더 자유롭게)
          const shapeIndex = (d.day * 3 + ri) % 6;
          return { d, ci, jitter, sizeDelta, rotation, shapeIndex };
        });

        // 분홍 실선 시작/끝 인덱스 (이 row의 첫번째/마지막 유효 칸)
        const firstCi = stones.findIndex((s) => s);
        const lastCi = stones.length - 1 - [...stones].reverse().findIndex((s) => s);
        const lineLeftPct = firstCi >= 0 ? ((firstCi + 0.5) / 7) * 100 : 0;
        const lineRightPct = lastCi >= 0 ? ((lastCi + 0.5) / 7) * 100 : 100;

        return (
          <div key={ri} style={{ marginTop: ri === 0 ? 0 : WEEK_ROW_GAP }}>
            {/* 디딤돌 row */}
            <div style={{ position: "relative", height: STONE_ROW_HEIGHT, padding: "0 2px" }}>
              {stones.map((s) => {
                if (!s) return null;
                const leftPct = (s.ci / 7) * 100;
                const widthPct = 100 / 7;
                const isCatStone = s.d.day === catDay;
                return (
                  <div key={s.d.day} style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: ROW_PADDING_TOP + s.jitter,
                    display: "flex", justifyContent: "center",
                    zIndex: isCatStone ? 100 : 2   // 고양이가 있는 칸을 통째로 맨 앞
                  }}>
                    <div style={{ position: "relative" }}>
                      <div style={{ transform: `rotate(${s.rotation}deg)`, transformOrigin: "center" }}>
                        <PixelStone
                          state={s.d.state}
                          day={s.d.day}
                          size={STONE_W + s.sizeDelta}
                          shapeIndex={s.shapeIndex}
                        />
                      </div>
                      {showSigns && (s.d.day === 1 || s.d.day === lastDay) && (
                        <div style={{
                          position: "absolute",
                          // 1일 = 꽃 좌상단 / 말일 = 꽃 우하단
                          ...(s.d.day === 1
                            ? { left: -16, bottom: STONE_H + 6 }
                            : { right: -16, top: STONE_H + 6 }),
                          pointerEvents: "none",
                          zIndex: 20
                        }}>
                          <PixelSign kind={s.d.day === 1 ? "start" : "goal"} />
                        </div>
                      )}
                      {s.d.day === catDay && (
                        <div style={{
                          position: "absolute",
                          left: "50%",
                          bottom: STONE_H + 2,            // 꽃 위 살짝 — 요일 라벨과는 여유
                          transform: "translateX(-50%)",
                          pointerEvents: "none",
                          zIndex: 100,
                          filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.18))"
                        }}>
                          <PixelCat size={singleRow ? 44 : 38} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 날짜 라벨 row — 분홍 실선이 가운데를 가로지름 */}
            <div style={{ position: "relative", height: LABEL_ROW_HEIGHT }}>
              {firstCi !== lastCi && (
                <div style={{
                  position: "absolute",
                  left: `${lineLeftPct}%`,
                  width: `${lineRightPct - lineLeftPct}%`,
                  top: "50%",
                  height: 1,
                  background: R.pathPink,
                  opacity: 0.5,
                  pointerEvents: "none"
                }} />
              )}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                position: "relative", height: "100%"
              }}>
                {row.map((d, ci) => (
                  <div key={ci} style={{
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {d ? (
                      <span style={{
                        display: "inline-block",
                        fontFamily: "'Galmuri11', monospace",
                        fontSize: 11,
                        color: STATE_LABEL_COLOR[d.state],
                        background: "#FFFEFD",
                        padding: "0 4px",
                        letterSpacing: "-0.3px",
                        lineHeight: 1
                      }}>{d.day}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── Yearly line chart ─────────────────────────────
function YearlyLine({ data, year, total }) {
  // 수입·지출·저축 추이 차트와 비슷한 크기로 맞춤 — 더 넓고 낮은 viewBox
  const W = 360;
  const H = 110;
  const PAD_L = 14;
  const PAD_R = 14;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const points = data.map((m, i) => {
    const x = PAD_L + (i / 11) * innerW;
    const y = PAD_TOP + (1 - m.rate) * innerH;
    return { x, y, m };
  });
  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");

  return (
    <div>
      <div style={{
        fontSize: 11, color: R.textLight, marginBottom: 6, padding: "0 4px"
      }}>
        {year}년 — 총 {total}일 출석
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", maxHeight: 220, display: "block" }}
      >
        {/* 가로 가이드 라인 */}
        {[0.25, 0.5, 0.75, 1].map((r) => {
          const y = PAD_TOP + (1 - r) * innerH;
          return (
            <line
              key={r}
              x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
              stroke="#EDE5E2"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          );
        })}
        {/* 영역 채우기 */}
        <path
          d={`${pathD} L ${points[points.length - 1].x} ${H - PAD_BOTTOM} L ${points[0].x} ${H - PAD_BOTTOM} Z`}
          fill={R.rose400} opacity="0.13"
        />
        {/* 라인 — 다른 차트의 strokeWidth 2px / dot r 3px 와 시각적으로 매칭 */}
        <path
          d={pathD}
          fill="none"
          stroke={R.rose400}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 데이터 점 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="1.9" fill={R.rose400} stroke="#fff" strokeWidth="0.8" />
            <title>{`${p.m.month}월 — ${p.m.count}/${p.m.days}일 (${Math.round(p.m.rate * 100)}%)`}</title>
          </g>
        ))}
        {/* x축 월 라벨 — 다른 차트의 11px tick과 일관 */}
        {MONTH_LABELS.map((label, i) => (
          <text
            key={i}
            x={PAD_L + (i / 11) * innerW}
            y={H - 6}
            textAnchor="middle"
            fontSize="6.5"
            fill={R.textLight}
            fontWeight={500}
          >{label}</text>
        ))}
      </svg>
    </div>
  );
}
