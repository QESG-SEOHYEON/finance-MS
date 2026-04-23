import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { updateMentor, getMentorHistory } from "../../db.js";
import { applyTokens } from "../../lib/mentor.js";

const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  cream: "#FAF5F3",
  border: "#EDE5E2",
  mint: "#6BAF8D",
  over: "#C06060"
};

const TABS = [
  { key: "profile", label: "프로필" },
  { key: "photos", label: "사진" },
  { key: "history", label: "히스토리" }
];

async function resizeImageToBase64(file, maxSize = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SettingsModal({ mentor, tokens, onClose }) {
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(mentor?.name || "");
  const [nickname, setNickname] = useState(mentor?.nickname || "");
  const [showPhoto, setShowPhoto] = useState(mentor?.showPhoto ?? true);
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const photos = mentor?.photos || [];

  const saveProfile = async () => {
    await updateMentor({
      name: name.trim(),
      nickname: nickname.trim(),
      showPhoto
    });
  };

  const onUploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeImageToBase64(file);
      await updateMentor({ photos: [...photos, dataUrl] });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const addUrl = async () => {
    if (!urlDraft.trim()) return;
    await updateMentor({ photos: [...photos, urlDraft.trim()] });
    setUrlDraft("");
  };

  const removePhoto = async (idx) => {
    const next = photos.filter((_, i) => i !== idx);
    await updateMentor({ photos: next });
  };

  const movePhoto = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[idx], next[j]] = [next[j], next[idx]];
    await updateMentor({ photos: next });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-title">⚙️ 멘토 설정</div>

        <div style={{ display: "flex", gap: 4, background: R.cream, borderRadius: 10, padding: 4, marginBottom: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 6,
                border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                background: tab === t.key ? "#fff" : "transparent",
                color: tab === t.key ? R.textDark : R.textMid,
                boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
              }}
            >{t.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          {tab === "profile" && (
            <ProfileTab
              name={name} setName={setName}
              nickname={nickname} setNickname={setNickname}
              showPhoto={showPhoto} setShowPhoto={setShowPhoto}
              onSave={saveProfile}
            />
          )}
          {tab === "photos" && (
            <PhotosTab
              photos={photos}
              uploading={uploading}
              urlDraft={urlDraft}
              setUrlDraft={setUrlDraft}
              onUploadFile={onUploadFile}
              addUrl={addUrl}
              removePhoto={removePhoto}
              movePhoto={movePhoto}
            />
          )}
          {tab === "history" && (
            <HistoryTab tokens={tokens} />
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={async () => { await saveProfile(); onClose(); }}>저장하고 닫기</button>
          <button className="btn btn-sm" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ name, setName, nickname, setNickname, showPhoto, setShowPhoto }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label="본명" hint="사진 하단·히스토리에 표시됨">
        <input
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 준호"
        />
      </Field>
      <Field label="별명" hint={`대화 중 {MENTOR} 토큰이 이 이름으로 치환됨`}>
        <input
          className="modal-input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="비우면 본명 사용"
        />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: R.cream, borderRadius: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={showPhoto} onChange={(e) => setShowPhoto(e.target.checked)} />
        <span style={{ fontSize: 13, fontWeight: 600, color: R.textDark }}>사진 표시</span>
        <span style={{ fontSize: 10, color: R.textLight, marginLeft: "auto" }}>
          {showPhoto ? "ON" : "OFF (기본 일러스트)"}
        </span>
      </label>
    </div>
  );
}

function PhotosTab({ photos, uploading, urlDraft, setUrlDraft, onUploadFile, addUrl, removePhoto, movePhoto }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: R.textMid, lineHeight: 1.5, padding: "8px 10px", background: R.cream, borderRadius: 8 }}>
        여러 장 등록하면 하루 단위로 랜덤 로테이션됩니다. 파일 업로드는 512×512로 자동 리사이즈·압축.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <label style={{
          padding: "8px 12px", background: "#fff", border: `1.5px solid ${R.rose400}`,
          borderRadius: 8, cursor: "pointer", color: R.rose500, fontSize: 12, fontWeight: 700
        }}>
          📁 파일 업로드
          <input type="file" accept="image/*" onChange={onUploadFile} style={{ display: "none" }} disabled={uploading} />
        </label>
        <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 200 }}>
          <input
            className="modal-input"
            placeholder="이미지 URL"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addUrl(); }}
            style={{ flex: 1, padding: "8px 10px", fontSize: 13 }}
          />
          <button className="btn btn-sm" onClick={addUrl}>추가</button>
        </div>
      </div>

      {uploading && <div style={{ fontSize: 11, color: R.textMid }}>업로드 중...</div>}

      {photos.length === 0 ? (
        <div style={{ fontSize: 12, color: R.textLight, padding: "24px 0", textAlign: "center" }}>
          등록된 사진이 없습니다.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
          {photos.map((src, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={src} alt="" style={{
                width: "100%", aspectRatio: "1/1", objectFit: "cover",
                borderRadius: 10, border: `1px solid ${R.border}`
              }} onError={(e) => { e.target.style.background = R.cream; }} />
              <div style={{
                position: "absolute", top: 4, right: 4, display: "flex", gap: 2
              }}>
                <button
                  onClick={() => movePhoto(i, -1)}
                  disabled={i === 0}
                  style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "rgba(255,255,255,0.9)", cursor: i === 0 ? "not-allowed" : "pointer", fontSize: 10, opacity: i === 0 ? 0.4 : 1 }}
                  title="앞으로"
                >‹</button>
                <button
                  onClick={() => movePhoto(i, 1)}
                  disabled={i === photos.length - 1}
                  style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "rgba(255,255,255,0.9)", cursor: i === photos.length - 1 ? "not-allowed" : "pointer", fontSize: 10, opacity: i === photos.length - 1 ? 0.4 : 1 }}
                  title="뒤로"
                >›</button>
              </div>
              <button
                onClick={() => removePhoto(i)}
                style={{
                  position: "absolute", bottom: 4, right: 4,
                  width: 22, height: 22, borderRadius: 4, border: "none",
                  background: R.over, color: "#fff", cursor: "pointer", fontSize: 11
                }}
                title="삭제"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ tokens }) {
  const history = useLiveQuery(() => getMentorHistory({ limit: 100 }), [], []);
  if (!history || history.length === 0) {
    return (
      <div style={{ fontSize: 13, color: R.textLight, padding: "32px 0", textAlign: "center" }}>
        아직 대화 기록이 없어요.<br />조언 듣기 · 수다 떨기를 시작해보세요.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {history.map((h) => {
        const delta = h.affinityChange || 0;
        const deltaColor = delta > 0 ? R.mint : delta < 0 ? R.over : R.textLight;
        return (
          <div key={h.id} style={{
            padding: 10, borderRadius: 10, background: "#fff", border: `1px solid ${R.border}`
          }}>
            <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: h.type === "advice" ? R.rose400 : R.mint, padding: "2px 6px", borderRadius: 4 }}>
                {h.type === "advice" ? "💡 조언" : "💬 수다"}
              </span>
              <span style={{ fontSize: 10, color: R.textLight }}>
                {new Date(h.timestamp).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ fontSize: 10, color: deltaColor, fontWeight: 700, marginLeft: "auto" }}>
                호감도 {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
              </span>
            </div>
            {h.type === "chat" && h.question && (
              <div style={{ fontSize: 11, color: R.textMid, fontStyle: "italic", marginBottom: 4 }}>
                Q: {applyTokens(h.question, tokens)}
              </div>
            )}
            {h.type === "chat" && h.userChoice && (
              <div style={{ fontSize: 11, color: R.textLight, marginBottom: 4 }}>
                → {applyTokens(h.userChoice, tokens)}
              </div>
            )}
            <div style={{ fontSize: 12, color: R.textDark, lineHeight: 1.5 }}>
              {applyTokens(h.content, tokens)}
            </div>
            {h.author && (
              <div style={{ fontSize: 10, color: R.textLight, marginTop: 4 }}>
                — {h.author}{h.category ? ` · ${h.category}` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: R.textMid, marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: R.textLight, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
