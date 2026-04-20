import { useState } from "react";
import { setUserProfile, markOnboardingComplete } from "../db.js";
import { setUserPhases } from "../lib/phase.js";

const STEPS = ["프로필", "재무 목표", "수입", "지출 예산", "Phase 로드맵", "부채 (선택)"];

// 중립 테마 — 슬레이트 블루 계열 (앱 자체의 로즈 테마와 구분)
const T = {
  accent: "#4A5C7A",       // 슬레이트 블루
  accentLight: "#6B7E9C",
  accentBg: "#F0F3F8",
  text: "#1F2937",
  textMid: "#4B5563",
  textLight: "#9CA3AF",
  border: "#E5E7EB",
  cardBg: "#FFFFFF",
  backdrop: "rgba(31, 41, 55, 0.65)"
};

const DEFAULT_INCOME_SOURCE = {
  id: "",
  name: "",
  type: "fixed",  // fixed | variable
  amount: "",
  day: "",
  note: ""
};

// Phase 템플릿: 목표 기간을 3등분해서 기본 3단계 제안
const PHASE_TEMPLATES = {
  3: [
    { name: "기반 다지기", goals: ["비상금 마련", "고정지출 자동이체 세팅", "월간 지출 기록 습관화"] },
    { name: "성장 가속", goals: ["투자 루틴 확립", "수입 증대 (커리어·부업)", "분기별 포트폴리오 점검"] },
    { name: "목표 접근", goals: ["안전자산 비중 확대", "세금 최적화", "다음 재무 목표 설정"] }
  ],
  5: [
    { name: "출발", goals: ["현재 자산·부채 현황 파악", "증권 계좌 개설", "지출 카테고리 분류"] },
    { name: "기반 다지기", goals: ["비상금 마련", "부채 청산 계획 실행", "고정지출 최적화"] },
    { name: "성장 가속", goals: ["투자 루틴 확립", "수입원 다변화", "포트폴리오 첫 리밸런싱"] },
    { name: "안정기", goals: ["레버리지 비중 점검", "중간 목표 도달 확인", "세금 최적화 루틴"] },
    { name: "목표 접근", goals: ["안전자산 전환", "자산 용도별 분리", "다음 목표 수립"] }
  ]
};

/**
 * 목표 기간을 N등분해서 Phase 템플릿 생성
 */
function generatePhaseTemplate(currentDate, goalDate, n = 3) {
  const start = new Date(currentDate);
  const end = new Date(goalDate);
  if (isNaN(end.getTime()) || end <= start) return [];
  const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (totalMonths < n) return [];

  const addMonths = (d, months) => {
    const x = new Date(d.getFullYear(), d.getMonth() + months, 1);
    return { y: x.getFullYear(), m: x.getMonth() + 1 };
  };
  const fmtRange = (s, e) =>
    `${s.y}.${String(s.m).padStart(2, "0")} ~ ${e.y}.${String(e.m).padStart(2, "0")}`;

  const boundaries = [];
  for (let i = 0; i <= n; i++) {
    boundaries.push(Math.floor((totalMonths * i) / n));
  }

  const templateMeta = PHASE_TEMPLATES[n] || Array.from({ length: n }, (_, i) => ({
    name: `Phase ${i + 1}`, goals: []
  }));

  const phases = [];
  for (let i = 0; i < n; i++) {
    const s = addMonths(start, boundaries[i]);
    const e = i === n - 1
      ? { y: end.getFullYear(), m: end.getMonth() + 1 }
      : addMonths(start, boundaries[i + 1] - 1);
    phases.push({
      num: i + 1,
      name: templateMeta[i].name,
      start: s, end: e,
      range: fmtRange(s, e),
      goals: [...(templateMeta[i].goals || [])]
    });
  }
  return phases;
}

