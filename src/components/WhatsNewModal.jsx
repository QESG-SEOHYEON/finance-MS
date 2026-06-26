import { useState } from "react";
import { createPortal } from "react-dom";

const R = {
  rose50: "#FFF5F5", rose100: "#FCEAEA", rose200: "#F0D5D5",
  rose300: "#D4A0A0", rose400: "#C08080", rose500: "#A66060", rose600: "#8B4F4F",
  mint: "#6BAF8D", mintLight: "#E8F5EE",
  lavender: "#9B7EC0",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", creamDark: "#F0EBE8",
  border: "#EDE5E2"
};

const SLIDES = [
  {
    title: "✨ 업데이트 했어요!",
    body: "순자산이 더 똑똑해졌어요.\n다음 → 으로 둘러보세요.",
    image: null,
    accent: R.rose400
  },
  {
    title: "💰 순자산 = 현금 + 투자 − 부채",
    body:
      "순자산을 현금·투자·부채로 나눠서 봐요.\n" +
      "투자하면 현금이 투자로 옮겨가고,\n" +
      "빚 갚으면 현금·부채가 같이 줄어요.\n" +
      "탭에서 각각 확인해보세요.",
    image: null,
    accent: R.mint
  },
  {
    title: "🛠 부채 관리 (신규)",
    body:
      "대시보드 순자산 → 부채 탭에서\n" +
      "상환 날짜를 등록하고, 캘린더에서 확인해보세요.\n" +
      "완료 표시를 하면 자동으로 잔금이 계산돼요.",
    image: null,
    accent: R.lavender
  }
];

export default function WhatsNewModal({ onClose }) {
  const [step, setStep] = useState(0);
  const total = SLIDES.length;
  const slide = SLIDES[step];
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const next = () => {
    if (isLast) onClose();
    else setStep((s) => Math.min(total - 1, s + 1));
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 960 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460,
          maxHeight: "88vh",
          overflow: "auto",
          background: `linear-gradient(180deg, ${R.rose50} 0%, #FFFDFD 32%)`,
          padding: 0,
          borderRadius: 16
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: "16px 20px 8px",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div style={{ fontSize: 11, color: R.textLight, fontWeight: 700, letterSpacing: "0.5px" }}>
            UPDATE · {step + 1} / {total}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: "none", border: "none",
              color: R.textLight, fontSize: 18, cursor: "pointer",
              padding: "0 4px", lineHeight: 1
            }}
          >×</button>
        </div>

        {/* 타이틀 */}
        <div style={{ padding: "0 20px" }}>
          <div style={{
            fontSize: 18, fontWeight: 800, color: R.textDark,
            letterSpacing: "-0.3px", lineHeight: 1.35, marginBottom: 8
          }}>
            {slide.title}
          </div>
        </div>

        {/* 사진 (있을 때만) */}
        {slide.image && (
          <div style={{
            margin: "8px 20px 12px",
            borderRadius: 12,
            overflow: "hidden",
            border: `1px solid ${R.border}`,
            background: R.cream,
            maxHeight: 280,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <img
              src={slide.image}
              alt={slide.title}
              style={{
                maxWidth: "100%",
                maxHeight: 280,
                width: "auto",
                height: "auto",
                objectFit: "contain",
                display: "block"
              }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement.innerHTML =
                  `<div style="font-size:11px;color:${R.textLight};padding:24px;text-align:center">스크린샷 준비 중 📸</div>`;
              }}
            />
          </div>
        )}

        {/* 본문 */}
        <div style={{
          padding: slide.image ? "0 20px 8px" : "16px 20px 24px",
          minHeight: slide.image ? "auto" : 100
        }}>
          <div style={{
            fontSize: 13, color: R.textDark, lineHeight: 1.65,
            whiteSpace: "pre-line"
          }}>
            {slide.body}
          </div>
        </div>

        {/* 진행 점 */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 6,
          padding: "8px 20px"
        }}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`${i + 1}번 슬라이드로 이동`}
              style={{
                width: i === step ? 18 : 7, height: 7, borderRadius: 999,
                background: i === step ? slide.accent : R.border,
                border: "none", cursor: "pointer",
                padding: 0, transition: "all 0.2s ease"
              }}
            />
          ))}
        </div>

        {/* 액션 버튼 */}
        <div style={{
          display: "flex", gap: 8,
          padding: "12px 20px 18px"
        }}>
          <button
            onClick={prev}
            disabled={isFirst}
            style={{
              flex: "0 0 auto", padding: "10px 16px",
              background: "#fff", color: isFirst ? R.textLight : R.textMid,
              border: `1px solid ${R.border}`, borderRadius: 10,
              fontSize: 12, fontWeight: 700,
              cursor: isFirst ? "not-allowed" : "pointer",
              fontFamily: "inherit", opacity: isFirst ? 0.4 : 1
            }}
          >← 이전</button>
          <button
            onClick={next}
            style={{
              flex: 1, padding: "10px 16px",
              background: `linear-gradient(135deg, ${slide.accent}, ${R.rose500})`,
              color: "#fff", border: "none", borderRadius: 10,
              fontSize: 13, fontWeight: 800, cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: `0 3px 10px ${slide.accent}40`,
              letterSpacing: "-0.2px"
            }}
          >{isLast ? "✨ 둘러보기 시작!" : "다음 →"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
