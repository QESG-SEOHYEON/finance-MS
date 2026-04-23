const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  cream: "#FAF5F3",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3"
};

export default function MentorTab() {
  return (
    <div className="card" style={{
      padding: "48px 24px", textAlign: "center",
      background: "linear-gradient(135deg, #FFF5F3 0%, #FFF0EC 100%)",
      border: `1px solid ${R.rose300}`
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: R.textDark, marginBottom: 6 }}>
        경제 멘토 준비 중
      </div>
      <div style={{ fontSize: 13, color: R.textMid, lineHeight: 1.6 }}>
        원하는 인물을 멘토로 설정하고<br />
        조언 듣기 · 수다 떨기 · 호감도 쌓기를 할 수 있는 공간이 곧 열립니다.
      </div>
    </div>
  );
}
