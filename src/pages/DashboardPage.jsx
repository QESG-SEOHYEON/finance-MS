import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db, PROFILE,
  getMonthStatus, getNetWorth, setNetWorth,
  calcDebtPaidBefore, getExpensesForMonth,
  getCustomGoals, setCustomGoals,
  getCustomCheckpoints, setCustomCheckpoints,
  getMonthSchedule,
  getCashBalance, setCashBalance,
  getUserProfile, mergeProfile,
  getAttendanceDates
} from "../db.js";
import { fmt, fmtWon, getTasksForMonth } from "../schedule.js";
import { currentPhaseFrom, getUserPhases } from "../lib/phase.js";
import { checkpointsForMonth } from "../lib/annual.js";
import { detectRisks } from "../lib/risks.js";
import { EXPENSE_CATEGORIES, mergeCategories } from "../lib/expenseCategories.js";
import { aggregateRange, rollupByYear, aggregateDays } from "../lib/aggregate.js";
import TopBar from "../components/TopBar.jsx";
import MentorCard from "../components/mentor/MentorCard.jsx";
import AttendanceStrip from "../components/AttendanceStrip.jsx";
import NetWorthCard from "../components/NetWorthCard.jsx";
import MoneyInput from "../components/MoneyInput.jsx";
import OrphanRestoreModal from "../components/OrphanRestoreModal.jsx";
import WhatsNewModal from "../components/WhatsNewModal.jsx";
import { isWhatsNewSeen, markWhatsNewSeen, clearWhatsNewSeen } from "../db.js";
import LightweightTrendChart from "../components/LightweightTrendChart.jsx";
import LightweightCategoryChart from "../components/LightweightCategoryChart.jsx";
import { getOrphanedTaskRefs } from "../db.js";
import { computeNetWorth } from "../lib/netWorth.js";
import { IMPACT_BY_KEY } from "../components/AssetTypeGuide.jsx";
import { getInitialLiquid } from "../db.js";

// Rose palette tokens
const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  rose600: "#8B4F4F",
  mint: "#6BAF8D",
  mintLight: "#E8F5EE",
  lavender: "#9B7EC0",
  lavenderLight: "#F3EEF8",
  warm: "#C0A07E",
  warmLight: "#F5F0EA",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  cream: "#FAF5F3",
  creamDark: "#F0EBE8",
  border: "#EDE5E2",
  overBudget: "#C06060",
};

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const dbProfile = useLiveQuery(() => getUserProfile(), [], null);
  const profile = mergeProfile(dbProfile);

  const [netWorth, setNW] = useState(profile.currentNetWorth);
  const [editNW, setEditNW] = useState(false);
  const [nwDraft, setNwDraft] = useState("");

  // 여윳자금 (즉시 인출 가능 현금) — 월별 독립, 과거 월로 이동 가능
  const [cashY, setCashY] = useState(year);
  const [cashM, setCashM] = useState(month);
  const cashSel = useLiveQuery(() => getCashBalance(cashY, cashM), [cashY, cashM], null);
  const cashSelPrev = useLiveQuery(() => {
    const pm = cashM === 1 ? 12 : cashM - 1;
    const py = cashM === 1 ? cashY - 1 : cashY;
    return getCashBalance(py, pm);
  }, [cashY, cashM], null);
  const [editCash, setEditCash] = useState(false);
  const [cashDraft, setCashDraft] = useState("");
  const shiftCashMonth = (dir) => {
    setEditCash(false);
    let nm = cashM + dir, ny = cashY;
    if (nm > 12) { nm = 1; ny++; }
    if (nm < 1) { nm = 12; ny--; }
    setCashM(nm); setCashY(ny);
  };
  const isCashCurrentMonth = cashY === year && cashM === month;

  // Chart range
  const [chartFrom, setChartFrom] = useState(`${year}-01`);
  const [chartTo, setChartTo] = useState(`${year}-12`);
  const [chartData, setChartData] = useState([]);
  const [chartType, setChartType] = useState("area"); // 'area' | 'category'
  const [xUnit, setXUnit] = useState("month"); // 'day' | 'month' | 'year'
  const [showSavingRate, setShowSavingRate] = useState(true);
  const [showPlanned, setShowPlanned] = useState(false);
  const [seriesShow, setSeriesShow] = useState({ income: true, expense: true, savings: true });
  const [yZoom, setYZoom] = useState(1); // 휠 위/아래 = Y축 범위 조절
  const [displayOffset, setDisplayOffset] = useState(0); // 좌우 드래그 — cell 단위 (소수 가능)
  const chartWrapRef = useRef(null);

  useEffect(() => {
    (async () => {
      const v = await getNetWorth();
      // 저장된 순자산이 없으면(0/null) 온보딩 프로필 값으로 폴백
      if ((v == null || v === 0) && dbProfile && dbProfile.currentNetWorth != null) {
        setNW(dbProfile.currentNetWorth);
      } else {
        setNW(v);
      }
    })();
  }, [dbProfile]);

  // Chart data reload when range or DB changes
  const allMonthlyForChart = useLiveQuery(() => db.monthly_status.toArray(), []);
  const allExpensesForChart = useLiveQuery(() => db.expenses.toArray(), []);
  // 양옆 ±BUFFER 만큼 미리 페치 — 라벨/시리즈가 가장자리 너머에서 슬라이드되어 들어오게
  const BUFFER = 3; // 단위 갯수 (month/day=3개월, year=3년 = 36개월)
  useEffect(() => {
    if (allMonthlyForChart === undefined || allExpensesForChart === undefined) return;
    const [fy, fm] = chartFrom.split("-").map(Number);
    const [ty, tm] = chartTo.split("-").map(Number);
    if (!fy || !fm || !ty || !tm) return;
    const bufMonths = xUnit === "year" ? BUFFER * 12 : BUFFER;
    const shift = (s, d) => {
      const [yy, mm] = s.split("-").map(Number);
      const total = yy * 12 + (mm - 1) + d;
      return [Math.floor(total / 12), (total % 12) + 1];
    };
    const [bfy, bfm] = shift(chartFrom, -bufMonths);
    const [bty, btm] = shift(chartTo, bufMonths);
    if (xUnit === "day") {
      aggregateDays(bfy, bfm, bty, btm).then(setChartData);
    } else {
      aggregateRange(bfy, bfm, bty, btm).then((rows) => {
        setChartData(xUnit === "year" ? rollupByYear(rows) : rows);
      });
    }
  }, [chartFrom, chartTo, allMonthlyForChart, allExpensesForChart, xUnit]);

  // 차트 데이터 가공 — 저축률 + 현재월 플래그 + numeric idx
  const enhancedChartData = useMemo(() => {
    return (chartData || []).map((d, i) => ({
      ...d,
      idx: i,
      savingRate: d.incomeActual > 0 ? Math.round((d.savingsActual / d.incomeActual) * 100) : 0,
      isCurrent: d.year === year && d.month === month
    }));
  }, [chartData, year, month]);

  // Y축 컴팩트 포맷 (만/억 단위)
  const fmtCompact = (n) => {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(1)}억`;
    if (abs >= 10000000) return `${sign}${Math.round(abs / 10000000 * 10) / 10}천만`;
    if (abs >= 10000) return `${sign}${Math.round(abs / 10000)}만`;
    if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}천`;
    return `${sign}${abs}`;
  };

