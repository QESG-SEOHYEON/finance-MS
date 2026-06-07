import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  getNetWorth, getInitialLiquid, setInitialLiquid,
  markAssetSetupDone, updateCustomCategoryImpacts,
  db
} from "../db.js";
import AssetTypeGuideModal, { ASSET_TYPE_GUIDE, AssetTypeHelpButton } from "./AssetTypeGuide.jsx";
import { fmt } from "../schedule.js";
import MoneyInput from "./MoneyInput.jsx";

const R = {
  rose300: "#D4A0A0", rose400: "#C08080", rose500: "#A66060",
  mint: "#6BAF8D", lavender: "#9B7EC0",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", border: "#EDE5E2", accentLight: "#FFE0E8"
};

// 카테고리 이름 기반 자동 추천 (휴리스틱)
function suggestImpact(label) {
  const s = String(label || "").toLowerCase();
  if (/예적금|예금|적금|cma|비상금|입출금|파킹|현금/i.test(s)) return "liquid_asset";
  if (/투자|etf|주식|펀드|코인|연금|전세|isa/i.test(s)) return "locked_asset";
  if (/대출|마통|상환|카드대출|학자금/i.test(s)) return "debt_down";
  if (/월급|수입|급여|부수입|용돈|환급|이자수입/i.test(s)) return "income";
  if (/이체|환전/i.test(s)) return "neutral";
  return "expense";
}

const IMPACT_OPTIONS = [
  { v: "income",       label: "💰 수입" },
  { v: "liquid_asset", label: "💧 현금" },
  { v: "locked_asset", label: "🔒 투자" },
  { v: "debt_down",    label: "⚡ 부채↓" },
  { v: "expense",      label: "🔴 지출" },
  { v: "neutral",      label: "⚪ 중립" }
];

