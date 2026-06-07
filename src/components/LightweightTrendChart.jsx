import { useEffect, useRef } from "react";
import {
  createChart, AreaSeries, LineSeries, LineStyle, LineType, CrosshairMode
} from "lightweight-charts";

function toTime(d, xUnit) {
  const y = d.year;
  const m = String(d.month || 1).padStart(2, "0");
  const dd = String(d.day || 1).padStart(2, "0");
  if (xUnit === "year") return `${y}-12-31`;
  if (xUnit === "day") return `${y}-${m}-${dd}`;
  return `${y}-${m}-01`;
}

function fmtCompact(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 100000000) return `${sign}${Math.round(abs / 100000000 * 10) / 10}억`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 10000)}만`;
  if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}천`;
  if (abs === 0) return "0";
  return `${sign}${Math.round(abs)}`;
}

// 데이터 max 절댓값에 맞춰 최소 변화 단위 계산 (라벨 정밀도)
function computeMinMove(maxAbs) {
  if (maxAbs >= 100000000) return 1000000; // 1억대 → 100만 단위
  if (maxAbs >= 10000000) return 100000;   // 1천만대 → 10만 단위
  if (maxAbs >= 1000000) return 10000;     // 100만대 → 1만 단위
  if (maxAbs >= 100000) return 1000;       // 10만대 → 천 단위
  if (maxAbs >= 10000) return 100;         // 1만대 → 백 단위
  if (maxAbs >= 1000) return 10;
  return 1;
}
const makePriceFormat = (maxAbs) => ({
  type: "custom",
  formatter: (v) => fmtCompact(v),
  minMove: computeMinMove(maxAbs)
});

function fmtWon(n) {
  return (n < 0 ? "-" : "") + Math.abs(n).toLocaleString() + "원";
}

// time 객체(BusinessDay) | UTC seconds | string → Date
function timeToDate(t) {
  if (!t) return null;
  if (typeof t === "string") return new Date(t);
  if (typeof t === "number") return new Date(t * 1000);
  if (typeof t === "object" && "year" in t) return new Date(t.year, (t.month || 1) - 1, t.day || 1);
  return null;
}

