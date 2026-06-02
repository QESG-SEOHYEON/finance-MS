import { useState } from "react";

const R = {
  rose50: "#FFF5F5",
  rose100: "#FCEAEA",
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  cream: "#FAF5F3",
  border: "#EDE5E2",
  textDark: "#4A3535",
  textMid: "#7A6060"
};

// streak: 오늘 도장 찍기 직전 시점에서 어제까지 이어온 연속 일수
// hasPrior: 이전에 출석한 기록이 한 번이라도 있는지 (오늘 제외)
// → 오늘 도장을 찍으면 upcoming = streak + 1 일째가 됨.
function streakMessage(upcoming, hasPrior) {
  if (upcoming === 1) {
    return hasPrior
      ? { title: "괜찮아요. 다시 앞으로 나아가봐요.", sub: "오늘부터 다시 꾸준히 발자국을 쌓아봐요." }
      : { title: "첫 걸음이 중요해요.", sub: "도장을 찍고 캘린더에 발자국을 남겨봐요." };
  }
  if (upcoming <= 7) {
    return { title: "꾸준함이 좋은 경제습관을 길러요.", sub: `오늘 ${upcoming}일째 출석! 흐름을 이어가봐요.` };
  }
  return { title: "이런 꾸준함이라면, 이미 당신은 자산관리의 고수!", sub: `${upcoming}일째 연속 출석 🌸` };
}

export default function AttendanceModal({ onStamp, onClose, streak = 0, hasPrior = false }) {
  const [stamped, setStamped] = useState(false);
  const [stamping, setStamping] = useState(false);

  const upcoming = streak + 1;
  const msg = streakMessage(upcoming, hasPrior);

  const handleStamp = async () => {
    if (stamping || stamped) return;
    setStamping(true);
    await onStamp();
    setStamped(true);
    setStamping(false);
  };

  return (
    <div className="modal-backdrop" onClick={stamped ? onClose : undefined}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 340, textAlign: "center",
          background: `linear-gradient(180deg, ${R.rose50} 0%, #FFFDFD 100%)`,
          border: `1px solid ${R.rose100}`
        }}
      >
        <div
          style={{
            fontSize: 72, lineHeight: 1, margin: "8px 0 6px",
            transform: stamped ? "scale(1.05)" : "scale(1)",
            transition: "transform 0.3s ease-out",
            filter: stamped ? "none" : "grayscale(0.4) opacity(0.55)"
          }}
        >
          🐾
        </div>

        <div className="modal-title" style={{ color: R.textDark, fontSize: 17 }}>
          {stamped ? "오늘의 출석체크 완료!" : msg.title}
        </div>
        <div className="modal-sub" style={{ marginBottom: 18, color: R.textMid }}>
          {stamped ? `오늘로 ${upcoming}일째 ${upcoming >= 8 ? "🔥" : "🌸"}` : msg.sub}
        </div>

        {!stamped && streak > 0 && (
          <div
            style={{
              display: "inline-block", margin: "0 auto 14px",
              padding: "6px 12px", borderRadius: 999,
              background: R.rose100, color: R.rose500,
              fontSize: 12, fontWeight: 700
            }}
          >
            🔥 어제까지 연속 {streak}일
          </div>
        )}

        {!stamped ? (
          <button
            onClick={handleStamp}
            disabled={stamping}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12,
              background: R.rose400, color: "#fff",
              border: "none", fontSize: 14, fontWeight: 700,
              cursor: stamping ? "wait" : "pointer",
              boxShadow: `0 4px 12px ${R.rose300}40`,
              transition: "all 0.15s",
              fontFamily: "inherit"
            }}
          >
            🐾 도장 찍기
          </button>
        ) : (
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "10px 16px", borderRadius: 12,
              background: "transparent", color: R.rose500,
              border: `1px solid ${R.rose300}`, fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit"
            }}
          >
            확인
          </button>
        )}
      </div>
    </div>
  );
}
