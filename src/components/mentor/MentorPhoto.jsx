export default function MentorPhoto({ src, size = 64, fallbackColor = "#C08080" }) {
  if (src) {
    return (
      <img
        src={src}
        alt="mentor"
        style={{
          width: size, height: size, borderRadius: Math.round(size / 5),
          objectFit: "cover", flexShrink: 0,
          border: `2px solid ${fallbackColor}`,
          background: "#fff"
        }}
        onError={(e) => { e.target.style.display = "none"; }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: Math.round(size / 5),
        background: `linear-gradient(135deg, ${fallbackColor}, #D4A0A0)`,
        color: "#fff", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.45)
      }}
    >💭</div>
  );
}