// (categoryChartData / chartCategoriesVisible는 allCategories 선언 후로 이동)

  const allMonthly = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const monthRow = useLiveQuery(() => getMonthStatus(year, month), [year, month], null);
  const attendanceDates = useLiveQuery(() => getAttendanceDates(), [], []);

  // orphan task 감지 — SCHEDULE 변경/삭제 후 친구 데이터 안전망
  const allMonthlyForOrphan = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const [orphanCount, setOrphanCount] = useState(0);
  const [showOrphanModal, setShowOrphanModal] = useState(false);
  useEffect(() => {
    getOrphanedTaskRefs().then((list) => setOrphanCount(list.length));
  }, [allMonthlyForOrphan]);

  // v2 업데이트 안내 — 첫 방문자에게만 자동 표시 (dev에선 새 세션마다 한 번씩 강제)
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  useEffect(() => {
    (async () => {
      if (import.meta.env.DEV && !sessionStorage.getItem("whats-new-v3-shown")) {
        await clearWhatsNewSeen("v3");
        sessionStorage.setItem("whats-new-v3-shown", "1");
      }
      const seen = await isWhatsNewSeen("v3");
      if (!seen) setShowWhatsNew(true);
    })();
  }, []);
  const closeWhatsNew = async () => {
    setShowWhatsNew(false);
    await markWhatsNewSeen("v3");
  };
  const expenses = useLiveQuery(() => getExpensesForMonth(year, month), [year, month], []);
  const scheduleRow = useLiveQuery(() => getMonthSchedule(year, month), [year, month], null);

  const customCategoriesList = useLiveQuery(
    () => db.settings.get("custom-categories").then((r) => r?.value || []),
    [],
    []
  );
  const categoryOverrides = useLiveQuery(
    () => db.settings.get("category-overrides").then((r) => r?.value || {}),
    [],
    {}
  );
  const dashboardHidden = useLiveQuery(
    () => db.settings.get("dashboard-categories-hidden").then((r) => r?.value || []),
    [],
    []
  );
  const allCategories = useMemo(
    () => mergeCategories(categoryOverrides || {}, customCategoriesList || []),
    [categoryOverrides, customCategoriesList]
  );
  const toggleDashboardCategory = async (key) => {
    const hidden = dashboardHidden || [];
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    await db.settings.put({ id: "dashboard-categories-hidden", value: next });
  };

  // 카테고리 stack 모드용 — 단위별 카테고리 지출 합계 (양옆 BUFFER 포함)
  const categoryChartData = useMemo(() => {
    if (chartType !== "category" || !allExpensesForChart) return [];
    const [_fy, _fm] = chartFrom.split("-").map(Number);
    const [_ty, _tm] = chartTo.split("-").map(Number);
    if (!_fy || !_fm || !_ty || !_tm) return [];
    const bufMonths = xUnit === "year" ? BUFFER * 12 : BUFFER;
    const shift = (s, d) => {
      const [yy, mm] = s.split("-").map(Number);
      const total = yy * 12 + (mm - 1) + d;
      return [Math.floor(total / 12), (total % 12) + 1];
    };
    const [fy, fm] = shift(chartFrom, -bufMonths);
    const [ty, tm] = shift(chartTo, bufMonths);
    // 카테고리 차트는 nwImpact 무관 모든 카테고리 — 수입/지출/자산 다
    const chartCats = (allCategories || []);
    const remap = (k) => k === "social" ? "leisure" : k === "transit" ? "other" : k;
    const out = [];

    if (xUnit === "year") {
      for (let yy = fy; yy <= ty; yy++) {
        const exp = allExpensesForChart.filter((e) => e.date && e.date.startsWith(`${yy}-`));
        const row = { key: `${yy}`, label: `${yy}`, year: yy };
        for (const c of chartCats) row[c.key] = 0;
        for (const e of exp) {
          const k = remap(e.category);
          if (k in row) row[k] += e.amount;
        }
        out.push(row);
      }
    } else if (xUnit === "day") {
      let yy = fy, mm = fm;
      while (yy < ty || (yy === ty && mm <= tm)) {
        const mmStr = String(mm).padStart(2, "0");
        const dim = new Date(yy, mm, 0).getDate();
        const monthExp = allExpensesForChart.filter((e) => e.date && e.date.startsWith(`${yy}-${mmStr}`));
        for (let d = 1; d <= dim; d++) {
          const dd = String(d).padStart(2, "0");
          const dateStr = `${yy}-${mmStr}-${dd}`;
          const dayExp = monthExp.filter((e) => e.date === dateStr);
          const row = { key: dateStr, label: `${mm}/${d}`, year: yy, month: mm, day: d };
          for (const c of chartCats) row[c.key] = 0;
          for (const e of dayExp) {
            const k = remap(e.category);
            if (k in row) row[k] += e.amount;
          }
          out.push(row);
        }
        mm++;
        if (mm > 12) { mm = 1; yy++; }
      }
    } else {
      let yy = fy, mm = fm;
      while (yy < ty || (yy === ty && mm <= tm)) {
        const mmStr = String(mm).padStart(2, "0");
        const prefix = `${yy}-${mmStr}`;
        const monthExpenses = allExpensesForChart.filter((e) => e.date && e.date.startsWith(prefix));
        const row = { key: prefix, label: `${yy}.${mmStr}`, year: yy, month: mm };
        for (const c of chartCats) row[c.key] = 0;
        for (const e of monthExpenses) {
          const k = remap(e.category);
          if (k in row) row[k] += e.amount;
        }
        out.push(row);
        mm++;
        if (mm > 12) { mm = 1; yy++; }
      }
    }
    return out.map((row, i) => ({ ...row, idx: i }));
  }, [chartType, chartFrom, chartTo, allExpensesForChart, allCategories, xUnit]);

  // 보이는 윈도우의 데이터 인덱스 (currentData 기준) — 양옆 BUFFER 제외한 가운데 부분
  const visibleWindow = useMemo(() => {
    const data = chartType === "category" ? categoryChartData : chartData;
    if (!data || data.length === 0) return { startIdx: 0, endIdx: 0, total: 0, visible: 1, leftBuf: 0 };
    const [fy, fm] = chartFrom.split("-").map(Number);
    const [ty, tm] = chartTo.split("-").map(Number);
    if (!fy || !fm || !ty || !tm) return { startIdx: 0, endIdx: data.length - 1, total: data.length, visible: data.length, leftBuf: 0 };
    let startIdx = 0, endIdx = data.length - 1;
    if (xUnit === "year") {
      startIdx = data.findIndex((d) => d.year >= fy);
      endIdx = data.findLastIndex ? data.findLastIndex((d) => d.year <= ty) : (() => { let i = -1; for (let k = data.length - 1; k >= 0; k--) if (data[k].year <= ty) { i = k; break; } return i; })();
    } else if (xUnit === "day") {
      const startKey = `${fy}-${String(fm).padStart(2, "0")}-01`;
      const tdim = new Date(ty, tm, 0).getDate();
      const endKey = `${ty}-${String(tm).padStart(2, "0")}-${String(tdim).padStart(2, "0")}`;
      startIdx = data.findIndex((d) => (d.key || "") >= startKey);
      let last = -1;
      for (let k = data.length - 1; k >= 0; k--) {
        if ((data[k].key || "") <= endKey) { last = k; break; }
      }
      endIdx = last;
    } else {
      // month
      startIdx = data.findIndex((d) => d.year > fy || (d.year === fy && d.month >= fm));
      let last = -1;
      for (let k = data.length - 1; k >= 0; k--) {
        if (data[k].year < ty || (data[k].year === ty && data[k].month <= tm)) { last = k; break; }
      }
      endIdx = last;
    }
    if (startIdx < 0) startIdx = 0;
    if (endIdx < 0) endIdx = data.length - 1;
    const total = data.length;
    const visible = Math.max(1, endIdx - startIdx + 1);
    return { startIdx, endIdx, total, visible, leftBuf: startIdx };
  }, [chartType, chartData, categoryChartData, chartFrom, chartTo, xUnit]);

  // 차트에 표시할 카테고리 — nwImpact 무관 모든 카테고리. dashboardHidden 토글로 가시성 제어.
  const chartCategoriesVisible = useMemo(
    () => (allCategories || []).filter(
      (c) => !(dashboardHidden || []).includes(c.key)
    ),
    [allCategories, dashboardHidden]
  );

  // Y축 데이터 실제 범위 — wheel zoom 의 기준값 (visible 시리즈만 반영)
  const yDataExtent = useMemo(() => {
    let lo = 0, hi = 0;
    if (chartType === "category") {
      for (const d of categoryChartData) {
        let sum = 0;
        for (const c of chartCategoriesVisible) sum += d[c.key] || 0;
        if (sum > hi) hi = sum;
      }
    } else {
      const keys = [];
      if (seriesShow.income) keys.push("incomeActual");
      if (seriesShow.expense) keys.push("totalExpenseActual");
      if (seriesShow.savings) keys.push("savingsActual");
      if (showPlanned) {
        if (seriesShow.income) keys.push("income");
        if (seriesShow.expense) keys.push("totalExpense");
        if (seriesShow.savings) keys.push("savings");
      }
      for (const d of enhancedChartData) {
        for (const k of keys) {
          const v = d[k];
          if (typeof v === "number") {
            if (v > hi) hi = v;
            if (v < lo) lo = v;
          }
        }
      }
    }
    return { lo, hi };
  }, [chartType, enhancedChartData, categoryChartData, chartCategoriesVisible, showPlanned, seriesShow]);

  // 휠로 줌 조절된 Y축 domain
  const yDomain = useMemo(() => {
    const { lo, hi } = yDataExtent;
    const base = Math.max(Math.abs(lo), hi, 1);
    const top = base / yZoom;
    return [lo < 0 ? -top : 0, top];
  }, [yDataExtent, yZoom]);

  // 월 문자열 (YYYY-MM) 을 delta 만큼 이동
  const shiftMonthStr = useCallback((s, delta) => {
    const [yy, mm] = s.split("-").map(Number);
    if (!yy || !mm) return s;
    const total = yy * 12 + (mm - 1) + delta;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  }, []);

  // 탭/단위/범위 전환 시 줌·드래그 오프셋 초기화
  useEffect(() => {
    setYZoom(1);
    setDisplayOffset(0);
  }, [chartType, xUnit, chartFrom, chartTo]);

  // 보이는 윈도우 한 칸의 데이터 개수 (한 칸 너비 계산용)
  const dataLen = visibleWindow.visible || 1;

  // 단위 변경 시 chartFrom/chartTo도 그 단위에 맞게 자동 세팅
  const onUnitChange = useCallback((u) => {
    setXUnit(u);
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    if (u === "day") {
      // 이번 달 한 달치
      setChartFrom(`${y}-${m}`);
      setChartTo(`${y}-${m}`);
    } else if (u === "month") {
      // 올해 1~12월
      setChartFrom(`${y}-01`);
      setChartTo(`${y}-12`);
    } else if (u === "year") {
      // 최근 5년
      setChartFrom(`${y - 4}-01`);
      setChartTo(`${y}-12`);
    }
  }, []);

  // lightweight-charts 가 visible range 보고 단위 자동 추천 (줌인/줌아웃 시)
  const onAutoUnit = useCallback((suggested, visibleRange) => {
    if (!suggested || suggested === xUnit) return;
    if (!visibleRange) return;
    const toDate = (t) => {
      if (typeof t === "string") return new Date(t);
      if (typeof t === "number") return new Date(t * 1000);
      if (t && typeof t === "object" && "year" in t) return new Date(t.year, (t.month || 1) - 1, t.day || 1);
      return null;
    };
    const from = toDate(visibleRange.from);
    const to = toDate(visibleRange.to);
    if (!from || !to) return;
    const fy = from.getFullYear(), fm = String(from.getMonth() + 1).padStart(2, "0");
    const ty = to.getFullYear(), tm = String(to.getMonth() + 1).padStart(2, "0");
    setXUnit(suggested);
    setChartFrom(`${fy}-${fm}`);
    setChartTo(`${ty}-${tm}`);
  }, [xUnit]);

  // 사용자 선택 범위 → ISO date string (lightweight-charts visibleRange용)
  const windowStart = useMemo(() => {
    const [fy, fm] = chartFrom.split("-").map(Number);
    if (!fy) return null;
    if (xUnit === "year") return `${fy}-01-01`;
    return `${fy}-${String(fm).padStart(2, "0")}-01`;
  }, [chartFrom, xUnit]);
  const windowEnd = useMemo(() => {
    const [ty, tm] = chartTo.split("-").map(Number);
    if (!ty) return null;
    if (xUnit === "year") return `${ty}-12-31`;
    const last = new Date(ty, tm, 0).getDate();
    return `${ty}-${String(tm).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }, [chartTo, xUnit]);

  // X축 domain — 보이는 윈도우 [startIdx, endIdx] + displayOffset (소수 가능)
  const xDomain = useMemo(() => {
    const a = visibleWindow.startIdx + displayOffset;
    const b = visibleWindow.endIdx + displayOffset;
    return [a, b];
  }, [visibleWindow.startIdx, visibleWindow.endIdx, displayOffset]);

  // ticks — 보이는 영역 + buffer 약간 (양옆 1개씩 자연스럽게 슬라이드되어 들어오게)
  const xTicks = useMemo(() => {
    const data = chartType === "category" ? categoryChartData : enhancedChartData;
    if (!data.length) return [];
    return data.map((_, i) => i);
  }, [chartType, categoryChartData, enhancedChartData]);

  const xTickFormatter = useCallback((idx) => {
    const data = chartType === "category" ? categoryChartData : enhancedChartData;
    const i = Math.round(idx);
    return data[i]?.label || "";
  }, [chartType, categoryChartData, enhancedChartData]);

  const shiftChartRange = useCallback((dir) => {
    const step = xUnit === "year" ? 12 : 1;
    setChartFrom((s) => shiftMonthStr(s, dir * step));
    setChartTo((s) => shiftMonthStr(s, dir * step));
  }, [xUnit, shiftMonthStr]);

  // wheel 이벤트 — lightweight-charts 가 area/category 모두 자체 휠/줌 처리하므로 비활성화
  useEffect(() => {
    return; // 모든 모드 lightweight-charts 위임
    // eslint-disable-next-line no-unreachable
    const el = chartWrapRef.current;
    if (!el) return;
    let pendingDx = 0;
    let pendingZoomFactor = 1;
    let rafId = null;
    const flush = () => {
      rafId = null;
      if (pendingDx !== 0) {
        const containerW = el.offsetWidth || 800;
        const cellPx = Math.max(20, containerW / dataLen);
        const deltaCells = pendingDx / cellPx;
        pendingDx = 0;
        setDisplayOffset((prev) => prev + deltaCells);
      }
      if (pendingZoomFactor !== 1) {
        const f = pendingZoomFactor;
        pendingZoomFactor = 1;
        setYZoom((z) => Math.max(0.2, Math.min(8, z * f)));
      }
    };
    const onWheel = (e) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      const horizontal = e.shiftKey || absX > absY * 1.3;
      if (horizontal) {
        e.preventDefault();
        pendingDx += (e.shiftKey ? e.deltaY : e.deltaX);
      } else if (absY > 0) {
        e.preventDefault();
        pendingZoomFactor *= Math.exp(-e.deltaY / 250);
      } else {
        return;
      }
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [dataLen, chartType]);

  // displayOffset이 buffer 경계 너머로 가면 chartFrom/chartTo 를 silent shift하여 buffer 재정렬
  useEffect(() => {
    if (Math.abs(displayOffset) < 1) return;
    const stepCount = Math.trunc(displayOffset);
    if (stepCount === 0) return;
    // 잠깐 지연 후 shift (사용자가 휠 멈춘 뒤 정리)
    const t = setTimeout(() => {
      shiftChartRange(stepCount);
      setDisplayOffset((p) => p - stepCount);
    }, 220);
    return () => clearTimeout(t);
  }, [displayOffset, shiftChartRange]);

  const debtPaidBefore = useMemo(
    () => calcDebtPaidBefore(allMonthly || [], dbProfile, year, month),
    [allMonthly, dbProfile, year, month]
  );
  const tasks = useMemo(
    () => getTasksForMonth(year, month, {
      profile: dbProfile,
      customSchedule: scheduleRow || undefined,
      debtPaidBefore
    }),
    [year, month, dbProfile, debtPaidBefore, scheduleRow]
  );
  const checks = monthRow?.checks || {};
  const actuals = monthRow?.actualAmounts || {};

  // 자동 계산된 현금값 — 여윳자금(수동 입력)과 비교용
  const allExpensesForNW = useLiveQuery(() => db.expenses.toArray(), [], []);
  const allMonthlyForNW = useLiveQuery(() => db.monthly_status.toArray(), [], []);
  const [computedLiquid, setComputedLiquid] = useState(0);
  useEffect(() => {
    (async () => {
      const il = await getInitialLiquid();
      const r = await computeNetWorth({ initialNW: 0, initialLiquid: il, categories: allCategories, tasks });
      setComputedLiquid(r.liquid);
    })();
  }, [allCategories, tasks, allExpensesForNW, allMonthlyForNW]);

  // 부채: 프로필 debtItems 기반 동적 계산 (debtPaidBefore 는 { [debtId]: paid } 맵)
  const debtTotal = (dbProfile?.debtItems || []).reduce((s, d) => s + (Number(d.total) || 0), 0);
  const debtPaidBeforeSum = Object.values(debtPaidBefore || {}).reduce((a, b) => a + b, 0);
  const debtPaidThisMonth = tasks
    .filter((t) => t.type === "debt" && checks[t.id])
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const debtPaidTotal = Math.min(debtTotal, debtPaidBeforeSum + debtPaidThisMonth);
  const debtRemaining = Math.max(0, debtTotal - debtPaidTotal);

  const userPhases = useLiveQuery(() => getUserPhases(), [], []);
  const phase = currentPhaseFrom(userPhases, today);
  const defaultCheckpoints = checkpointsForMonth(month);

  // 출석 통계는 AttendanceStrip 컴포넌트가 내부에서 처리.

  // Editable phase goals
  const [phaseCustom, setPhaseCustom] = useState({ added: [], hidden: [] });
  const [newGoal, setNewGoal] = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);

  // Editable checkpoints — { added: [], hidden: [titles], overrides: { [defaultTitle]: { title, detail } } }
  const [cpState, setCpState] = useState({ added: [], hidden: [], overrides: {} });
  const [newCPTitle, setNewCPTitle] = useState("");
  const [showCPInput, setShowCPInput] = useState(false);
  const [editingCP, setEditingCP] = useState(null); // { cp, title, detail } | null

  useEffect(() => {
    getCustomGoals(phase.num).then(setPhaseCustom);
  }, [phase.num]);

  useEffect(() => {
    getCustomCheckpoints(year, month).then((raw) => {
      // backward compat: 이전엔 array로 저장됐었음
      if (Array.isArray(raw)) setCpState({ added: raw, hidden: [], overrides: {} });
      else setCpState({
        added: raw?.added || [],
        hidden: raw?.hidden || [],
        overrides: raw?.overrides || {}
      });
    });
  }, [year, month]);

  const visibleGoals = [
    ...phase.goals.filter((g) => !phaseCustom.hidden.includes(g)),
    ...phaseCustom.added
  ];

  // 기본 체크포인트는 hidden 제외 + override 적용. 사용자가 추가한 건 그대로 뒤에.
  const visibleDefaults = defaultCheckpoints
    .filter((c) => !cpState.hidden.includes(c.title))
    .map((c) => {
      const ov = cpState.overrides[c.title];
      return ov
        ? { ...c, icon: ov.icon ?? c.icon, title: ov.title ?? c.title, detail: ov.detail ?? c.detail }
        : c;
    });
  const allCheckpoints = [
    ...visibleDefaults.map((c) => ({ ...c, _kind: "default", _key: c.title })),
    ...cpState.added.map((c, i) => ({ ...c, _kind: "added", _key: `added-${i}`, isCustom: true }))
  ];

  const addGoal = async () => {
    if (!newGoal.trim()) return;
    const next = { ...phaseCustom, added: [...phaseCustom.added, newGoal.trim()] };
    setPhaseCustom(next);
    await setCustomGoals(phase.num, next);
    setNewGoal("");
    setShowGoalInput(false);
  };

  const hideGoal = async (goal) => {
    const isCustom = phaseCustom.added.includes(goal);
    let next;
    if (isCustom) {
      next = { ...phaseCustom, added: phaseCustom.added.filter((g) => g !== goal) };
    } else {
      next = { ...phaseCustom, hidden: [...phaseCustom.hidden, goal] };
    }
    setPhaseCustom(next);
    await setCustomGoals(phase.num, next);
  };

  const saveCPs = async (next) => {
    setCpState(next);
    await setCustomCheckpoints(year, month, next);
  };

  const addCheckpoint = async () => {
    if (!newCPTitle.trim()) return;
    const next = {
      ...cpState,
      added: [...cpState.added, { icon: "📌", title: newCPTitle.trim(), detail: "" }]
    };
    await saveCPs(next);
    setNewCPTitle("");
    setShowCPInput(false);
  };

  const removeCheckpoint = async (cp) => {
    if (cp._kind === "default") {
      // 기본 항목: hidden 목록에 추가 (overrides도 같이 정리)
      const overrides = { ...cpState.overrides };
      delete overrides[cp._key];
      await saveCPs({ ...cpState, hidden: [...cpState.hidden, cp._key], overrides });
    } else {
      // 사용자 추가 항목: added 배열에서 제거
      const i = Number(String(cp._key).replace("added-", ""));
      const added = cpState.added.filter((_, j) => j !== i);
      await saveCPs({ ...cpState, added });
    }
  };

  const editCheckpoint = (cp) => {
    setEditingCP({ cp, icon: cp.icon || "📌", title: cp.title, detail: cp.detail || "" });
  };

  const saveCPEdit = async () => {
    if (!editingCP) return;
    const trimmedTitle = editingCP.title.trim();
    if (!trimmedTitle) return;
    const detail = editingCP.detail.trim();
    const icon = (editingCP.icon || "").trim() || "📌";
    const cp = editingCP.cp;

    if (cp._kind === "default") {
      const overrides = { ...cpState.overrides, [cp._key]: { icon, title: trimmedTitle, detail } };
      await saveCPs({ ...cpState, overrides });
    } else {
      const i = Number(String(cp._key).replace("added-", ""));
      const added = cpState.added.map((c, j) =>
        j === i ? { ...c, icon, title: trimmedTitle, detail } : c
      );
      await saveCPs({ ...cpState, added });
    }
    setEditingCP(null);
  };

  const resetDefaultCheckpoints = async () => {
    await saveCPs({ ...cpState, hidden: [], overrides: {} });
  };

  const goalDate = new Date(profile.goalDate);
  const monthsToGoal = Math.max(
    0,
    (goalDate.getFullYear() - year) * 12 + (goalDate.getMonth() + 1 - month)
  );
  const nwPct = Math.min(100, (netWorth / profile.goalAmount) * 100);
  const remaining = Math.max(0, profile.goalAmount - netWorth);

  // 변동지출 집계 — 자산 종류가 "지출(expense)" 인 카테고리만 total에 합산.
  // 수입·자산↑·부채↓·중립 카테고리는 카테고리별 sum엔 들어가지만 total엔 미포함.
  const expenseSums = useMemo(() => {
    const sums = { total: 0 };
    const catByKey = {};
    const knownKeys = new Set(allCategories.map((c) => c.key));
    for (const c of allCategories) {
      sums[c.key] = 0;
      catByKey[c.key] = c;
    }
    for (const e of expenses || []) {
      const raw = e.category;
      const cat = raw === "social" ? "leisure" : raw === "transit" ? "other" : raw;
      if (knownKeys.has(cat)) sums[cat] += e.amount;
      else sums.other = (sums.other || 0) + e.amount;
      // total에는 "지출" 자산 종류인 카테고리만 (기본값 expense 포함)
      const impact = (catByKey[cat]?.nwImpact) || "expense";
      if (impact === "expense") sums.total += e.amount;
    }
    return sums;
  }, [expenses, allCategories]);

  // 총 변동지출 상한 = 지출 카테고리 월 상한 합. 없으면 프로필 예산으로 폴백.
  const totalExpenseCap = useMemo(() => {
    let sum = 0;
    for (const c of allCategories) {
      if ((c.nwImpact || "expense") !== "expense") continue;
      if (c.cap) sum += Number(c.cap) || 0;
    }
    return sum > 0 ? sum : (Number(profile.expenseBudgetCap) || 0);
  }, [allCategories, profile.expenseBudgetCap]);

  // 변동지출 StatCard sub 에 상위 3개 카테고리 표시 — 지출 카테고리만
  const topCategoriesText = useMemo(() => {
    const entries = allCategories
      .filter((c) => (c.nwImpact || "expense") === "expense")
      .map((c) => ({ c, amt: expenseSums[c.key] || 0 }))
      .filter((x) => x.amt > 0)
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 3);
    if (entries.length === 0) return "아직 기록 없음";
    return entries.map(({ c, amt }) => `${c.icon} ${fmt(amt)}`).join(" · ");
  }, [allCategories, expenseSums]);

  // 위험 신호
  const cardTask = tasks.find((t) => t.label === "카드값");
  const cardActual = cardTask ? actuals[cardTask.id] : undefined;
  const debtTask = tasks.find((t) => t.type === "debt");
  const debtDelayed = debtTask && today.getDate() > 26 && !checks[debtTask.id];
  const risks = detectRisks({
    balance: monthRow?.balance,
    variableTotal: expenseSums.total,
    foodTotal: expenseSums.food,
    cardActual,
    debtDelayed,
    today
  });

  const saveNW = useCallback(async () => {
    setEditNW(false);
    if (nwDraft !== "" && !Number.isNaN(Number(nwDraft))) {
      await setNetWorth(nwDraft);
      setNW(Number(nwDraft));
    }
  }, [nwDraft]);

  return (
    <>
      <TopBar
        breadcrumb={["Finance", "Dashboard"]}
        title={profile.dashboardTitle || `${profile.name}의 자산관리앱`}
        subtitle={
          profile.dashboardSubtitle ||
          `오늘 ${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}${profile.goalAmount ? ` · 목표 ${fmt(profile.goalAmount)}` : ""}`
        }
      />

      {/* Risk banner */}
      {risks.length > 0 && (
        <div className="risk-stack">
          {risks.map((r) => (
            <div
              key={r.id}
              className="risk-item"
              style={{ background: r.meta.bg, borderColor: r.meta.color }}
            >
              <div
                className="risk-icon"
                style={{ background: r.meta.color, color: "#fff" }}
              >
                !
              </div>
              <div style={{ flex: 1 }}>
                <div className="risk-title" style={{ color: r.meta.color }}>
                  [{r.meta.label}] {r.title}
                </div>
                <div className="risk-detail">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {orphanCount > 0 && (
        <button
          onClick={() => setShowOrphanModal(true)}
          style={{
            width: "100%", marginBottom: 12, padding: "10px 14px",
            background: "linear-gradient(135deg, #FFF0E8 0%, #FFE8D8 100%)",
            border: "1px solid #E8B89D",
            borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            color: "#A56838", fontSize: 13, fontWeight: 600
          }}
        >
          <span>🪄 캘린더에서 사라진 항목 <strong>{orphanCount}건</strong> 발견 — 복원하기</span>
          <span style={{ fontSize: 14 }}>→</span>
        </button>
      )}

      {/* 경제 멘토 위젯 (컴팩트) */}
      <div style={{ marginBottom: 16 }}>
        <MentorCard variant="compact" />
      </div>

      {/* Top overview row: Net worth (wider) + 3 stat cards stacked */}
      <div className="dashboard-overview" style={{ marginBottom: 16 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200 }}>
        <NetWorthCard
          profile={profile}
          allCategories={allCategories}
          tasks={tasks}
          monthsToGoal={monthsToGoal}
        />

        {/* Quick nav — 다른 페이지 바로가기 */}
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: `1px solid ${R.border}`,
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8
        }}>
          <QuickNavCard icon="📅" label="자산 캘린더" sub="이번 달 일정" color={R.rose400} target="calendar" />
          <QuickNavCard icon="💸" label="지출 관리" sub={`이번 달 ${fmt(expenseSums.total)}`} color={R.warm} target="expenses" />
          <QuickNavCard icon="📰" label="오늘의 경제" sub="뉴스 · 멘토" color={R.lavender} target="economy" />
        </div>
      </div>

      {/* 4 stat cards stacked vertically */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
        {/* 여윳자금 (월별 기록) */}
        <div
          className="card-sm"
          style={{
            padding: "12px 14px",
            background: "linear-gradient(135deg, #FFF5F3 0%, #FFF0EC 100%)",
            borderColor: "#D4A0A0"
          }}
        >
          {/* 헤더: 타이틀 + 월 네비 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: R.textLight, fontWeight: 700, letterSpacing: 0.5 }}>
              💰 여윳자금 {!isCashCurrentMonth && <span style={{ color: R.rose500 }}>· 과거 기록</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => shiftCashMonth(-1)}
                style={{
                  width: 20, height: 20, border: "none", background: "rgba(255,255,255,0.7)",
                  borderRadius: 4, cursor: "pointer", fontSize: 11, color: R.textMid,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}
                title="이전 달"
              >‹</button>
              <div style={{ fontSize: 11, fontWeight: 700, color: R.textDark, minWidth: 62, textAlign: "center" }}>
                {cashY}.{String(cashM).padStart(2, "0")}
              </div>
              <button
                onClick={() => shiftCashMonth(1)}
                disabled={isCashCurrentMonth}
                style={{
                  width: 20, height: 20, border: "none",
                  background: isCashCurrentMonth ? "transparent" : "rgba(255,255,255,0.7)",
                  borderRadius: 4,
                  cursor: isCashCurrentMonth ? "default" : "pointer",
                  fontSize: 11, color: isCashCurrentMonth ? R.textLight : R.textMid,
                  opacity: isCashCurrentMonth ? 0.3 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}
                title="다음 달"
              >›</button>
            </div>
          </div>

          <div style={{ fontSize: 9, color: R.textMid, marginBottom: 6, lineHeight: 1.5 }}>
            통장 실제 잔고를 적어두면 <b>자동 계산된 현금</b>과 비교해 누락된 거래를 찾아줘요.
          </div>

          {/* 값 / 입력 */}
          {editCash ? (
            <div style={{ display: "flex", gap: 4 }}>
              <MoneyInput
                className="modal-input"
                value={cashDraft}
                onChange={(e) => setCashDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setCashBalance(cashY, cashM, cashDraft === "" ? null : cashDraft);
                    setEditCash(false);
                  }
                  if (e.key === "Escape") setEditCash(false);
                }}
                autoFocus
                placeholder="잔고"
                style={{ flex: 1, padding: "4px 8px", fontSize: 14, fontWeight: 700 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setCashBalance(cashY, cashM, cashDraft === "" ? null : cashDraft); setEditCash(false); }}
                style={{ padding: "0 10px", height: 28 }}
              >✓</button>
            </div>
          ) : (
            <div
              onClick={() => {
                setCashDraft(cashSel?.amount != null ? String(cashSel.amount) : "");
                setEditCash(true);
              }}
              style={{ cursor: "pointer" }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: cashSel?.amount != null ? R.textDark : R.textLight }}>
                {cashSel?.amount != null ? fmt(cashSel.amount) : "탭하여 입력"}
              </div>
              {cashSel?.amount != null && cashSelPrev?.amount != null && (() => {
                const diff = cashSel.amount - cashSelPrev.amount;
                const color = diff > 0 ? R.mint : diff < 0 ? R.overBudget : R.textLight;
                return (
                  <div style={{ fontSize: 10, color, marginTop: 2, fontWeight: 600 }}>
                    전월 대비 {diff > 0 ? "+" : ""}{fmt(diff)}
                  </div>
                );
              })()}
              {cashSel?.amount == null && (
                <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>
                  {isCashCurrentMonth ? "월급 전날 잔고 기록" : "이 달은 기록 없음"}
                </div>
              )}
              {/* 자동 계산 현금과의 차이 — 임계값 이상일 때만 노출 */}
              {isCashCurrentMonth && cashSel?.amount != null && (() => {
                const diff = cashSel.amount - computedLiquid;
                const threshold = Math.max(50000, Math.abs(cashSel.amount) * 0.05);
                if (Math.abs(diff) < threshold) return null;
                const sign = diff > 0 ? "+" : "";
                return (
                  <div style={{
                    fontSize: 10, color: R.overBudget, marginTop: 6, fontWeight: 600,
                    padding: "6px 8px", borderRadius: 6, background: "rgba(192,96,96,0.08)",
                    lineHeight: 1.5
                  }}>
                    ⚠️ 자동 계산값과 {sign}{fmt(diff)} 차이
                    <div style={{ fontSize: 9, color: R.textMid, fontWeight: 500, marginTop: 2 }}>
                      {diff > 0
                        ? "통장이 더 많아요 — 누락된 수입이 있나 확인해보세요."
                        : "통장이 더 적어요 — 누락된 지출이 있나 확인해보세요."}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {debtTotal > 0 && (
          <StatCard
            label="부채 상환"
            value={debtRemaining <= 0 ? "완납 ✓" : fmt(debtPaidTotal)}
            sub={debtRemaining <= 0 ? "" : `/ ${fmt(debtTotal)} · 남은 ${fmt(debtRemaining)}`}
            pct={debtTotal > 0 ? (debtPaidTotal / debtTotal) * 100 : 0}
            color={debtRemaining <= 0 ? R.mint : R.lavender}
          />
        )}
        <StatCard
          label="이번 달 변동지출"
          value={fmt(expenseSums.total)}
          sub={totalExpenseCap > 0 ? `${topCategoriesText} · 상한 ${fmt(totalExpenseCap)}` : topCategoriesText}
          pct={totalExpenseCap > 0 ? (expenseSums.total / totalExpenseCap) * 100 : 0}
          color={totalExpenseCap > 0 && expenseSums.total > totalExpenseCap ? R.overBudget : R.warm}
        />
        <StatCard
          label="이번 달 실행률"
          value={`${tasks.length > 0 ? Math.round((tasks.filter(t => checks[t.id]).length / tasks.length) * 100) : 0}%`}
          sub={`${tasks.filter(t => checks[t.id]).length}/${tasks.length} 완료`}
          pct={tasks.length > 0 ? (tasks.filter(t => checks[t.id]).length / tasks.length) * 100 : 0}
          color={R.mint}
        />
      </div>
      </div>{/* /dashboard-overview */}

      {/* YoY Chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">
          {chartType === "category" ? "카테고리별 금액 추이" : "수입 / 총 지출 / 저축 추이"}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="month"
              value={chartFrom}
              onChange={(e) => setChartFrom(e.target.value)}
              className="btn btn-sm"
              style={{ fontFamily: "inherit" }}
            />
            <span style={{ color: R.textLight, fontSize: 12 }}>~</span>
            <input
              type="month"
              value={chartTo}
              onChange={(e) => setChartTo(e.target.value)}
              className="btn btn-sm"
              style={{ fontFamily: "inherit" }}
            />
          </div>
        </div>
        {/* 차트 옵션 줄 1 — 표시 모드 + X축 단위 (직교 조합) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: R.textLight, fontWeight: 700, letterSpacing: "0.5px" }}>표시</span>
            {[
              { v: "area",     label: "📈 전체" },
              { v: "category", label: "📊 카테고리" }
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setChartType(opt.v)}
                style={{
                  padding: "5px 10px", borderRadius: 8,
                  background: chartType === opt.v ? R.rose400 : "#fff",
                  color: chartType === opt.v ? "#fff" : R.textMid,
                  border: `1px solid ${chartType === opt.v ? R.rose400 : R.border}`,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                }}
              >{opt.label}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 18, background: R.border }} />
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: R.textLight, fontWeight: 700, letterSpacing: "0.5px" }}>단위</span>
            {[
              { v: "day",   label: "📅 일" },
              { v: "month", label: "📆 월" },
              { v: "year",  label: "🗓 연" }
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => onUnitChange(opt.v)}
                style={{
                  padding: "5px 10px", borderRadius: 8,
                  background: xUnit === opt.v ? R.lavender : "#fff",
                  color: xUnit === opt.v ? "#fff" : R.textMid,
                  border: `1px solid ${xUnit === opt.v ? R.lavender : R.border}`,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* 차트 옵션 줄 2 — 시리즈 (전체 모드) / 카테고리 (카테고리 모드) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
          {chartType !== "category" ? (
            <>
              <SeriesChip color={R.mint}     label="수입" checked={seriesShow.income}  onChange={(v) => setSeriesShow((s) => ({ ...s, income: v }))} R={R} />
              <SeriesChip color={R.rose400}  label="지출" checked={seriesShow.expense} onChange={(v) => setSeriesShow((s) => ({ ...s, expense: v }))} R={R} />
              <SeriesChip color={R.lavender} label="저축" checked={seriesShow.savings} onChange={(v) => setSeriesShow((s) => ({ ...s, savings: v }))} R={R} />
              <ToggleChip checked={showSavingRate} onChange={setShowSavingRate} label="저축률" R={R} />
              <ToggleChip checked={showPlanned} onChange={setShowPlanned} label="계획값" R={R} />
            </>
          ) : (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 4,
              maxWidth: "100%"
            }}>
              {(allCategories || []).map((c) => {
                  const hidden = (dashboardHidden || []).includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleDashboardCategory(c.key)}
                      style={{
                        padding: "4px 8px", borderRadius: 999,
                        background: hidden ? "#fff" : (c.color || R.rose400) + "20",
                        color: hidden ? R.textLight : R.textDark,
                        border: `1px solid ${hidden ? R.border : (c.color || R.rose400)}`,
                        fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        opacity: hidden ? 0.6 : 1
                      }}
                    >{c.icon || ""} {c.label}</button>
                  );
                })}
            </div>
          )}
        </div>

        <div style={{ fontSize: 10, color: R.textLight, marginBottom: 6 }}>
          💡 차트 위에서 좌·우 휠 = 기간 이동, 핀치/축 드래그 = 줌, 더블클릭 = 리셋
        </div>

        <div ref={chartWrapRef} style={{ width: "100%", height: 280, position: "relative" }}>
          {chartType === "area" ? (
            enhancedChartData.length > 0 ? (
              <LightweightTrendChart
                data={enhancedChartData}
                xUnit={xUnit}
                seriesShow={seriesShow}
                showSavingRate={showSavingRate}
                showPlanned={showPlanned}
                windowStart={windowStart}
                windowEnd={windowEnd}
                onAutoUnit={onAutoUnit}
                R={R}
                height={280}
              />
            ) : (
              <EmptyChart R={R} />
            )
          ) : (
            categoryChartData.length > 0 && chartCategoriesVisible.length > 0 ? (
              <LightweightCategoryChart
                data={categoryChartData}
                categories={chartCategoriesVisible}
                xUnit={xUnit}
                windowStart={windowStart}
                windowEnd={windowEnd}
                onAutoUnit={onAutoUnit}
                R={R}
                height={280}
              />
            ) : (
              <EmptyChart R={R} />
            )
          )}
        </div>
      </div>

      {/* 출석 도장 */}
      <AttendanceStrip
        attendanceDates={attendanceDates}
        today={today}
        year={year}
        month={month}
      />

      {/* Phase + 이번 달 체크포인트 + 카테고리 */}
      <div className="dashboard-bottom">
        <div className="card">
          <div className="section-title">
            현재 Phase: {phase.num}. {phase.name}
            <span className="section-meta">{phase.range}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {visibleGoals.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: R.textMid }}>
                <span style={{ flex: 1 }}>• {g}</span>
                <button
                  onClick={() => hideGoal(g)}
                  style={{ background: "none", border: "none", color: R.textLight, fontSize: 14, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}
                  title="삭제"
                >×</button>
              </div>
            ))}
          </div>
          {showGoalInput ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="modal-input"
                style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addGoal(); if (e.key === "Escape") setShowGoalInput(false); }}
                placeholder="새 목표 입력"
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={addGoal}>추가</button>
              <button className="btn btn-sm" onClick={() => setShowGoalInput(false)}>취소</button>
            </div>
          ) : (
            <button
              className="btn btn-sm"
              style={{ marginTop: 8, width: "100%" }}
              onClick={() => setShowGoalInput(true)}
            >+ 목표 추가</button>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {userPhases.map((p) => (
              <div
                key={p.num}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 10,
                  background: p.num === phase.num ? R.lavenderLight : R.cream,
                  border: `1px solid ${p.num === phase.num ? R.lavender : R.border}`,
                  fontSize: 11
                }}
              >
                <div style={{ fontWeight: 700, color: p.num === phase.num ? R.lavender : R.textLight }}>
                  Phase {p.num}
                </div>
                <div style={{ color: R.textLight, marginTop: 2 }}>{p.name}</div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 8,
            background: R.cream, border: `1px dashed ${R.border}`,
            fontSize: 11, color: R.textLight, textAlign: "center"
          }}>
            메인 Phase 수정은 좌측 사이드바의 ⚙️ 프로필 편집에서 가능합니다.
          </div>
        </div>

        <div className="card">
          <div className="section-title">이번 달 체크포인트</div>
          {allCheckpoints.length === 0 && !showCPInput ? (
            <div style={{ fontSize: 13, color: R.textLight, padding: "12px 0" }}>
              이번 달은 특별한 이벤트가 없습니다.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allCheckpoints.map((c) => (
                <div key={c._key} style={{ display: "flex", gap: 10, padding: 10, background: R.cream, borderRadius: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{c.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{c.title}</div>
                    {c.detail && <div style={{ fontSize: 12, color: R.textMid, marginTop: 2 }}>{c.detail}</div>}
                  </div>
                  <button
                    onClick={() => editCheckpoint(c)}
                    style={{ background: "none", border: "none", color: R.textLight, fontSize: 13, padding: "2px 4px", flexShrink: 0 }}
                    title="수정"
                  >✏️</button>
                  <button
                    onClick={() => removeCheckpoint(c)}
                    style={{ background: "none", border: "none", color: R.textLight, fontSize: 14, padding: "2px 6px", flexShrink: 0 }}
                    title={c._kind === "default" ? "이번 달 목록에서 숨기기" : "삭제"}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          {showCPInput ? (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="modal-input"
                style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
                value={newCPTitle}
                onChange={(e) => setNewCPTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCheckpoint(); if (e.key === "Escape") setShowCPInput(false); }}
                placeholder="체크포인트 입력"
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={addCheckpoint}>추가</button>
              <button className="btn btn-sm" onClick={() => setShowCPInput(false)}>취소</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                className="btn btn-sm"
                style={{ flex: 1 }}
                onClick={() => setShowCPInput(true)}
              >+ 체크포인트 추가</button>
              {(cpState.hidden.length > 0 || Object.keys(cpState.overrides).length > 0) && (
                <button
                  className="btn btn-sm"
                  onClick={resetDefaultCheckpoints}
                  title="기본 체크포인트의 숨김/편집을 원복"
                >기본 복원</button>
              )}
            </div>
          )}
        </div>

      {/* 변동지출 카테고리 요약 */}
      <DashboardCategorySummary
        year={year}
        month={month}
        allCategories={allCategories}
        expenseSums={expenseSums}
        dashboardHidden={dashboardHidden || []}
        onToggle={toggleDashboardCategory}
        R={R}
      />
      </div>{/* /dashboard-bottom */}

      {editingCP && (
        <div className="modal-backdrop" onClick={() => setEditingCP(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-title">체크포인트 편집</div>
            <div className="modal-sub">
              {editingCP.cp._kind === "default"
                ? `기본 항목을 이번 달(${month}월)에만 다른 문구로 덮어쓰기 합니다.`
                : "사용자 추가 항목 수정"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: R.textMid, marginBottom: 4 }}>아이콘</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    className="modal-input"
                    style={{ width: 60, fontSize: 22, textAlign: "center", padding: "6px 4px" }}
                    value={editingCP.icon}
                    onChange={(e) => setEditingCP({ ...editingCP, icon: e.target.value })}
                    maxLength={4}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                    {["📌", "💼", "📊", "📋", "🧮", "🎯", "💰", "📈", "🛡️", "🎁", "🌸", "✨"].map((emo) => (
                      <button
                        key={emo}
                        onClick={() => setEditingCP({ ...editingCP, icon: emo })}
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          border: `1px solid ${editingCP.icon === emo ? R.rose400 : R.border}`,
                          background: editingCP.icon === emo ? "#FFF5F5" : "#fff",
                          cursor: "pointer", fontSize: 16, padding: 0,
                          fontFamily: "inherit"
                        }}
                      >{emo}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: R.textMid, marginBottom: 4 }}>제목</div>
                <input
                  className="modal-input"
                  value={editingCP.title}
                  onChange={(e) => setEditingCP({ ...editingCP, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCPEdit(); }}
                  autoFocus
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: R.textMid, marginBottom: 4 }}>상세 (선택)</div>
                <textarea
                  className="modal-input"
                  rows={3}
                  style={{ resize: "vertical", fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}
                  value={editingCP.detail}
                  onChange={(e) => setEditingCP({ ...editingCP, detail: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-sm" onClick={() => setEditingCP(null)}>취소</button>
              <button className="btn btn-primary btn-sm" onClick={saveCPEdit}>저장</button>
            </div>
          </div>
        </div>
      )}

      {showOrphanModal && <OrphanRestoreModal onClose={() => setShowOrphanModal(false)} />}
      {showWhatsNew && <WhatsNewModal onClose={closeWhatsNew} />}
    </>
  );
}

// 옵션 토글 칩
function ToggleChip({ checked, onChange, label, R }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        padding: "5px 10px", borderRadius: 8,
        background: checked ? "#F4FAF6" : "#fff",
        color: checked ? R.mint : R.textLight,
        border: `1px solid ${checked ? R.mint : R.border}`,
        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
      }}
    >
      {checked ? "☑" : "☐"} {label}
    </button>
  );
}

function EmptyChart({ R }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: R.textLight, fontSize: 13,
      background: `linear-gradient(180deg, #FFFDFD 0%, #FAF5F3 100%)`,
      borderRadius: 12, border: `1px solid ${R.border}`
    }}>
      데이터를 입력하면 차트가 표시됩니다
    </div>
  );
}

