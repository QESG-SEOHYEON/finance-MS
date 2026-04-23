import { detailedHearts } from "../../lib/mentor.js";

const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  rose600: "#8B4F4F",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  cream: "#FAF5F3",
  border: "#EDE5E2"
};

export default function AffinityModal({ mentor, onClose }) {
  const a = mentor?.affinity || 0;
  const { full, half, empty } = detailedHearts(a);
  const isMax = a >= 10;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-title">💖 호감도</div>
        <div className="modal-sub">
          {mentor?.nickname || mentor?.name || "멘토"} 와의 친밀도
        </div>

        <div style={{
          padding: "24px 16px", textAlign: "center",
          background: "linear-gradient(135deg, #FFF5F3 0%, #FFF0EC 100%)",
          borderRadius: 14, marginBottom: 16,
          border: `1px solid ${R.rose300}`
        }}>
          <div style={{
            fontSize: 40, fontWeight: 800, color: R.rose500, letterSpacing: -1,
            animation: isMax ? "heartGlow 2s ease-in-out infinite" : "none"
          }}>
            {a.toFixed(1)} <span style={{ fontSize: 18, color: R.textLight, fontWeight: 500 }}>/ 10</span>
          </div>

          {/* 10 하트 row */}
          <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 12, fontSize: 20 }}>
            {Array(full).fill("❤️").map((h, i) => <span key={`f${i}`}>{h}</span>)}
            {half > 0 && (
              <span style={{ position: "relative", display: "inline-block", width: "1em" }}>
                <span style={{ position: "absolute", inset: 0, color: "#E5DCD8" }}>🤍</span>
                <span style={{ position: "absolute", inset: 0, clipPath: "inset(0 50% 0 0)" }}>❤️</span>
              </span>
            )}
            {Array(empty).fill("🤍").map((h, i) => <span key={`e${i}`}>{h}</span>)}
          </div>

          {isMax && (
            <div style={{ fontSize: 11, color: R.rose600, marginTop: 12, fontWeight: 700 }}>
              ✨ 소울메이트 단계에 도달했어 ✨
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: R.textMid, lineHeight: 1.6, padding: "0 4px" }}>
          <div>• 조언 듣기: 하루 3회 · 1회마다 +0.1</div>
          <div>• 수다 떨기: 하루 1회 · 최대 +0.3</div>
          <div>• 자정마다 횟수 리셋됩니다</div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>닫기</button>
        </div>

        <style>{`
          @keyframes heartGlow {
            0%, 100% { text-shadow: 0 0 8px rgba(192,80,80,0.4); }
            50% { text-shadow: 0 0 20px rgba(192,80,80,0.9); }
          }
        `}</style>
      </div>
    </div>
  );
}
