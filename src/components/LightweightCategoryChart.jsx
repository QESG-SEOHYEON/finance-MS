import { useEffect, useRef } from "react";
import {
  createChart, LineSeries, AreaSeries, LineStyle, LineType, CrosshairMode
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

function computeMinMove(maxAbs) {
  if (maxAbs >= 100000000) return 1000000;
  if (maxAbs >= 10000000) return 100000;
  if (maxAbs >= 1000000) return 10000;
  if (maxAbs >= 100000) return 1000;
  if (maxAbs >= 10000) return 100;
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

export default function LightweightCategoryChart({
  data,
  categories,
  xUnit,
  windowStart,
  windowEnd,
  onAutoUnit,
  R,
  height = 280
}) {
  const containerRef = useRef(null);
  const legendRef = useRef(null);
  const chartRef = useRef(null);
  // 카테고리 key → series ref
  const seriesMapRef = useRef(new Map());
  const lastRowsRef = useRef([]);

  // 차트 1회 생성
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
        vertLine: { color: R.rose300, width: 1, labelBackgroundColor: R.rose500 },
        horzLine: { color: R.rose300, width: 1, labelBackgroundColor: R.rose500 }
      },
      rightPriceScale: {
        borderColor: R.border,
        autoScale: true,
        scaleMargins: { top: 0.08, bottom: 0.04 },
        entireTextOnly: false,
        minimumWidth: 56
      },
      leftPriceScale: { visible: false },
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

    const updateLegend = (param) => {
      const el = legendRef.current;
      if (!el) return;
      const map = seriesMapRef.current;
      let time, values;
      if (param && param.time && param.seriesData) {
        time = param.time;
        values = new Map();
        for (const [key, { series }] of map.entries()) {
          const v = param.seriesData.get(series);
          values.set(key, v?.value);
        }
      } else {
        const rows = lastRowsRef.current;
        const last = rows[rows.length - 1];
        if (!last) { el.innerHTML = ""; return; }
        time = last._time;
        values = new Map();
        for (const c of categories) values.set(c.key, last[c.key]);
      }
      const items = categories.map((c) => {
        const v = values.get(c.key);
        if (v == null) return "";
        return `
          <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${R.textDark};font-weight:700">
            <span style="width:8px;height:8px;border-radius:2px;background:${c.color || R.rose400}"></span>
            <span style="color:${R.textLight};font-weight:600">${c.icon || ""} ${c.label}</span>
            <span>${fmtWon(v)}</span>
          </div>`;
      }).join("");
      el.innerHTML = `
        <div style="font-size:11px;color:${R.textLight};font-weight:700;margin-bottom:4px;letter-spacing:0.3px">
          ${fmtTimeLabel(time, xUnit)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;row-gap:4px">
          ${items}
        </div>`;
    };
    chart.subscribeCrosshairMove(updateLegend);
    chart._updateLegend = updateLegend;

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
      seriesMapRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // xUnit → tickMarkFormatter
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      tickMarkFormatter: makeTickFormatter(xUnit)
    });
    if (chartRef.current._updateLegend) chartRef.current._updateLegend(null);
  }, [xUnit]);

  // categories 변화 → 시리즈 재구성
  const catSignature = categories.map((c) => `${c.key}|${c.color || ""}`).join(",");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // 기존 시리즈 모두 제거
    for (const { series } of seriesMapRef.current.values()) {
      try { chart.removeSeries(series); } catch (_) {}
    }
    seriesMapRef.current = new Map();
    // 신규 시리즈 생성
    for (const c of categories) {
      const series = chart.addSeries(LineSeries, {
        color: c.color || R.rose400,
        lineWidth: 1,
        lineType: LineType.Curved,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderWidth: 2,
        crosshairMarkerBackgroundColor: c.color || R.rose400,
        title: ""
      });
      seriesMapRef.current.set(c.key, { series, category: c });
    }
    // 데이터 재set (categories 변경 시 신규 시리즈 비어있음)
    const rows = lastRowsRef.current;
    if (rows.length > 0) {
      for (const c of categories) {
        const series = seriesMapRef.current.get(c.key)?.series;
        if (series) series.setData(rows.map((d) => ({ time: d._time, value: d[c.key] || 0 })));
      }
    }
    if (chart._updateLegend) chart._updateLegend(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catSignature]);

  // 데이터 set
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data) return;
    if (seriesMapRef.current.size === 0) return; // 시리즈 아직 미생성
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

    let maxAbs = 0;
    for (const c of categories) {
      const series = seriesMapRef.current.get(c.key)?.series;
      if (series) series.setData(rows.map((d) => ({ time: d._time, value: d[c.key] || 0 })));
      for (const d of rows) {
        const a = Math.abs(Number(d[c.key]) || 0);
        if (a > maxAbs) maxAbs = a;
      }
    }
    const fmt = makePriceFormat(maxAbs);
    for (const { series } of seriesMapRef.current.values()) {
      series.applyOptions({ priceFormat: fmt });
    }

    // setData 직후 visibleRange 즉시 — buffer 깜빡임 방지
    if (rows.length > 0 && windowStart && windowEnd) {
      try {
        chart.timeScale().setVisibleRange({ from: windowStart, to: windowEnd });
      } catch (_) {}
    }

    if (chart._updateLegend) chart._updateLegend(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, xUnit, catSignature, windowStart, windowEnd]);

  // 줌인/줌아웃 시 단위 자동 추천 (디바운스)
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

  const handleReset = () => {
    if (chartRef.current && windowStart && windowEnd) {
      try {
        chartRef.current.timeScale().setVisibleRange({ from: windowStart, to: windowEnd });
      } catch (_) {}
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
