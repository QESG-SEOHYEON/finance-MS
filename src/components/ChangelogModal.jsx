export default function ChangelogModal({ entries, onClose }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-title">✨ 업데이트 알림</div>
        <div className="modal-sub">
          {entries.length === 1
            ? "새 기능이 추가되었습니다."
            : `${entries.length}개의 업데이트가 있습니다.`}
        </div>

        <div style={{
          display: "flex", flexDirection: "column", gap: 14,
          maxHeight: "60vh", overflowY: "auto",
          padding: "4px 2px"
        }}>
          {entries.map((e) => (
            <div
              key={e.version}
              style={{
                background: "#FFF8F5",
                border: "1px solid #EDE5E2",
                borderRadius: 12,
                padding: 14
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#4A3535" }}>{e.title}</div>
                <div style={{ fontSize: 10, color: "#B8A9A3" }}>{e.date}</div>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#7A6060", lineHeight: 1.7 }}>
                {(e.items || []).map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}