function SeriesChip({ checked, onChange, label, color, R }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        padding: "5px 10px", borderRadius: 8,
        background: checked ? color + "18" : "#fff",
        color: checked ? color : R.textLight,
        border: `1px solid ${checked ? color : R.border}`,
        fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: 6
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 2,
        background: checked ? color : "transparent",
        border: `1px solid ${checked ? color : R.border}`
      }} />
      {label}
    </button>
  );
}

function QuickNavCard({ icon, label, sub, color, target }) {
  return (
    <button
      onClick={() => { window.location.hash = `/${target}`; }}
      style={{
        padding: "10px 12px", borderRadius: 10,
        background: "#fff", border: `1px solid ${R.border}`,
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 10,
        textAlign: "left", transition: "all 0.15s"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = R.border;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: color + "22", color: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, flexShrink: 0
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: R.textDark }}>{label}</div>
        <div style={{ fontSize: 10, color: R.textLight, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sub}
        </div>
      </div>
      <div style={{ fontSize: 16, color: R.textLight, flexShrink: 0 }}>›</div>
    </button>
  );
}

function StatCard({ label, value, sub, pct, color }) {
  return (
    <div className="card-sm" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: R.textLight }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, letterSpacing: -0.5, color: R.textDark }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: R.textMid, marginTop: 2 }}>{sub}</div>}
      <div className="progress-track" style={{ marginTop: 8, height: 4 }}>
        <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