function makeTickFormatter(xUnit) {
  return (time) => {
    const d = timeToDate(time);
    if (!d) return "";
    if (xUnit === "year") return `${d.getFullYear()}`;
    if (xUnit === "day") return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
}

function fmtTimeLabel(time, xUnit) {
  const d = timeToDate(time);
  if (!d) return "";
  if (xUnit === "year") return `${d.getFullYear()}년`;
  if (xUnit === "day") return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function LightweightTrendChart({
  data,
  xUnit,
  seriesShow,
  showSavingRate,
  showPlanned,
  windowStart,
  windowEnd,
  onAutoUnit,
  R,
  height = 280
}) {
  const containerRef = useRef(null);
  const legendRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRefs = useRef({});
  const lastRowsRef = useRef([]);

  // 차트 생성 (1회)
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: "solid", color: "rgba(255, 253, 253, 0)" },
        textColor: R.textMid,
        fontFamily: "inherit",
        fontSize: 11,
        attributionLogo: false
      },
      grid: {
        vertLines: { color: R.border, style: LineStyle.Dotted },
        horzLines: { color: R.border, style: LineStyle.Dotted }
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: R.rose300, width: 1, style: LineStyle.Solid,
          labelBackgroundColor: R.rose500
        },
        horzLine: {
          color: R.rose300, width: 1, style: LineStyle.Solid,
          labelBackgroundColor: R.rose500
        }
      },
      rightPriceScale: {
        borderColor: R.border,
        autoScale: true,
        scaleMargins: { top: 0.08, bottom: 0.04 },
        entireTextOnly: false,
        minimumWidth: 56
      },
      leftPriceScale: {
        visible: false,
        borderColor: R.border,
        scaleMargins: { top: 0.08, bottom: 0.04 },
        entireTextOnly: false
      },
      timeScale: {
        borderColor: R.border,
        timeVisible: false,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 36,
        minBarSpacing: 3,
        tickMarkFormatter: makeTickFormatter(xUnit)
      },
      localization: {
        locale: "ko-KR",
        priceFormatter: (price) => fmtCompact(price)
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true }
    });
    chartRef.current = chart;

    // 시리즈
    const incomeArea = chart.addSeries(AreaSeries, {
      lineColor: R.mint, topColor: R.mint + "55", bottomColor: R.mint + "00",
      lineWidth: 1, lineType: LineType.Curved,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerRadius: 5, crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: R.mint,
      title: ""
    });
    const expenseArea = chart.addSeries(AreaSeries, {
      lineColor: R.rose400, topColor: R.rose400 + "44", bottomColor: R.rose400 + "00",
      lineWidth: 1, lineType: LineType.Curved,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerRadius: 5, crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: R.rose400,
      title: ""
    });
    const savingsArea = chart.addSeries(AreaSeries, {
      lineColor: R.lavender, topColor: R.lavender + "60", bottomColor: R.lavender + "08",
      lineWidth: 2, lineType: LineType.Curved,
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerRadius: 6, crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: R.lavender,
      title: ""
    });
    const incomePlan = chart.addSeries(LineSeries, {
      color: R.mint, lineWidth: 1, lineStyle: LineStyle.Dashed, lineType: LineType.Curved,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: ""
    });
    const expensePlan = chart.addSeries(LineSeries, {
      color: R.rose400, lineWidth: 1, lineStyle: LineStyle.Dashed, lineType: LineType.Curved,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: ""
    });
    const savingsPlan = chart.addSeries(LineSeries, {
      color: R.lavender, lineWidth: 1, lineStyle: LineStyle.Dashed, lineType: LineType.Curved,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: ""
    });
    const rateLine = chart.addSeries(LineSeries, {
      color: "#8FA8C7", lineWidth: 1, lineType: LineType.Curved,
      priceScaleId: "left",
      priceFormat: { type: "custom", formatter: (v) => `${Math.round(v)}%`, minMove: 1 },
      priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerRadius: 4, crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: "#8FA8C7",
      title: ""
    });

    seriesRefs.current = {
      incomeArea, expenseArea, savingsArea,
      incomePlan, expensePlan, savingsPlan,
      rateLine
    };

    // crosshair → legend overlay 업데이트 (DOM 직접 갱신, React state 안 거침)
    const updateLegend = (param) => {
      const el = legendRef.current;
      if (!el) return;
      const s = seriesRefs.current;
      let row, time;
      if (param && param.time && param.seriesData) {
        time = param.time;
        const ia = param.seriesData.get(s.incomeArea);
        const ea = param.seriesData.get(s.expenseArea);
        const sa = param.seriesData.get(s.savingsArea);
        const ip = param.seriesData.get(s.incomePlan);
        const ep = param.seriesData.get(s.expensePlan);
        const sp = param.seriesData.get(s.savingsPlan);
        const rt = param.seriesData.get(s.rateLine);
        row = {
          incomeActual: ia?.value, totalExpenseActual: ea?.value, savingsActual: sa?.value,
          income: ip?.value, totalExpense: ep?.value, savings: sp?.value,
          savingRate: rt?.value
        };
      } else {
        // 마우스 밖 → 마지막 row
        const rows = lastRowsRef.current;
        const last = rows[rows.length - 1];
        if (!last) { el.innerHTML = ""; return; }
        time = last._time;
        row = last;
      }
      const item = (color, label, val, suffix = "") => {
        if (val == null) return "";
        const v = suffix === "%" ? `${Math.round(val)}%` : fmtWon(val);
        return `
          <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${R.textDark};font-weight:700">
            <span style="width:8px;height:8px;border-radius:2px;background:${color}"></span>
            <span style="color:${R.textLight};font-weight:600">${label}</span>
            <span>${v}</span>
          </div>`;
      };
      const planItem = (color, label, val) => {
        if (val == null) return "";
        return `
          <div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:${R.textMid};font-weight:600;opacity:0.8">
            <span style="width:10px;height:1px;border-top:1px dashed ${color}"></span>
            <span>${label} ${fmtCompact(val)}</span>
          </div>`;
      };
      el.innerHTML = `
        <div style="font-size:11px;color:${R.textLight};font-weight:700;margin-bottom:4px;letter-spacing:0.3px">
          ${fmtTimeLabel(time, xUnit)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;row-gap:4px">
          ${seriesShow.income  ? item(R.mint,     "수입",   row.incomeActual)        : ""}
          ${seriesShow.expense ? item(R.rose400,  "지출",   row.totalExpenseActual)  : ""}
          ${seriesShow.savings ? item(R.lavender, "저축",   row.savingsActual)       : ""}
          ${showSavingRate     ? item("#8FA8C7",  "저축률", row.savingRate, "%")     : ""}
        </div>
        ${showPlanned ? `
          <div style="display:flex;flex-wrap:wrap;gap:8px;row-gap:3px;margin-top:3px">
            ${seriesShow.income  ? planItem(R.mint,     "계획수입", row.income)        : ""}
            ${seriesShow.expense ? planItem(R.rose400,  "계획지출", row.totalExpense)  : ""}
            ${seriesShow.savings ? planItem(R.lavender, "계획저축", row.savings)       : ""}
          </div>` : ""}
      `;
    };
    chart.subscribeCrosshairMove(updateLegend);
    // 첫 렌더 시 마지막 값 표시 트리거 (data set 후 호출되도록 ref에 저장)
    chartRef.current._updateLegend = updateLegend;

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(updateLegend);
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // xUnit → tickMarkFormatter 갱신
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      tickMarkFormatter: makeTickFormatter(xUnit)
    });
    if (chartRef.current._updateLegend) chartRef.current._updateLegend(null);
  }, [xUnit]);

  // 데이터 set
  useEffect(() => {
    if (!chartRef.current) return; // 언마운트 race 방어
    const s = seriesRefs.current;
    if (!s.incomeArea || !data) return;
    const seen = new Set();
    const rows = [];
    for (const d of data) {
      const t = toTime(d, xUnit);
      if (seen.has(t)) continue;
      seen.add(t);
      rows.push({ ...d, _time: t });
    }
    rows.sort((a, b) => (a._time < b._time ? -1 : a._time > b._time ? 1 : 0));
    lastRowsRef.current = rows;

    s.incomeArea.setData(rows.map((d) => ({ time: d._time, value: d.incomeActual || 0 })));
    s.expenseArea.setData(rows.map((d) => ({ time: d._time, value: d.totalExpenseActual || 0 })));
    s.savingsArea.setData(rows.map((d) => ({ time: d._time, value: d.savingsActual || 0 })));
    s.incomePlan.setData(rows.map((d) => ({ time: d._time, value: d.income || 0 })));
    s.expensePlan.setData(rows.map((d) => ({ time: d._time, value: d.totalExpense || 0 })));
    s.savingsPlan.setData(rows.map((d) => ({ time: d._time, value: d.savings || 0 })));
    s.rateLine.setData(rows.map((d) => ({ time: d._time, value: d.savingRate || 0 })));

    // 데이터 범위에 맞춰 가격 라벨 정밀도 자동 조정
    let maxAbs = 0;
    for (const d of rows) {
      const vals = [d.incomeActual, d.totalExpenseActual, d.savingsActual, d.income, d.totalExpense, d.savings];
      for (const v of vals) {
        const a = Math.abs(Number(v) || 0);
        if (a > maxAbs) maxAbs = a;
      }
    }
    const fmt = makePriceFormat(maxAbs);
    s.incomeArea.applyOptions({ priceFormat: fmt });
    s.expenseArea.applyOptions({ priceFormat: fmt });
    s.savingsArea.applyOptions({ priceFormat: fmt });
    s.incomePlan.applyOptions({ priceFormat: fmt });
    s.expensePlan.applyOptions({ priceFormat: fmt });
    s.savingsPlan.applyOptions({ priceFormat: fmt });

    // setData 직후 visibleRange 즉시 적용 — fitContent 자동 적용으로 buffer 까지 보이는 깜빡임 방지
    if (rows.length > 0 && windowStart && windowEnd && chartRef.current) {
      try {
        chartRef.current.timeScale().setVisibleRange({ from: windowStart, to: windowEnd });
      } catch (_) {/* 데이터 범위 밖이면 무시 */}
    }

    if (chartRef.current?._updateLegend) chartRef.current._updateLegend(null);
  }, [data, xUnit, windowStart, windowEnd]);

  // 줌인/줌아웃 시 visible range duration 보고 단위 자동 추천 (디바운스)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onAutoUnit) return;
    let debounceId = null;
    const handler = (range) => {
      if (!range) return;
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        const fromD = timeToDate(range.from);
        const toD = timeToDate(range.to);
        if (!fromD || !toD) return;
        const days = (toD - fromD) / 86400000;
        let suggested;
        if (days < 75) suggested = "day";
        else if (days < 1100) suggested = "month";
        else suggested = "year";
        if (suggested !== xUnit) onAutoUnit(suggested, range);
      }, 350);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(handler);
    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
      if (debounceId) clearTimeout(debounceId);
    };
  }, [xUnit, onAutoUnit]);

  // visibility
  useEffect(() => {
    const s = seriesRefs.current;
    if (!s.incomeArea) return;
    s.incomeArea.applyOptions({ visible: !!seriesShow.income });
    s.expenseArea.applyOptions({ visible: !!seriesShow.expense });
    s.savingsArea.applyOptions({ visible: !!seriesShow.savings });
    s.incomePlan.applyOptions({ visible: !!seriesShow.income && !!showPlanned });
    s.expensePlan.applyOptions({ visible: !!seriesShow.expense && !!showPlanned });
    s.savingsPlan.applyOptions({ visible: !!seriesShow.savings && !!showPlanned });
    s.rateLine.applyOptions({ visible: !!showSavingRate });
    chartRef.current?.priceScale("left").applyOptions({ visible: !!showSavingRate });
    if (chartRef.current?._updateLegend) chartRef.current._updateLegend(null);
  }, [seriesShow, showSavingRate, showPlanned]);

  const handleReset = () => {
    if (chartRef.current && windowStart && windowEnd) {
      try {
        chartRef.current.timeScale().setVisibleRange({ from: windowStart, to: windowEnd });
      } catch (_) {/* 데이터 범위 밖이면 무시 */}
    }
  };

  return (
    <div
      onDoubleClick={handleReset}
      style={{
        position: "relative", width: "100%", height,
        background: `linear-gradient(180deg, #FFFDFD 0%, #FAF5F3 100%)`,
        borderRadius: 12,
        border: `1px solid ${R.border}`,
        overflow: "hidden"
      }}
    >
      <div
        ref={legendRef}
        style={{
          position: "absolute", top: 10, left: 14, zIndex: 2,
          background: "rgba(255, 255, 255, 0.86)",
          backdropFilter: "blur(4px)",
          padding: "8px 12px",
          borderRadius: 10,
          border: `1px solid ${R.border}`,
          pointerEvents: "none",
          maxWidth: "calc(100% - 28px)"
        }}
      />
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
