import { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  addExpense, updateExpense, deleteExpense, getExpensesForMonth,
  getCustomPresets, setCustomPresets,
  getPresetOverrides, setPresetOverrides,
  getCustomCategories, setCustomCategoriesStore,
  getCategoryOverrides, setCategoryOverrides,
  migrateExpensesCategory,
  getRecurring, setRecurring, applyRecurringForMonth
} from "../db.js";
import {
  EXPENSE_CATEGORIES, getCategory, mergeCategories,
  DEFAULT_CATEGORY_KEYS, CATEGORY_COLOR_PRESETS,
  normalizeSubcats, getSubcatIcon
} from "../lib/expenseCategories.js";
import { fmt, fmtWon } from "../schedule.js";
import TopBar from "../components/TopBar.jsx";

const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  rose600: "#8B4F4F",
  mint: "#6BAF8D",
  cream: "#FAF5F3",
  border: "#EDE5E2",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  over: "#C06060"
};

const BUDGET_CAP = 890000;

export default function ExpensesPage() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [activeCat, setActiveCat] = useState("food");
  const [customAmount, setCustomAmount] = useState("");
  const [customSub, setCustomSub] = useState("");
  const [customMemo, setCustomMemo] = useState("");
  const [editExpense, setEditExpense] = useState(null);

  // 기록할 날짜 (기본: 오늘 또는 viewed month 내)
  const defaultInputDate = useMemo(() => {
    const isCurrent = year === today.getFullYear() && month === today.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const day = isCurrent ? today.getDate() : lastDay;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }, [year, month, today]);
  const [inputDate, setInputDate] = useState(defaultInputDate);
  useEffect(() => { setInputDate(defaultInputDate); }, [defaultInputDate]);

  const monthMin = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthMax = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  // Filter/search
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  // Preset management
  const [managePresets, setManagePresets] = useState(false);
  const [newPresetAmount, setNewPresetAmount] = useState("");
  const [newPresetSub, setNewPresetSub] = useState("");
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [editingPreset, setEditingPreset] = useState(null); // { kind: "custom"|"default", idx }

  // Category management
  const [manageCategories, setManageCategories] = useState(false);
  const [categoryEditor, setCategoryEditor] = useState(null); // { mode: "create"|"edit", key? }

  // Recurring
  const [showRecurring, setShowRecurring] = useState(false);
  const [newRec, setNewRec] = useState({ category: "other", subcategory: "", amount: "", day: 1, memo: "" });

  const expenses = useLiveQuery(() => getExpensesForMonth(year, month), [year, month], []);
  const prevExpenses = useLiveQuery(() => {
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    return getExpensesForMonth(py, pm);
  }, [year, month], []);

  const customPresets = useLiveQuery(
    () => db.settings.get(`presets-${activeCat}`).then((r) => r?.value || []),
    [activeCat],
    []
  );
  const presetOverrides = useLiveQuery(
    () => db.settings.get(`preset-overrides-${activeCat}`).then((r) => r?.value || {}),
    [activeCat],
    {}
  );
  const recurring = useLiveQuery(
    () => db.settings.get("recurring-expenses").then((r) => r?.value || []),
    [],
    []
  );
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

  const allCategories = useMemo(
    () => mergeCategories(categoryOverrides || {}, customCategoriesList || []),
    [categoryOverrides, customCategoriesList]
  );
  const category = getCategory(activeCat, allCategories);

  // 기본 프리셋에 override 적용
  const defaultPresetsWithOverrides = useMemo(() => {
    return (category.presets || []).map((p, i) => {
      const ov = (presetOverrides || {})[i];
      if (!ov) return { ...p, __defaultIdx: i };
      return { ...p, ...ov, __defaultIdx: i };
    });
  }, [category.presets, presetOverrides]);

  const allPresets = [
    ...defaultPresetsWithOverrides,
    ...(customPresets || []).map((p, i) => ({ ...p, __customIdx: i }))
  ];

  const sums = useMemo(() => {
    const s = { total: 0 };
    for (const c of allCategories) s[c.key] = 0;
    for (const e of expenses || []) {
      const k = e.category === "social" ? "leisure" : e.category === "transit" ? "other" : e.category;
      s[k] = (s[k] || 0) + e.amount;
      s.total += e.amount;
    }
    return s;
  }, [expenses, allCategories]);

  const prevSums = useMemo(() => {
    const s = { total: 0, food: 0, leisure: 0, other: 0 };
    for (const e of prevExpenses || []) {
      const k = e.category === "social" ? "leisure" : e.category === "transit" ? "other" : e.category;
      s[k] = (s[k] || 0) + e.amount;
      s.total += e.amount;
    }
    return s;
  }, [prevExpenses]);

  const filteredExpenses = useMemo(() => {
    return (expenses || []).filter((e) => {
      if (filterCat !== "all") {
        const k = e.category === "social" ? "leisure" : e.category === "transit" ? "other" : e.category;
        if (k !== filterCat) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (e.memo || "").toLowerCase().includes(q) ||
          (e.subcategory || "").toLowerCase().includes(q) ||
          getCategory(e.category).label.includes(q)
        );
      }
      return true;
    });
  }, [expenses, filterCat, search]);

  const grouped = useMemo(() => {
    const byDate = {};
    for (const e of filteredExpenses) (byDate[e.date] ||= []).push(e);
    return Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredExpenses]);

  const quickAdd = async (preset) => {
    await addExpense({
      date: inputDate,
      category: activeCat,
      subcategory: preset.subcategory,
      amount: preset.amount,
      memo: ""
    });
  };

  const addCustom = async () => {
    if (!customAmount || Number.isNaN(Number(customAmount))) return;
    await addExpense({
      date: inputDate,
      category: activeCat,
      subcategory: customSub || null,
      amount: Number(customAmount),
      memo: customMemo
    });
    setCustomAmount("");
    setCustomSub("");
    setCustomMemo("");
  };

  const changeMonth = (dir) => {
    let m = month + dir, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  const addPreset = async () => {
    const amt = Number(newPresetAmount);
    if (!amt || Number.isNaN(amt)) return;
    const label = newPresetLabel.trim() || `${newPresetSub || category.label} ₩${amt.toLocaleString()}`;
    if (editingPreset?.kind === "default") {
      // 기본 프리셋 override (amount만 저장, label 입력 시 label도 override)
      const next = { ...(presetOverrides || {}), [editingPreset.idx]: { amount: amt, label } };
      await setPresetOverrides(activeCat, next);
    } else if (editingPreset?.kind === "custom") {
      const entry = { subcategory: newPresetSub, amount: amt, label, isCustom: true };
      const next = (customPresets || []).map((p, i) => i === editingPreset.idx ? entry : p);
      await setCustomPresets(activeCat, next);
    } else {
      const entry = { subcategory: newPresetSub, amount: amt, label, isCustom: true };
      await setCustomPresets(activeCat, [...(customPresets || []), entry]);
    }
    setNewPresetAmount("");
    setNewPresetSub("");
    setNewPresetLabel("");
    setEditingPreset(null);
  };

  const startEditPreset = (preset) => {
    setNewPresetAmount(String(preset.amount));
    setNewPresetSub(preset.subcategory || "");
    setNewPresetLabel(preset.label || "");
    if (preset.__customIdx !== undefined) {
      setEditingPreset({ kind: "custom", idx: preset.__customIdx });
    } else {
      setEditingPreset({ kind: "default", idx: preset.__defaultIdx });
    }
  };

  const cancelEditPreset = () => {
    setNewPresetAmount("");
    setNewPresetSub("");
    setNewPresetLabel("");
    setEditingPreset(null);
  };

  const removePreset = async (preset) => {
    if (preset.__customIdx !== undefined) {
      const next = (customPresets || []).filter((_, i) => i !== preset.__customIdx);
      await setCustomPresets(activeCat, next);
    } else if (preset.__defaultIdx !== undefined) {
      // 기본 프리셋: override 제거(원복)
      const next = { ...(presetOverrides || {}) };
      delete next[preset.__defaultIdx];
      await setPresetOverrides(activeCat, next);
    }
    cancelEditPreset();
  };

  const addRecurring = async () => {
    if (!newRec.amount || Number.isNaN(Number(newRec.amount))) return;
    const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const next = [...(recurring || []), {
      id,
      category: newRec.category,
      subcategory: newRec.subcategory,
      amount: Number(newRec.amount),
      dayOfMonth: Number(newRec.day),
      memo: newRec.memo
    }];
    await setRecurring(next);
    setNewRec({ category: "other", subcategory: "", amount: "", day: 1, memo: "" });
  };

  const removeRecurring = async (id) => {
    const next = (recurring || []).filter((r) => r.id !== id);
    await setRecurring(next);
  };

  // Category CRUD
  const saveCategory = async (patch) => {
    const isEdit = categoryEditor?.mode === "edit";
    const targetKey = categoryEditor?.key;
    const isDefault = targetKey && DEFAULT_CATEGORY_KEYS.has(targetKey);
    if (isEdit && isDefault) {
      // 기본 카테고리: override만 저장 (label/icon/color/bg/cap)
      const ov = { ...(categoryOverrides || {}) };
      ov[targetKey] = { ...(ov[targetKey] || {}), ...patch };
      await setCategoryOverrides(ov);
    } else if (isEdit) {
      // custom 카테고리 업데이트
      const next = (customCategoriesList || []).map((c) =>
        c.key === targetKey ? { ...c, ...patch } : c
      );
      await setCustomCategoriesStore(next);
    } else {
      // 생성
      const key = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const entry = {
        key, presets: [], subcats: [],
        color: "#C08080", bg: "#FFF5F5", cap: null,
        ...patch
      };
      await setCustomCategoriesStore([...(customCategoriesList || []), entry]);
    }
    setCategoryEditor(null);
  };

  const deleteCategory = async (key) => {
    if (DEFAULT_CATEGORY_KEYS.has(key)) return;
    if (!confirm("이 카테고리를 삭제할까요? 해당 카테고리의 기록은 '기타지출'로 이동됩니다.")) return;
    const moved = await migrateExpensesCategory(key, "other");
    const next = (customCategoriesList || []).filter((c) => c.key !== key);
    await setCustomCategoriesStore(next);
    // 연관 프리셋/override도 정리
    await setPresetOverrides(key, {});
    await setCustomPresets(key, []);
    if (activeCat === key) setActiveCat("other");
    if (moved > 0) alert(`${moved}개의 기록이 '기타지출'로 이동되었습니다.`);
  };

  const applyRecurring = async () => {
    const n = await applyRecurringForMonth(year, month);
    if (n === 0) alert("이미 모두 등록되어 있거나, 등록된 반복 지출이 없습니다.");
  };

  // 비교 배너
  const diff = sums.total - prevSums.total;
  const diffPct = prevSums.total > 0 ? Math.round((diff / prevSums.total) * 100) : 0;

  return (
    <>
      <TopBar
        breadcrumb={["Dashboard", "Expenses"]}
        title="Expenses"
        subtitle="변동지출을 한 번의 탭으로 기록하세요"
        right={
          <>
            <button className="btn btn-icon" onClick={() => changeMonth(-1)}>‹</button>
            <span className="btn" style={{ cursor: "default" }}>{year}.{String(month).padStart(2, "0")}</span>
            <button className="btn btn-icon" onClick={() => changeMonth(1)}>›</button>
          </>
        }
      />

      {/* Top stats row: diff | total */}
      <div style={{ display: "grid", gridTemplateColumns: prevSums.total > 0 ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 16 }} className="expenses-stats-row">
        {prevSums.total > 0 && (
          <div className="card-sm" style={{
            display: "flex", alignItems: "center", gap: 12,
            background: diff > 0 ? "#FFF5F5" : "#F0FAF5",
            borderColor: diff > 0 ? R.rose300 : R.mint
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: diff > 0 ? R.rose400 : R.mint,
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700
            }}>
              {diff > 0 ? "↑" : "↓"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: R.textLight }}>지난달 대비</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: diff > 0 ? R.over : R.mint }}>
                {diff > 0 ? "+" : ""}{fmt(diff)} ({diff > 0 ? "+" : ""}{diffPct}%)
              </div>
              <div style={{ fontSize: 10, color: R.textLight, marginTop: 2 }}>
                지난달 {fmt(prevSums.total)} → 이번달 {fmt(sums.total)}
              </div>
            </div>
          </div>
        )}

        <div className="card-sm" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: R.textLight }}>{year}.{String(month).padStart(2, "0")} 변동지출 합계</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, color: R.textDark, letterSpacing: -0.5 }}>
              {fmtWon(sums.total)}
            </div>
            <div className="progress-track" style={{ marginTop: 8 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, (sums.total / BUDGET_CAP) * 100)}%`,
                  background: sums.total > BUDGET_CAP ? R.over : R.rose400
                }}
              />
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: R.textMid, flexShrink: 0 }}>
            <div style={{ color: R.textLight }}>상한 {fmt(BUDGET_CAP)}</div>
            <div style={{ marginTop: 4, fontWeight: 700, fontSize: 13, color: sums.total > BUDGET_CAP ? R.over : R.mint }}>
              {sums.total > BUDGET_CAP ? `${fmt(sums.total - BUDGET_CAP)} 초과` : `${fmt(BUDGET_CAP - sums.total)} 여유`}
            </div>
          </div>
        </div>
      </div>

      {/* Category tabs - full width horizontal */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        {allCategories.map((c) => {
          const active = activeCat === c.key;
          const amt = sums[c.key] || 0;
          const pct = c.cap ? Math.min(100, (amt / c.cap) * 100) : 0;
          const over = c.cap && amt > c.cap * 0.8;
          const isDefault = DEFAULT_CATEGORY_KEYS.has(c.key);
          return (
            <div
              key={c.key}
              style={{
                flex: "1 1 220px",
                position: "relative",
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", borderRadius: 14,
                border: `1.5px solid ${active ? c.color : R.border}`,
                background: active ? c.bg : "rgba(255,255,255,0.8)",
                cursor: "pointer", transition: "all 0.15s"
              }}
              onClick={() => setActiveCat(c.key)}
            >
              <span style={{ fontSize: 20 }}>{c.icon}</span>
              <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? c.color : R.textDark }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 11, color: over ? R.over : R.textLight, marginTop: 2, fontWeight: 600 }}>
                  {fmt(amt)}{c.cap ? ` / ${fmt(c.cap)} (${pct.toFixed(0)}%)` : ""}
                </div>
              </div>
              {manageCategories && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCategoryEditor({ mode: "edit", key: c.key }); }}
                    style={{
                      width: 26, height: 26, borderRadius: 6, border: "none",
                      background: "#fff", color: c.color, cursor: "pointer", fontSize: 12
                    }}
                    title="편집"
                  >✎</button>
                  {!isDefault && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCategory(c.key); }}
                      style={{
                        width: 26, height: 26, borderRadius: 6, border: "none",
                        background: R.over, color: "#fff", cursor: "pointer", fontSize: 12
                      }}
                      title="삭제"
                    >×</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {manageCategories && (
          <button
            onClick={() => setCategoryEditor({ mode: "create" })}
            style={{
              flex: "0 0 auto",
              padding: "12px 18px", borderRadius: 14,
              border: `1.5px dashed ${R.rose400}`,
              background: "rgba(255,255,255,0.7)",
              cursor: "pointer", color: R.rose500, fontWeight: 700, fontSize: 13
            }}
          >+ 카테고리</button>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          className="btn btn-sm"
          onClick={() => setManageCategories((v) => !v)}
          style={{ background: manageCategories ? R.rose400 : "#fff", color: manageCategories ? "#fff" : R.textMid, borderColor: manageCategories ? R.rose400 : R.border }}
        >
          {manageCategories ? "완료" : "✎ 카테고리 관리"}
        </button>
      </div>

      {/* 2-column layout: left = inputs, right = log */}
      <div className="expenses-main-grid">
      <div className="expenses-left">

      {/* Card 1: 프리셋 빠른 추가 */}
      <div className="card" style={{ marginBottom: 12, background: category.bg, borderColor: category.color + "40" }}>
        <div className="section-title">
          <span style={{ color: category.color, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            {category.icon} {category.label} 프리셋
          </span>
          <button
            className="btn btn-sm"
            onClick={() => setManagePresets((v) => !v)}
            style={{ background: managePresets ? category.color : "#fff", color: managePresets ? "#fff" : R.textMid }}
          >
            {managePresets ? "완료" : "프리셋 관리"}
          </button>
        </div>
        <div style={{ fontSize: 11, color: R.textMid, marginTop: -6, marginBottom: 10 }}>
          자주 쓰는 지출을 한 번에 기록 · 탭하면 추가됩니다
        </div>

        {allPresets.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {allPresets.map((p, i) => {
              const isCustom = p.__customIdx !== undefined;
              const isDefault = p.__defaultIdx !== undefined;
              const isEditing = managePresets && (
                (editingPreset?.kind === "custom" && editingPreset.idx === p.__customIdx) ||
                (editingPreset?.kind === "default" && editingPreset.idx === p.__defaultIdx)
              );
              const isOverridden = isDefault && (presetOverrides || {})[p.__defaultIdx];
              return (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    display: "inline-flex", alignItems: "center",
                    background: isEditing ? category.bg : "#fff", borderRadius: 10,
                    border: `1.5px solid ${isEditing ? category.color : category.color + "33"}`
                  }}
                >
                  <button
                    onClick={() => {
                      if (!managePresets) quickAdd(p);
                      else startEditPreset(p);
                    }}
                    title={managePresets ? "탭하여 편집" : p.label}
                    style={{
                      padding: "10px 14px", border: "none", background: "transparent",
                      fontSize: 13, fontWeight: 600, color: isEditing ? category.color : R.textDark,
                      cursor: "pointer"
                    }}
                  >
                    {p.label}
                    {isOverridden && <span style={{ fontSize: 9, color: R.rose500, marginLeft: 4 }}>•편집됨</span>}
                  </button>
                  {managePresets && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removePreset(p); }}
                      style={{
                        background: R.over, color: "#fff", border: "none",
                        width: 22, height: 22, borderRadius: 6,
                        marginRight: 6, fontSize: 12, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}
                      title={isCustom ? "삭제" : "기본값 복원"}
                    >{isCustom ? "×" : "↺"}</button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: R.textLight, padding: "8px 0" }}>
            프리셋이 없습니다. "프리셋 관리"로 추가하세요.
          </div>
        )}

        {managePresets && (
          <div style={{
            background: editingPreset ? category.bg : "rgba(255,255,255,0.7)",
            borderRadius: 10, padding: 10, marginTop: 12,
            border: editingPreset ? `1.5px solid ${category.color}` : "none"
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: editingPreset ? category.color : R.textMid, marginBottom: 6 }}>
              {editingPreset?.kind === "default" ? "✏️ 기본 프리셋 편집 (금액/라벨 override)" :
               editingPreset?.kind === "custom" ? "✏️ 커스텀 프리셋 편집" :
               "+ 새 프리셋 추가"}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input
                type="number"
                placeholder="금액"
                value={newPresetAmount}
                onChange={(e) => setNewPresetAmount(e.target.value)}
                className="modal-input"
                style={{ width: 110, padding: "8px 10px", fontSize: 13 }}
              />
              <input
                type="text"
                list={`subcats-preset-${activeCat}`}
                placeholder="(세부, 자유 입력)"
                value={newPresetSub}
                onChange={(e) => setNewPresetSub(e.target.value)}
                className="modal-input"
                style={{ width: 140, padding: "8px 10px", fontSize: 13 }}
              />
              {category.subcats.length > 0 && (
                <datalist id={`subcats-preset-${activeCat}`}>
                  {category.subcats.map((s) => (
                    <option key={s.name} value={s.icon ? `${s.icon} ${s.name}` : s.name} />
                  ))}
                </datalist>
              )}
              <input
                type="text"
                placeholder="라벨 (예: ☕ 단골 카페 ₩4,800)"
                value={newPresetLabel}
                onChange={(e) => setNewPresetLabel(e.target.value)}
                className="modal-input"
                style={{ flex: 1, minWidth: 160, padding: "8px 10px", fontSize: 13 }}
              />
              <button className="btn btn-primary btn-sm" onClick={addPreset}>
                {editingPreset ? "저장" : "추가"}
              </button>
              {editingPreset && (
                <button className="btn btn-sm" onClick={cancelEditPreset}>취소</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Card 2: 일회성 직접 입력 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>✏️</span>
            직접 입력
          </span>
        </div>
        <div style={{ fontSize: 11, color: R.textMid, marginTop: -6, marginBottom: 10 }}>
          한 번만 쓰는 지출 · 금액/메모 자유 입력
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="number"
            inputMode="numeric"
            placeholder="금액"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="modal-input"
            style={{ width: 140 }}
          />
          <input
            type="text"
            list={`subcats-custom-${activeCat}`}
            placeholder={category.subcats.length > 0 ? "(세부, 자유 입력 / 이모지 OK)" : "(세부)"}
            value={customSub}
            onChange={(e) => setCustomSub(e.target.value)}
            className="modal-input"
            style={{ width: 180 }}
          />
          {category.subcats.length > 0 && (
            <datalist id={`subcats-custom-${activeCat}`}>
              {category.subcats.map((s) => (
                <option key={s.name} value={s.icon ? `${s.icon} ${s.name}` : s.name} />
              ))}
            </datalist>
          )}
          <input
            type="text"
            placeholder="메모 (선택)"
            value={customMemo}
            onChange={(e) => setCustomMemo(e.target.value)}
            className="modal-input"
            style={{ flex: 1, minWidth: 180 }}
          />
          <button className="btn btn-primary" onClick={addCustom}>추가</button>
        </div>
      </div>

      {/* Recurring expenses */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 8,
              background: R.rose400, color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 13
            }}>🔁</span>
            반복 지출
          </span>
          <span className="section-meta">
            {(recurring || []).length > 0 ? `${recurring.length}개 · 월 ${fmt(recurring.reduce((s, r) => s + r.amount, 0))}` : "구독·정기 결제"}
          </span>
        </div>

        {(recurring || []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {recurring.map((r) => {
              const c = getCategory(r.category);
              return (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", background: "#fff", borderRadius: 10,
                  border: `1px solid ${R.border}`
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, background: c.bg,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                    flexShrink: 0
                  }}>
                    {c.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: R.textDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.memo || c.label}
                      {r.subcategory && (() => {
                        const subIcon = getSubcatIcon(c, r.subcategory);
                        return <span style={{ color: R.textLight, fontWeight: 400, fontSize: 12, marginLeft: 6 }}>· {subIcon ? `${subIcon} ` : ""}{r.subcategory}</span>;
                      })()}
                    </div>
                    <div style={{ fontSize: 10, color: R.textLight, marginTop: 1 }}>매월 {r.dayOfMonth}일</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.color, flexShrink: 0 }}>-{fmt(r.amount)}</div>
                  <button
                    onClick={() => removeRecurring(r.id)}
                    style={{
                      width: 24, height: 24, padding: 0, borderRadius: 6,
                      border: "none", background: "transparent", color: R.textLight,
                      fontSize: 14, cursor: "pointer", flexShrink: 0
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = R.rose400; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = R.textLight; }}
                  >×</button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          {(recurring || []).length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={applyRecurring} style={{ flex: 1 }}>
              이번 달 자동 적용
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={() => setShowRecurring((v) => !v)}
            style={{ flex: (recurring || []).length > 0 ? "0 0 auto" : 1 }}
          >
            {showRecurring ? "− 입력 닫기" : "+ 새 반복 등록"}
          </button>
        </div>

        {showRecurring && (
          <div style={{
            background: R.cream, borderRadius: 12, padding: 14, marginTop: 10,
            border: `1px solid ${R.border}`
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                type="text"
                placeholder="이름 (예: Netflix, 헬스장)"
                value={newRec.memo}
                onChange={(e) => setNewRec({ ...newRec, memo: e.target.value })}
                className="modal-input"
                style={{ padding: "10px 12px", fontSize: 14, fontWeight: 600 }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 8 }}>
                <select
                  value={newRec.category}
                  onChange={(e) => setNewRec({ ...newRec, category: e.target.value })}
                  className="modal-input"
                  style={{ padding: "10px 12px", fontSize: 13 }}
                >
                  {allCategories.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="세부 (선택)"
                  value={newRec.subcategory}
                  onChange={(e) => setNewRec({ ...newRec, subcategory: e.target.value })}
                  className="modal-input"
                  style={{ padding: "10px 12px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                <input
                  type="number"
                  placeholder="금액"
                  value={newRec.amount}
                  onChange={(e) => setNewRec({ ...newRec, amount: e.target.value })}
                  className="modal-input"
                  style={{ padding: "10px 12px", fontSize: 14, fontWeight: 600 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", borderRadius: 10, border: `1px solid ${R.border}`, padding: "0 12px" }}>
                  <span style={{ fontSize: 12, color: R.textLight }}>매월</span>
                  <input
                    type="number"
                    min={1} max={31}
                    value={newRec.day}
                    onChange={(e) => setNewRec({ ...newRec, day: e.target.value })}
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 14, fontWeight: 600, background: "transparent", padding: "10px 0", textAlign: "center", color: R.textDark }}
                  />
                  <span style={{ fontSize: 12, color: R.textLight }}>일</span>
                </div>
              </div>
              <button className="btn btn-primary" onClick={addRecurring}>등록</button>
            </div>
          </div>
        )}
      </div>

      </div>{/* /expenses-left */}

      {/* Log + search */}
      <div className="card expenses-right">
        <div className="section-title">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            기록
            <input
              type="date"
              value={inputDate}
              min={monthMin}
              max={monthMax}
              onChange={(e) => setInputDate(e.target.value)}
              className="btn btn-sm"
              style={{ padding: "0 10px", fontWeight: 600, color: R.textDark, background: "#fff" }}
              title="기록할 날짜 (빠른 추가에 반영됨)"
            />
            {inputDate !== defaultInputDate && (
              <button
                className="btn btn-sm btn-icon"
                onClick={() => setInputDate(defaultInputDate)}
                title="오늘로 되돌리기"
              >↺</button>
            )}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="btn btn-sm"
              style={{ padding: "0 8px" }}
            >
              <option value="all">전체</option>
              {allCategories.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
            <input
              type="text"
              placeholder="🔍 메모/세부 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="btn btn-sm"
              style={{ width: 160, fontWeight: 500 }}
            />
          </div>
        </div>
        {grouped.length === 0 ? (
          <div style={{ fontSize: 13, color: R.textLight, padding: "32px 0", textAlign: "center" }}>
            <img src="./pixel-heart.png" alt="" style={{ width: 48, opacity: 0.35, marginBottom: 8 }} /><br />
            {search || filterCat !== "all" ? "조건에 맞는 기록이 없습니다." : "아직 기록이 없습니다. 위에서 빠른 추가로 시작하세요."}
          </div>
        ) : (
          grouped.map(([date, items]) => (
            <div key={date} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: R.textMid, marginBottom: 8 }}>
                {date} · {fmt(items.reduce((s, x) => s + x.amount, 0))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((e) => {
                  const c = getCategory(e.category);
                  const isRec = e.memo?.startsWith("recur:");
                  return (
                    <div
                      key={e.id}
                      onClick={() => setEditExpense(e)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px", borderRadius: 10,
                        background: "#fff", border: `1px solid ${R.border}`,
                        cursor: "pointer", transition: "all 0.15s"
                      }}
                      onMouseEnter={(ev) => ev.currentTarget.style.borderColor = c.color}
                      onMouseLeave={(ev) => ev.currentTarget.style.borderColor = R.border}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, background: c.bg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, flexShrink: 0
                      }}>
                        {c.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: R.textDark }}>
                          {c.label}
                          {e.subcategory && (() => {
                            const subIcon = getSubcatIcon(c, e.subcategory);
                            return ` · ${subIcon ? `${subIcon} ` : ""}${e.subcategory}`;
                          })()}
                          {isRec && <span style={{ fontSize: 10, color: R.rose500, marginLeft: 6 }}>🔁</span>}
                        </div>
                        {e.memo && !isRec && (
                          <div style={{ fontSize: 11, color: R.textLight, marginTop: 2 }}>{e.memo}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: c.color }}>
                        -{fmt(e.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      </div>{/* /expenses-main-grid */}

      {editExpense && (
        <ExpenseEditor
          expense={editExpense}
          allCategories={allCategories}
          onSave={async (patch) => {
            await updateExpense(editExpense.id, patch);
            setEditExpense(null);
          }}
          onDelete={async () => {
            await deleteExpense(editExpense.id);
            setEditExpense(null);
          }}
          onClose={() => setEditExpense(null)}
        />
      )}

      {categoryEditor && (
        <CategoryEditor
          mode={categoryEditor.mode}
          category={categoryEditor.mode === "edit" ? allCategories.find((c) => c.key === categoryEditor.key) : null}
          isDefault={categoryEditor.mode === "edit" && DEFAULT_CATEGORY_KEYS.has(categoryEditor.key)}
          onSave={saveCategory}
          onClose={() => setCategoryEditor(null)}
        />
      )}
    </>
  );
}

function ExpenseEditor({ expense, allCategories, onSave, onDelete, onClose }) {
  const [amount, setAmount] = useState(expense.amount);
  const [category, setCategory] = useState(expense.category);
  const [subcategory, setSubcategory] = useState(expense.subcategory || "");
  const [memo, setMemo] = useState(expense.memo || "");
  const [date, setDate] = useState(expense.date);

  const cat = getCategory(category, allCategories);
  const categoryList = allCategories || EXPENSE_CATEGORIES;

  const save = () => {
    onSave({
      amount: Number(amount) || 0,
      category, subcategory: subcategory || null,
      memo, date
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{cat.icon} 기록 편집</div>
        <div className="modal-sub">{date}</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}
            className="modal-input"
            style={{ flex: 1 }}
          >
            {categoryList.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          <input
            type="text"
            list={`subcats-edit-${category}`}
            placeholder="(세부, 자유 입력)"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="modal-input"
            style={{ width: 150 }}
          />
          {cat.subcats.length > 0 && (
            <datalist id={`subcats-edit-${category}`}>
              {cat.subcats.map((s) => (
                <option key={s.name} value={s.icon ? `${s.icon} ${s.name}` : s.name} />
              ))}
            </datalist>
          )}
        </div>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="modal-input"
          style={{ marginBottom: 10 }}
        />

        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="modal-input"
          placeholder="금액"
          style={{ marginBottom: 10 }}
          autoFocus
        />

        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="modal-input"
          placeholder="메모"
        />

        <div className="modal-actions">
          <button
            className="btn btn-sm"
            onClick={onDelete}
            style={{ marginRight: "auto", color: R.over }}
          >
            삭제
          </button>
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

const ICON_OPTIONS = [
  "🍽️", "🎉", "📦", "🚇", "🏠", "💼", "📚", "🏋️", "🎬", "🎨",
  "🛍️", "🎁", "🐰", "🌸", "☕", "🍰", "💊", "💄", "👗", "✨"
];

function CategoryEditor({ mode, category, isDefault, onSave, onClose }) {
  const [label, setLabel] = useState(category?.label || "");
  const [icon, setIcon] = useState(category?.icon || "📦");
  const [colorIdx, setColorIdx] = useState(() => {
    if (!category) return 0;
    const found = CATEGORY_COLOR_PRESETS.findIndex((c) => c.color === category.color);
    return found >= 0 ? found : 0;
  });
  const [cap, setCap] = useState(category?.cap ?? "");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [subcats, setSubcats] = useState(() => normalizeSubcats(category?.subcats));
  const [subIconPickerIdx, setSubIconPickerIdx] = useState(null); // 어떤 subcat 아이콘 피커가 열려있는지

  const updateSubcat = (idx, patch) => {
    setSubcats((list) => list.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSubcat = (idx) => {
    setSubcats((list) => list.filter((_, i) => i !== idx));
    setSubIconPickerIdx(null);
  };
  const addSubcat = () => {
    setSubcats((list) => [...list, { name: "", icon: null }]);
  };

  const save = () => {
    const chosen = CATEGORY_COLOR_PRESETS[colorIdx];
    const cleanedSubcats = subcats
      .map((s) => ({ name: (s.name || "").trim(), icon: s.icon || null }))
      .filter((s) => s.name);
    const patch = {
      label: label.trim() || "(이름 없음)",
      icon,
      color: chosen.color,
      bg: chosen.bg,
      cap: cap === "" ? null : Number(cap),
      subcats: cleanedSubcats
    };
    onSave(patch);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {mode === "create" ? "카테고리 추가" : isDefault ? "기본 카테고리 편집" : "카테고리 편집"}
        </div>
        <div className="modal-sub">
          {isDefault ? "이름·이모지·색상·상한만 수정 가능" : "이름, 이모지, 색상, 월 상한 예산 설정"}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            className="modal-input"
            onClick={() => setShowIconPicker((v) => !v)}
            style={{ width: 60, padding: "10px 8px", fontSize: 22, textAlign: "center", background: "#fff", cursor: "pointer" }}
          >{icon}</button>
          <input
            className="modal-input"
            placeholder="이름 (예: 반려동물)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>

        {showIconPicker && (
          <div style={{ background: "#FAF5F3", borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="직접 입력"
                value={icon}
                onChange={(e) => setIcon(e.target.value || "📦")}
                className="modal-input"
                style={{ flex: 1, fontSize: 14, padding: "8px 10px" }}
                maxLength={4}
              />
              <button type="button" className="btn btn-sm" onClick={() => setShowIconPicker(false)}>닫기</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => { setIcon(ic); setShowIconPicker(false); }}
                  style={{
                    width: 32, height: 32, borderRadius: 8, fontSize: 18,
                    border: icon === ic ? "2px solid #C08080" : "1px solid transparent",
                    background: icon === ic ? "#FFF0EC" : "#fff", cursor: "pointer", padding: 0
                  }}
                >{ic}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 6 }}>색상</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {CATEGORY_COLOR_PRESETS.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setColorIdx(i)}
              style={{
                width: 34, height: 34, borderRadius: 10,
                background: c.bg,
                border: `2px solid ${colorIdx === i ? c.color : "transparent"}`,
                cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 6, background: c.color }} />
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 6 }}>월 상한 (선택, 원)</div>
        <input
          type="number"
          className="modal-input"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="예: 440000"
          style={{ marginBottom: 12 }}
        />

        <div style={{ fontSize: 11, fontWeight: 700, color: "#7A6060", marginBottom: 6 }}>
          세부 카테고리 <span style={{ color: "#B8A9A3", fontWeight: 500 }}>· 이름과 이모지 자유 설정</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {subcats.length === 0 && (
            <div style={{ fontSize: 11, color: "#B8A9A3", padding: "4px 0" }}>
              세부 카테고리 없음. 필요하면 "+ 세부 추가"로 생성하세요.
            </div>
          )}
          {subcats.map((s, idx) => (
            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setSubIconPickerIdx(subIconPickerIdx === idx ? null : idx)}
                  className="modal-input"
                  style={{
                    width: 44, padding: "8px 4px", fontSize: 18, textAlign: "center",
                    background: "#fff", cursor: "pointer"
                  }}
                  title="이모지 선택"
                >{s.icon || "🏷️"}</button>
                <input
                  className="modal-input"
                  placeholder="세부 이름 (예: 커피)"
                  value={s.name}
                  onChange={(e) => updateSubcat(idx, { name: e.target.value })}
                  style={{ flex: 1, padding: "8px 10px", fontSize: 13 }}
                />
                <button
                  type="button"
                  onClick={() => removeSubcat(idx)}
                  style={{
                    width: 28, height: 28, borderRadius: 8, border: "none",
                    background: "#C06060", color: "#fff", cursor: "pointer", fontSize: 13,
                    flexShrink: 0
                  }}
                  title="삭제"
                >×</button>
              </div>
              {subIconPickerIdx === idx && (
                <div style={{ background: "#FAF5F3", borderRadius: 8, padding: 8 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    <input
                      type="text"
                      placeholder="직접 입력"
                      value={s.icon || ""}
                      onChange={(e) => updateSubcat(idx, { icon: e.target.value || null })}
                      className="modal-input"
                      style={{ flex: 1, fontSize: 13, padding: "6px 8px" }}
                      maxLength={4}
                    />
                    <button
                      type="button"
                      onClick={() => updateSubcat(idx, { icon: null })}
                      className="btn btn-sm"
                      style={{ padding: "0 8px", fontSize: 11 }}
                    >지우기</button>
                    <button type="button" className="btn btn-sm" onClick={() => setSubIconPickerIdx(null)}>닫기</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
                    {ICON_OPTIONS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => { updateSubcat(idx, { icon: ic }); setSubIconPickerIdx(null); }}
                        style={{
                          width: 28, height: 28, borderRadius: 6, fontSize: 16,
                          border: s.icon === ic ? "2px solid #C08080" : "1px solid transparent",
                          background: s.icon === ic ? "#FFF0EC" : "#fff", cursor: "pointer", padding: 0
                        }}
                      >{ic}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={addSubcat}
          style={{ marginBottom: 8, width: "100%", borderStyle: "dashed" }}
        >+ 세부 추가</button>

        <div className="modal-actions">
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save}>
            {mode === "create" ? "추가" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