export default function AssetSetupWizard({ onClose }) {
  const [step, setStep] = useState(1);

  // Step 1: 초기 자산 분리
  const [netWorth, setNW] = useState(0);
  const [cash, setCash] = useState("");
  const [invest, setInvest] = useState("");
  const [step1Mode, setStep1Mode] = useState("auto"); // 'auto' | 'manual'

  // Step 2: 카테고리 태깅
  const [pendingCats, setPendingCats] = useState([]);
  const [picks, setPicks] = useState({}); // { catKey: nwImpact }
  const [step2Mode, setStep2Mode] = useState("auto"); // 'auto' | 'manual'
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    (async () => {
      const nw = (await getNetWorth()) || 0;
      const il = (await getInitialLiquid()) || 0;
      setNW(nw);
      setCash(String(il));
      setInvest(String(Math.max(0, nw - il)));

      const cats = await db.settings.get("custom-categories");
      const list = Array.isArray(cats?.value) ? cats.value : [];
      const untagged = list.filter((c) => !c.nwImpact || c.nwImpact === "expense");
      setPendingCats(untagged);
      const initialPicks = {};
      untagged.forEach((c) => { initialPicks[c.key] = suggestImpact(c.label); });
      setPicks(initialPicks);
    })();
  }, []);

  const cashN = Number(cash) || 0;
  const investN = Number(invest) || 0;
  const sum = cashN + investN;
  const diff = sum - netWorth;
  const sumColor = Math.abs(diff) < 10000 ? R.mint : Math.abs(diff) < 100000 ? "#C0A07E" : R.rose500;

  const finishStep1 = async () => {
    let liquidValue;
    if (step1Mode === "auto") {
      liquidValue = (await getInitialLiquid()) || 0;
      // 자동: 기존 initialLiquid 그대로 유지, 부족하면 0
    } else {
      liquidValue = cashN;
    }
    await setInitialLiquid(liquidValue);
    if (pendingCats.length === 0) {
      await markAssetSetupDone();
      onClose();
    } else {
      setStep(2);
    }
  };

  const finishStep2 = async () => {
    if (step2Mode === "auto") {
      // 추천값 그대로 적용
      await updateCustomCategoryImpacts(picks);
    } else {
      // 사용자가 골랐던 picks 그대로
      await updateCustomCategoryImpacts(picks);
    }
    await markAssetSetupDone();
    onClose();
  };

  const skipAll = async () => {
    // 모두 기본값. initialLiquid는 그대로, 카테고리는 expense 유지.
    await markAssetSetupDone();
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" style={{ zIndex: 900 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <StepDot n={1} active={step === 1} done={step > 1} />
          <StepDot n={2} active={step === 2} done={false} disabled={pendingCats.length === 0} />
        </div>

        {step === 1 && (
          <>
            <div className="modal-title">💰 1/2 · 초기 자산 분리</div>
            <div className="modal-sub">
              지금까지 입력한 순자산 <strong style={{ color: R.rose500 }}>{fmt(netWorth)}</strong> 원을<br/>
              현금과 투자로 나눠두면 자동 계산이 더 정확해져요.
            </div>

            <ModeToggle mode={step1Mode} setMode={setStep1Mode} />

            {step1Mode === "auto" ? (
              <div style={{
                padding: "12px 14px", borderRadius: 10, background: R.cream,
                border: `1px solid ${R.border}`, fontSize: 12, color: R.textMid, lineHeight: 1.6
              }}>
                🤖 <strong>자동 적용</strong>: 현재 저장된 값({fmt((cashN))} 원)을 현금으로, 나머지를 모두 투자로 분류해요.
                나중에 대시보드에서 ✏️ 클릭해서 언제든 수정 가능해요.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Field label="💰 현금 (지금 쓸 수 있는 돈)" hint="비상금·자유입출금·CMA">
                  <MoneyInput type="text"  className="modal-input" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="예: 3000000" />
                </Field>
                <Field label="📈 투자 (묶여있는 돈)" hint="ETF·주식·정기적금·전세금">
                  <MoneyInput type="text"  className="modal-input" value={invest} onChange={(e) => setInvest(e.target.value)} placeholder="예: 7000000" />
                </Field>
                <div style={{
                  padding: "8px 10px", borderRadius: 8, fontSize: 11,
                  background: R.cream, border: `1px solid ${R.border}`,
                  display: "flex", justifyContent: "space-between"
                }}>
                  <span style={{ color: R.textMid }}>합계 {fmt(sum)} 원</span>
                  <span style={{ color: sumColor, fontWeight: 700 }}>
                    {diff === 0 ? "✓ 일치" : `${diff > 0 ? "+" : ""}${fmt(diff)}원 차이`}
                  </span>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-sm" onClick={skipAll}>모두 나중에</button>
              <button className="btn btn-primary btn-sm" onClick={finishStep1}>
                {pendingCats.length === 0 ? "완료" : "다음 →"}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>🏷 2/2 · 카테고리 자산 종류</span>
              <AssetTypeHelpButton onClick={() => setShowGuide(true)} />
            </div>
            <div className="modal-sub">
              직접 만든 카테고리 <strong style={{ color: R.rose500 }}>{pendingCats.length}개</strong>의 자산 종류를 정해주세요.
            </div>

            <ModeToggle mode={step2Mode} setMode={setStep2Mode} />

            {step2Mode === "auto" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{
                  padding: "10px 12px", borderRadius: 10, background: R.cream,
                  border: `1px solid ${R.border}`, fontSize: 12, color: R.textMid, lineHeight: 1.6
                }}>
                  🤖 카테고리 이름으로 추측한 추천값이에요. 마음에 안 들면 "직접 설정"으로 전환.
                </div>
                {pendingCats.map((c) => {
                  const guide = ASSET_TYPE_GUIDE.find((g) => g.v === picks[c.key]);
                  return (
                    <div key={c.key} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", borderRadius: 8,
                      background: "#fff", border: `1px solid ${R.border}`
                    }}>
                      <span style={{ fontSize: 16 }}>{c.icon}</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: R.textDark }}>{c.label}</span>
                      <span style={{ fontSize: 11, color: R.rose500, fontWeight: 700 }}>
                        → {guide?.label || "🔴 지출"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingCats.map((c) => (
                  <div key={c.key} style={{
                    padding: "10px 12px", borderRadius: 10,
                    background: R.cream, border: `1px solid ${R.border}`
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark, marginBottom: 6 }}>
                      {c.icon} {c.label}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                      {IMPACT_OPTIONS.map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setPicks({ ...picks, [c.key]: o.v })}
                          style={{
                            padding: "6px 4px",
                            background: picks[c.key] === o.v ? R.accentLight : "#fff",
                            border: `1px solid ${picks[c.key] === o.v ? R.rose400 : R.border}`,
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: picks[c.key] === o.v ? 700 : 500,
                            color: picks[c.key] === o.v ? R.rose500 : R.textMid,
                            cursor: "pointer", fontFamily: "inherit"
                          }}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-sm" onClick={() => setStep(1)}>← 이전</button>
              <button className="btn btn-primary btn-sm" onClick={finishStep2}>적용</button>
            </div>
          </>
        )}
        {showGuide && <AssetTypeGuideModal onClose={() => setShowGuide(false)} />}
      </div>
    </div>,
    document.body
  );
}

function StepDot({ n, active, done, disabled }) {
  return (
    <div style={{
      flex: 1, height: 4, borderRadius: 2,
      background: active ? R.rose400 : done ? R.mint : disabled ? R.border : R.border,
      opacity: disabled ? 0.5 : 1
    }} />
  );
}

function ModeToggle({ mode, setMode }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setMode("auto")}
        style={modeBtn(mode === "auto")}
      >🤖 자동 추천</button>
      <button
        type="button"
        onClick={() => setMode("manual")}
        style={modeBtn(mode === "manual")}
      >✋ 직접 설정</button>
    </div>
  );
}

function modeBtn(active) {
  return {
    flex: 1, padding: "8px 10px", borderRadius: 8,
    background: active ? R.rose400 : "#fff",
    color: active ? "#fff" : R.textMid,
    border: `1px solid ${active ? R.rose400 : R.border}`,
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
  };
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: R.textMid, marginBottom: 3 }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: R.textLight, marginBottom: 4 }}>{hint}</div>}
      {children}
    </div>
  );
}
