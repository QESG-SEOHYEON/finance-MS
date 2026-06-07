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
    title: "✨ 큰 업데이트가 있어요!",
    body: "다음 → 으로 천천히 둘러보세요.",
    image: null,
    accent: R.rose400
  },
  {
    title: "💰 순자산 자동 계산",
    body:
      '1. 카테고리에 "자산 종류"를 태그하면 자동 계산돼요.\n' +
      "2. 헷갈리면 ℹ️ 가이드 버튼를 누르세요.\n" +
      "(어떤 자산 종류가 있는지 나와있음)",
    image: "./whats-new/02-net-worth.png",
    accent: R.mint
  },
  {
    title: "📈 차트 스타일 리뉴얼",
    body:
      "1. 마우스 휠로 차트를 부드럽게 이동해보세요.\n" +
      "• 줌인 = 일 / 월 / 연 단위 자동 전환\n" +
      "• 더블클릭 = 설정 리셋\n" +
      "• 좌상단에 실시간 값 표시" +
      "2. 카테고리 탭과 수입/자산 탭으로 차트를 나눴어요. 이제 테마별로 추이를 확인해보세요.\n" ,
    image: "./whats-new/03-trend-chart.png",
    accent: R.lavender
  },
  {
    title: "📅 반복일정 통합",
    body:
      "(구 반복지출 → 반복일정)\n" +
      "매월 / 매주 / 격주 모두 지원.\n" +
      "카테고리 선택하면 자산 종류 자동 적용.",
    image: "./whats-new/04-recurring.png",
    accent: R.rose400
  },
  {
    title: "🍽️ 캘린더 + 지출 통합",
    body:
      '카테고리에 "캘린더에 표시" 체크하면\n' +
      "그 기록이 캘린더에 점선 박스로 떠요.",
    image: "./whats-new/06-orphan-banner.png",
    accent: R.mint
  },
  {
    title: "🪄 데이터 기록 백업 및 복원",
    body:
      "옛날 기록이 안 보이면\n" +
      "대시보드 상단 🪄 배너 클릭!\n" +
      "한 번에 복원하거나 정리할 수 있어요.",
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
