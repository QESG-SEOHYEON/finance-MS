import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { setUserProfile } from "../db.js";

const DEFAULTS = [
  { id: "cat-black",  src: "./avatars/cat-black.jpeg",  label: "검정 고양이" },
  { id: "cat-calico", src: "./avatars/cat-calico.jpeg", label: "삼색 고양이" },
  { id: "cat-white",  src: "./avatars/cat-white.png",   label: "흰 고양이" }
];

const ROSE = {
  border: "#EDE5E2",
  accent: "#C08080",
  accentLight: "#FFE0E8",
  text: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  cream: "#FAF5F3"
};

const MAX_BYTES = 800 * 1024; // 800KB 한도 (data URL로 들고 있으니 과하게 크면 X)

export default function AvatarPickerModal({ initial, onClose, onSaved }) {
  const [selected, setSelected] = useState(initial || DEFAULTS[0].src);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const pickFile = () => fileRef.current?.click();

  const onFile = (e) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 가능해요.");
      return;
    }
    if (file.size > MAX_BYTES * 4) {
      setError("파일이 너무 큼 (3MB 미만 권장)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSelected(String(reader.result));
    reader.onerror = () => setError("파일을 읽지 못했어요.");
    reader.readAsDataURL(file);
  };

  const save = async () => {
    await setUserProfile({ image: selected });
    onSaved?.(selected);
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-title">프로필 사진 변경</div>
        <div className="modal-sub">
          기본 아이콘 중에서 고르거나 직접 업로드 — 정사각형 200×200~400×400 px 권장
        </div>

        {/* 미리보기 */}
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 16px" }}>
          <div style={{
            width: 96, height: 96, borderRadius: 20,
            background: ROSE.cream,
            border: `2px solid ${ROSE.accent}`,
            overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 12px ${ROSE.accent}33`
          }}>
            {selected ? (
              <img src={selected} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: ROSE.textLight, fontSize: 12 }}>선택 안 함</span>
            )}
          </div>
        </div>

        {/* 기본 아이콘 */}
        <div style={{ fontSize: 12, fontWeight: 700, color: ROSE.textMid, marginBottom: 6 }}>
          기본 아이콘
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
          {DEFAULTS.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.src)}
              style={{
                padding: 4,
                background: selected === d.src ? ROSE.accentLight : "#fff",
                border: `2px solid ${selected === d.src ? ROSE.accent : ROSE.border}`,
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}
              title={d.label}
            >
              <img
                src={d.src}
                alt={d.label}
                style={{
                  width: 72, height: 72, borderRadius: 8,
                  objectFit: "cover", display: "block"
                }}
              />
            </button>
          ))}
        </div>

        {/* 직접 업로드 */}
        <div style={{ fontSize: 12, fontWeight: 700, color: ROSE.textMid, marginBottom: 6 }}>
          내 사진 업로드
        </div>
        <button
          onClick={pickFile}
          style={{
            width: "100%", padding: "10px 12px",
            background: "#fff",
            border: `1px dashed ${ROSE.accent}`,
            borderRadius: 10,
            color: ROSE.accent, fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit"
          }}
        >
          📷 파일 선택 (JPG / PNG / GIF · 3MB 미만)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          style={{ display: "none" }}
        />
        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#C04848" }}>{error}</div>
        )}

        <div className="modal-actions">
          <button className="btn btn-sm" onClick={onClose}>취소</button>
          <button className="btn btn-primary btn-sm" onClick={save}>저장</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