export default function OnboardingModal({ onComplete, onClose, initialProfile, initialPhases }) {
  const [step, setStep] = useState(0);
  const isEditMode = !!initialProfile;

  const [data, setData] = useState(() => {
    if (initialProfile) {
      return {
        name: initialProfile.name || "",
        age: initialProfile.age || "",
        birthYear: initialProfile.birthYear || "",
        subtitle: initialProfile.subtitle || "",
        dashboardTitle: initialProfile.dashboardTitle || "",
        dashboardSubtitle: initialProfile.dashboardSubtitle || "",
        currentNetWorth: initialProfile.currentNetWorth ?? "",
        goalAmount: initialProfile.goalAmount ?? "",
        goalDate: initialProfile.goalDate || "",
        incomeSources: (initialProfile.incomeSources && initialProfile.incomeSources.length > 0)
          ? initialProfile.incomeSources
          : [{ ...DEFAULT_INCOME_SOURCE, id: `src-${Date.now()}`, name: "월급" }],
        expenseBudgetCap: initialProfile.expenseBudgetCap ?? "",
        phaseMode: (initialPhases && initialPhases.length > 0) ? "use" : "none",
        customPhases: initialPhases || [],
        debtEnabled: !!initialProfile.debtEnabled,
        debtItems: initialProfile.debtItems || []
      };
    }
    return {
      name: "", age: "", birthYear: "", subtitle: "",
      dashboardTitle: "", dashboardSubtitle: "",
      currentNetWorth: "", goalAmount: "", goalDate: "",
      incomeSources: [{ ...DEFAULT_INCOME_SOURCE, id: `src-${Date.now()}`, name: "월급" }],
      expenseBudgetCap: "",
      phaseMode: "use",
      customPhases: [],
      debtEnabled: false, debtItems: []
    };
  });

  const set = (patch) => setData((d) => ({ ...d, ...patch }));

  // 수입 소스 조작
  const updateSource = (id, patch) =>
    setData((d) => ({
      ...d,
      incomeSources: d.incomeSources.map((s) => (s.id === id ? { ...s, ...patch } : s))
    }));
  const addSource = () =>
    setData((d) => ({
      ...d,
      incomeSources: [
        ...d.incomeSources,
        { ...DEFAULT_INCOME_SOURCE, id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` }
      ]
    }));
  const removeSource = (id) =>
    setData((d) => ({ ...d, incomeSources: d.incomeSources.filter((s) => s.id !== id) }));

  // Phase
  const addCustomPhase = () =>
    setData((d) => ({
      ...d,
      customPhases: [
        ...d.customPhases,
        {
          num: d.customPhases.length + 1,
          name: "",
          start: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
          end: { y: new Date().getFullYear() + 1, m: 12 },
          goals: [],
          range: ""
        }
      ]
    }));
  const removeCustomPhase = (idx) =>
    setData((d) => ({ ...d, customPhases: d.customPhases.filter((_, i) => i !== idx) }));
  const updateCustomPhase = (idx, patch) =>
    setData((d) => ({
      ...d,
      customPhases: d.customPhases.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    }));

  // 부채
  const addDebtItem = () =>
    setData((d) => ({
      ...d,
      debtItems: [
        ...d.debtItems,
        { id: `debt-${Date.now()}`, name: "", total: "", monthly: "", dueDay: 26 }
      ]
    }));
  const removeDebtItem = (id) =>
    setData((d) => ({ ...d, debtItems: d.debtItems.filter((x) => x.id !== id) }));
  const updateDebtItem = (id, patch) =>
    setData((d) => ({
      ...d,
      debtItems: d.debtItems.map((x) => (x.id === id ? { ...x, ...patch } : x))
    }));

  const stepValid = (() => {
    if (step === 0) return data.name.trim().length > 0 && data.age;
    if (step === 1) return data.currentNetWorth !== "" && data.goalAmount !== "" && data.goalDate;
    if (step === 2) return data.incomeSources.length > 0 && data.incomeSources.every((s) => s.name.trim() && s.amount !== "");
    if (step === 3) return data.expenseBudgetCap !== "";
    if (step === 4) return data.phaseMode === "none" ||
                          (data.phaseMode === "use" && data.customPhases.every((p) => p.name.trim()));
    if (step === 5) return !data.debtEnabled || data.debtItems.every((x) => x.name.trim() && x.total !== "" && x.monthly !== "");
    return true;
  })();

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    const sources = data.incomeSources.map((s) => ({
      ...s,
      amount: Number(s.amount) || 0,
      // 고정 수입은 입력 없으면 25일 기본, 변동 수입은 null 허용 (월말 표시)
      day: s.day === "" || s.day == null
        ? (s.type === "fixed" ? 25 : null)
        : Number(s.day)
    }));
    const firstFixed = sources.find((s) => s.type === "fixed") || sources[0];
    const profile = {
      name: data.name.trim(),
      age: Number(data.age) || 0,
      birthYear: Number(data.birthYear) || new Date().getFullYear() - (Number(data.age) || 0) + 1,
      subtitle: data.subtitle.trim() || "사용자",
      dashboardTitle: data.dashboardTitle.trim(),
      dashboardSubtitle: data.dashboardSubtitle.trim(),
      currentNetWorth: Number(data.currentNetWorth) || 0,
      goalAmount: Number(data.goalAmount) || 0,
      goalDate: data.goalDate,
      incomeSources: sources,
      salary: Number(firstFixed?.amount) || 0,
      salaryDay: Number(firstFixed?.day) || 25,
      expenseBudgetCap: Number(data.expenseBudgetCap) || 0,
      debtEnabled: !!data.debtEnabled,
      debtItems: data.debtItems.map((x) => ({
        ...x,
        total: Number(x.total) || 0,
        monthly: Number(x.monthly) || 0,
        dueDay: Number(x.dueDay) || 26
      }))
    };
    await setUserProfile(profile);

    // Phase 저장
    let phases = [];
    if (data.phaseMode === "use") {
      phases = data.customPhases.map((p) => ({
        ...p,
        range: `${p.start.y}.${String(p.start.m).padStart(2, "0")} ~ ${p.end.y}.${String(p.end.m).padStart(2, "0")}`,
        goals: (p.goals || []).filter((g) => g && g.trim())
      }));
    }
    await setUserPhases(phases);

    await markOnboardingComplete();
    onComplete();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: T.backdrop, backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16
    }}>
      <div
        style={{
          background: T.cardBg, borderRadius: 16, padding: 28,
          maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          fontFamily: "'Pretendard', -apple-system, sans-serif",
          color: T.text
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: T.textLight, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>
              {isEditMode ? "SETTINGS · 프로필 재설정" : "WELCOME · 초기 설정"}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              {STEPS[step]}
            </div>
            <div style={{ fontSize: 12, color: T.textMid, marginBottom: 20 }}>
              Step {step + 1} / {STEPS.length}
            </div>
          </div>
          {isEditMode && onClose && (
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "none", fontSize: 20,
                color: T.textLight, cursor: "pointer", padding: "4px 8px"
              }}
              title="닫기"
            >×</button>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? T.accent : T.border
            }} />
          ))}
        </div>

        {/* Step 0: 프로필 */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="이름 *" T={T}>
              <input
                className="onb-input"
                value={data.name}
                onChange={(e) => set({ name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="대한민국 나이 *" T={T}>
              <input
                type="number"
                className="onb-input"
                value={data.age}
                onChange={(e) => set({
                  age: e.target.value,
                  birthYear: e.target.value ? new Date().getFullYear() - Number(e.target.value) + 1 : ""
                })}
              />
            </Field>
            <Field label="직업" T={T} hint="선택 입력">
              <input
                className="onb-input"
                value={data.subtitle}
                onChange={(e) => set({ subtitle: e.target.value })}
              />
            </Field>
            <Field label="대시보드 제목" T={T} hint={`비우면 "{이름}의 자산관리앱"`}>
              <input
                className="onb-input"
                value={data.dashboardTitle}
                onChange={(e) => set({ dashboardTitle: e.target.value })}
              />
            </Field>
            <Field label="대시보드 부제목" T={T} hint="비우면 오늘 날짜 + 목표 자동 표시">
              <input
                className="onb-input"
                value={data.dashboardSubtitle}
                onChange={(e) => set({ dashboardSubtitle: e.target.value })}
              />
            </Field>
          </div>
        )}

        {/* Step 1: 재무 목표 */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="현재 순자산 (원) *" T={T} hint="예적금 + 투자 + 전세금 − 부채">
              <NumberField
                value={data.currentNetWorth}
                onChange={(v) => set({ currentNetWorth: v })}
                autoFocus
              />
            </Field>
            <Field label="목표 순자산 (원) *" T={T}>
              <NumberField
                value={data.goalAmount}
                onChange={(v) => set({ goalAmount: v })}
              />
            </Field>
            <Field label="목표 달성일 *" T={T} hint="D-Day 카운트다운 기준">
              <input
                type="date"
                className="onb-input"
                value={data.goalDate}
                onChange={(e) => set({ goalDate: e.target.value })}
              />
            </Field>
            {data.currentNetWorth !== "" && data.goalAmount && data.goalDate && (() => {
              const months = Math.max(1, Math.round((new Date(data.goalDate) - new Date()) / (1000 * 60 * 60 * 24 * 30)));
              const needed = Math.ceil((Number(data.goalAmount) - Number(data.currentNetWorth)) / months);
              return (
                <div style={{ background: T.accentBg, borderRadius: 10, padding: 12, fontSize: 12, color: T.textMid }}>
                  📊 {months}개월간 월평균 <b>{Math.round(needed / 10000).toLocaleString()}만원</b> 저축 필요
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 2: 수입 (다중 소스) */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              background: T.accentBg, borderRadius: 10, padding: 12,
              fontSize: 12, color: T.textMid, lineHeight: 1.6
            }}>
              💡 월급 외에 부업·배당·용돈 등 여러 소득원이 있으면 모두 추가하세요.<br />
              <b>정기적이지 않은 수입은 입금일을 비워두세요.</b> 해당 월 말일에 자동 표시되고
              월별 집계에는 정상 포함됩니다. (변동 수입은 월별 예상치를 이후 대시보드에서 수정 가능)
            </div>
            {data.incomeSources.map((s, idx) => (
              <div key={s.id} style={{
                background: T.accentBg, borderRadius: 10, padding: 12,
                border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8
              }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="onb-input"
                    value={s.name}
                    onChange={(e) => updateSource(s.id, { name: e.target.value })}
                    placeholder="수입원 이름 (예: 본업 월급)"
                    style={{ flex: 1 }}
                  />
                  {data.incomeSources.length > 1 && (
                    <button
                      onClick={() => removeSource(s.id)}
                      style={{
                        background: "#DC2626", color: "#fff", border: "none",
                        borderRadius: 8, padding: "0 10px", cursor: "pointer", fontSize: 14
                      }}
                    >×</button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={s.type}
                    onChange={(e) => updateSource(s.id, { type: e.target.value })}
                    className="onb-input"
                    style={{ width: 120 }}
                  >
                    <option value="fixed">정기 (고정)</option>
                    <option value="variable">변동</option>
                  </select>
                  <div style={{ flex: 1 }}>
                    <NumberField
                      value={s.amount}
                      onChange={(v) => updateSource(s.id, { amount: v })}
                      placeholder="금액"
                    />
                  </div>
                  <input
                    type="number"
                    min={1} max={31}
                    className="onb-input"
                    value={s.day}
                    onChange={(e) => updateSource(s.id, { day: e.target.value })}
                    placeholder="매월 입금일"
                    style={{ width: 110 }}
                    title={s.type === "variable" ? "정기적이지 않으면 비워두세요" : "매월 입금일"}
                  />
                </div>
              </div>
            ))}
            <button
              onClick={addSource}
              style={{
                background: "transparent", border: `1.5px dashed ${T.accent}`,
                color: T.accent, borderRadius: 10, padding: "10px",
                cursor: "pointer", fontSize: 13, fontWeight: 700
              }}
            >+ 수입원 추가</button>
          </div>
        )}

        {/* Step 3: 지출 예산 */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="월 변동지출 상한 (원) *" T={T} hint="식비·여가·기타 지출의 월간 목표 한도">
              <NumberField
                value={data.expenseBudgetCap}
                onChange={(v) => set({ expenseBudgetCap: v })}
                autoFocus
              />
            </Field>
            <div style={{ fontSize: 11, color: T.textLight }}>
              💡 카테고리별 세부 상한(식비 얼마, 여가 얼마)은 앱 안의 "카테고리 관리"에서 조정할 수 있습니다.
            </div>
          </div>
        )}

        {/* Step 4: Phase 로드맵 */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: T.textMid }}>
              목표를 단계별로 쪼개 관리할지 선택하세요.
            </div>
            {[
              { key: "use", title: "Phase 로드맵 사용", desc: "목표까지의 여정을 단계별로 나눠 관리" },
              { key: "none", title: "사용 안 함", desc: "Phase 없이 현재 상태만 표시" }
            ].map((opt) => (
              <label key={opt.key} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: 12,
                background: data.phaseMode === opt.key ? T.accentBg : T.cardBg,
                border: `1.5px solid ${data.phaseMode === opt.key ? T.accent : T.border}`,
                borderRadius: 10, cursor: "pointer"
              }}>
                <input
                  type="radio"
                  checked={data.phaseMode === opt.key}
                  onChange={() => set({ phaseMode: opt.key })}
                  style={{ marginTop: 3, accentColor: T.accent }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{opt.title}</div>
                  <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}

            {data.phaseMode === "use" && (
              <>
                {/* 빠른 추가 버튼 */}
                <div style={{ background: T.accentBg, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 8 }}>
                    빠른 추가 (선택 후에도 이름·기간·목표 편집 가능)
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { n: 3, label: "3단계", desc: "기반 · 성장 · 목표 접근" },
                      { n: 5, label: "5단계", desc: "출발 · 기반 · 성장 · 안정 · 목표" }
                    ].map((opt) => (
                      <button
                        key={opt.n}
                        type="button"
                        onClick={() => {
                          if (!data.goalDate) {
                            alert("먼저 재무 목표 단계에서 목표 달성일을 입력하세요.");
                            return;
                          }
                          if (data.customPhases.length > 0 &&
                              !confirm("기존 Phase 입력 내용이 모두 덮어쓰기됩니다. 계속할까요?")) return;
                          const tpl = generatePhaseTemplate(new Date(), new Date(data.goalDate), opt.n);
                          set({ customPhases: tpl });
                        }}
                        style={{
                          flex: "1 1 120px",
                          padding: "10px 12px", borderRadius: 8,
                          background: "#fff", border: `1px solid ${T.border}`,
                          cursor: "pointer", textAlign: "left",
                          fontFamily: "inherit"
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>{opt.label}</div>
                        <div style={{ fontSize: 10, color: T.textMid, marginTop: 2 }}>{opt.desc}</div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        if (data.customPhases.length > 0 &&
                            !confirm("기존 Phase 입력 내용이 모두 지워집니다. 계속할까요?")) return;
                        set({ customPhases: [] });
                      }}
                      style={{
                        flex: "1 1 120px",
                        padding: "10px 12px", borderRadius: 8,
                        background: "#fff", border: `1px dashed ${T.accent}`,
                        cursor: "pointer", textAlign: "left",
                        fontFamily: "inherit"
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>직접 입력</div>
                      <div style={{ fontSize: 10, color: T.textMid, marginTop: 2 }}>빈 칸에서 직접 구성</div>
                    </button>
                  </div>
                </div>
              </>
            )}

            {data.phaseMode === "use" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {data.customPhases.map((p, idx) => (
                  <div key={idx} style={{ background: T.accentBg, borderRadius: 10, padding: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <input
                        className="onb-input"
                        value={p.name}
                        onChange={(e) => updateCustomPhase(idx, { name: e.target.value })}
                        placeholder={`Phase ${idx + 1} 이름`}
                        style={{ flex: 1 }}
                      />
                      <button
                        onClick={() => removeCustomPhase(idx)}
                        style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}
                      >×</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                      <input
                        type="month"
                        value={`${p.start.y}-${String(p.start.m).padStart(2, "0")}`}
                        onChange={(e) => {
                          const [y, m] = e.target.value.split("-").map(Number);
                          updateCustomPhase(idx, { start: { y, m } });
                        }}
                        className="onb-input" style={{ flex: 1 }}
                      />
                      <span style={{ color: T.textLight }}>~</span>
                      <input
                        type="month"
                        value={`${p.end.y}-${String(p.end.m).padStart(2, "0")}`}
                        onChange={(e) => {
                          const [y, m] = e.target.value.split("-").map(Number);
                          updateCustomPhase(idx, { end: { y, m } });
                        }}
                        className="onb-input" style={{ flex: 1 }}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: T.textLight, marginBottom: 4 }}>목표 체크리스트</div>
                    {(p.goals || []).map((g, gIdx) => (
                      <div key={gIdx} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        <input
                          className="onb-input"
                          value={g}
                          onChange={(e) => {
                            const goals = [...(p.goals || [])];
                            goals[gIdx] = e.target.value;
                            updateCustomPhase(idx, { goals });
                          }}
                          placeholder="예: 비상금 통장 개설"
                          style={{ flex: 1, fontSize: 12, padding: "6px 10px" }}
                        />
                        <button
                          onClick={() => {
                            const goals = (p.goals || []).filter((_, i) => i !== gIdx);
                            updateCustomPhase(idx, { goals });
                          }}
                          style={{ background: "transparent", border: "none", color: T.textLight, cursor: "pointer", fontSize: 14, padding: "0 6px" }}
                        >×</button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const goals = [...(p.goals || []), ""];
                        updateCustomPhase(idx, { goals });
                      }}
                      style={{
                        background: "transparent", border: "none",
                        color: T.accent, fontSize: 11, fontWeight: 600,
                        cursor: "pointer", padding: "4px 0"
                      }}
                    >+ 목표 추가</button>
                  </div>
                ))}
                <button
                  onClick={addCustomPhase}
                  style={{
                    background: "transparent", border: `1.5px dashed ${T.accent}`,
                    color: T.accent, borderRadius: 10, padding: 10,
                    cursor: "pointer", fontSize: 13, fontWeight: 700
                  }}
                >+ Phase 추가</button>
              </div>
            )}
          </div>
        )}

        {/* Step 5: 부채 */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, padding: 14,
              background: data.debtEnabled ? T.accentBg : T.cardBg,
              borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${data.debtEnabled ? T.accent : T.border}`
            }}>
              <input
                type="checkbox"
                checked={data.debtEnabled}
                onChange={(e) => set({ debtEnabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: T.accent }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>부채/대출 있음</div>
                <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>
                  마이너스통장·학자금·전세자금대출 등. 체크 안 하면 관련 UI 전체 숨김.
                </div>
              </div>
            </label>
            {data.debtEnabled && (
              <>
                {data.debtItems.map((x) => (
                  <div key={x.id} style={{ background: T.accentBg, borderRadius: 10, padding: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <input
                        className="onb-input"
                        value={x.name}
                        onChange={(e) => updateDebtItem(x.id, { name: e.target.value })}
                        placeholder="이름 (예: 마이너스통장)"
                        style={{ flex: 1 }}
                      />
                      <button
                        onClick={() => removeDebtItem(x.id)}
                        style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}
                      >×</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: T.textLight, marginBottom: 2 }}>총액</div>
                        <NumberField
                          value={x.total}
                          onChange={(v) => updateDebtItem(x.id, { total: v })}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: T.textLight, marginBottom: 2 }}>월 상환액</div>
                        <NumberField
                          value={x.monthly}
                          onChange={(v) => updateDebtItem(x.id, { monthly: v })}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.textLight, marginBottom: 2 }}>상환일</div>
                        <input
                          type="number"
                          min={1} max={31}
                          className="onb-input"
                          value={x.dueDay}
                          onChange={(e) => updateDebtItem(x.id, { dueDay: e.target.value })}
                          style={{ width: 60 }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addDebtItem}
                  style={{
                    background: "transparent", border: `1.5px dashed ${T.accent}`,
                    color: T.accent, borderRadius: 10, padding: 10,
                    cursor: "pointer", fontSize: 13, fontWeight: 700
                  }}
                >+ 부채 항목 추가</button>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 28, justifyContent: "space-between" }}>
          <button
            onClick={prev}
            disabled={step === 0}
            style={{
              background: "#F3F4F6", color: T.textMid, border: "none",
              borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600,
              cursor: step === 0 ? "default" : "pointer",
              opacity: step === 0 ? 0.4 : 1
            }}
          >← 이전</button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              disabled={!stepValid}
              style={{
                background: T.accent, color: "#fff", border: "none",
                borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700,
                cursor: stepValid ? "pointer" : "default",
                opacity: stepValid ? 1 : 0.5
              }}
            >다음 →</button>
          ) : (
            <button
              onClick={finish}
              disabled={!stepValid}
              style={{
                background: T.accent, color: "#fff", border: "none",
                borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 700,
                cursor: stepValid ? "pointer" : "default",
                opacity: stepValid ? 1 : 0.5
              }}
            >완료 · 시작하기</button>
          )}
        </div>
      </div>

      <style>{`
        .onb-input {
          border: 1px solid ${T.border}; border-radius: 8px;
          padding: 10px 12px; font-size: 14px; color: ${T.text};
          background: #fff; outline: none; font-family: inherit;
          transition: border-color 0.15s;
        }
        .onb-input:focus { border-color: ${T.accent}; }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children, T }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 4 }}>
        {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: 10, color: T.textLight, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

// 콤마 포맷 + 한글 단위 표시 숫자 입력
function NumberField({ value, onChange, style, ...rest }) {
  const raw = value === "" || value == null ? "" : String(value).replace(/[^0-9]/g, "");
  const display = raw === "" ? "" : Number(raw).toLocaleString();
  const korean = raw === "" ? "" : formatKorean(Number(raw));
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", ...(style?.container || {}) }}>
      <input
        type="text"
        inputMode="numeric"
        className="onb-input"
        value={display}
        onChange={(e) => {
          const stripped = e.target.value.replace(/[^0-9]/g, "");
          onChange(stripped);
        }}
        style={{ ...style }}
        {...rest}
      />
      {korean && (
        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3, paddingLeft: 4 }}>
          ≈ {korean}
        </div>
      )}
    </div>
  );
}

function formatKorean(n) {
  if (!n || isNaN(n)) return "";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
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