function DashboardCategorySummary({ year, month, allCategories, expenseSums, dashboardHidden, onToggle, R }) {
  const [manage, setManage] = useState(false);
  const visible = allCategories.filter((c) => !dashboardHidden.includes(c.key));
  const hiddenList = allCategories.filter((c) => dashboardHidden.includes(c.key));

  return (
    <div className="card">
      <div className="section-title">
        카테고리별 지출
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="section-meta">{year}.{String(month).padStart(2, "0")}</span>
          <button
            className="btn btn-sm"
            onClick={() => setManage((v) => !v)}
            style={{
              padding: "0 10px", fontSize: 11,
              background: manage ? R.rose400 : "#fff",
              color: manage ? "#fff" : R.textMid,
              borderColor: manage ? R.rose400 : R.border
            }}
            title="대시보드에 표시할 카테고리 선택"
          >{manage ? "완료" : "✎ 표시 관리"}</button>
        </div>
      </div>

      {manage && (
        <div style={{
          fontSize: 11, color: R.textMid, background: R.cream,
          padding: "8px 10px", borderRadius: 8, marginBottom: 10,
          lineHeight: 1.5
        }}>
          체크된 카테고리만 대시보드에 표시됩니다. 기록 데이터는 유지됩니다.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(manage ? allCategories : visible).map((c) => {
          const amt = expenseSums[c.key] || 0;
          const catGoal = !!IMPACT_BY_KEY[c.nwImpact || "expense"]?.goalLike;
          const pct = c.cap ? Math.min(100, (amt / c.cap) * 100) : 0;
          const reached = c.cap && amt >= c.cap;
          const over = c.cap && !catGoal && amt > c.cap;
          const barColor = catGoal ? (reached ? R.mint : c.color) : (over ? R.overBudget : c.color);
          const isHidden = dashboardHidden.includes(c.key);
          return (
            <div
              key={c.key}
              onClick={manage ? () => onToggle(c.key) : undefined}
              style={{
                padding: 10, background: c.bg, borderRadius: 10,
                opacity: manage && isHidden ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 10,
                cursor: manage ? "pointer" : "default",
                border: manage ? `1.5px solid ${isHidden ? "transparent" : c.color}` : "1.5px solid transparent",
                transition: "all 0.15s"
              }}
            >
              {manage && (
                <div
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    border: `2px solid ${c.color}`,
                    background: isHidden ? "#fff" : c.color,
                    color: "#fff",
                    fontSize: 14, fontWeight: 800, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "none"
                  }}
                >{isHidden ? "" : "✓"}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 12, color: c.color, fontWeight: 700 }}>
                    {c.icon} {c.label}
                    {manage && (
                      <span style={{ fontSize: 10, color: R.textLight, fontWeight: 500, marginLeft: 8 }}>
                        {isHidden ? "· 숨김" : "· 표시 중"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: over ? R.overBudget : reached ? R.mint : R.textDark }}>
                    {fmt(amt)}
                  </div>
                </div>
                {c.cap && (
                  <>
                    <div className="progress-track" style={{ marginTop: 6, height: 3 }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <div style={{ fontSize: 10, color: R.textLight, marginTop: 3 }}>
                      {catGoal ? "목표" : "상한"} {fmt(c.cap)}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {!manage && hiddenList.length > 0 && (
          <div style={{ fontSize: 10, color: R.textLight, textAlign: "center", padding: "4px 0" }}>
            · {hiddenList.length}개 카테고리 숨김 (표시 관리에서 조정)
          </div>
        )}
      </div>
    </div>
  );
}
