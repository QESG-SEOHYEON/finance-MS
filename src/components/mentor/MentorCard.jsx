import { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getMentor, initMentor, adjustAffinity,
  getTodayMentorUsage, incMentorAdvice, markMentorChatUsed,
  addMentorHistory, getRecentAdviceIds, getRecentScenarioIds,
  getUserProfile, mergeProfile
} from "../../db.js";
import {
  loadAdvice, loadScenarios, pickExcluding,
  applyTokens, greeting, compactHearts,
  DAILY_ADVICE_LIMIT, ADVICE_AFFINITY
} from "../../lib/mentor.js";
import MentorPhoto from "./MentorPhoto.jsx";
import AffinityModal from "./AffinityModal.jsx";
import SettingsModal from "./SettingsModal.jsx";

const R = {
  rose300: "#D4A0A0",
  rose400: "#C08080",
  rose500: "#A66060",
  rose600: "#8B4F4F",
  mint: "#6BAF8D",
  cream: "#FAF5F3",
  border: "#EDE5E2",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3",
  warn: "#C0A07E"
};

export default function MentorCard({ variant = "compact" }) {
  const mentor = useLiveQuery(() => getMentor(), [], null);
  const daily = useLiveQuery(() => getTodayMentorUsage(), [], null);
  const dbProfile = useLiveQuery(() => getUserProfile(), [], null);
  const profile = mergeProfile(dbProfile);

  const [showAffinity, setShowAffinity] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [bubble, setBubble] = useState(null);
  // bubble = { kind: "advice" | "chat-q" | "chat-reply", content, meta... }
  const [chatScenario, setChatScenario] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  // 최초 렌더 시 멘토 row 없으면 초기화 (빈 상태)
  useEffect(() => {
    if (mentor === null) initMentor();
  }, [mentor]);

  // 만점 도달 1회 축하 애니
  const [maxedCelebrate, setMaxedCelebrate] = useState(false);

  const user = profile.name || "";
  const mentorName = mentor?.nickname?.trim() || mentor?.name?.trim() || "";
  const tokens = { user, mentor: mentorName || user };

  const adviceLeft = DAILY_ADVICE_LIMIT - (daily?.adviceCount || 0);
  const chatLeft = daily?.chatUsed ? 0 : 1;

  const pushToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const doAdvice = async () => {
    if (busy || adviceLeft <= 0) return;
    setBusy(true);
    try {
      const items = await loadAdvice();
      const recent = await getRecentAdviceIds({ days: 7 });
      const picked = pickExcluding(items, recent);
      const result = await adjustAffinity(ADVICE_AFFINITY);
      await incMentorAdvice();
      await addMentorHistory({
        type: "advice",
        refId: picked.id,
        content: picked.text,
        author: picked.author,
        category: picked.category,
        affinityChange: result.applied
      });
      setBubble({ kind: "advice", payload: picked });
      if (result.crossedMax) setMaxedCelebrate(true);
    } finally {
      setBusy(false);
    }
  };

  const doChatStart = async () => {
    if (busy || chatLeft <= 0) return;
    setBusy(true);
    try {
      const items = await loadScenarios();
      const recent = await getRecentScenarioIds({ days: 30 });
      const picked = pickExcluding(items, recent);
      setChatScenario(picked);
      setBubble({ kind: "chat-q", payload: picked });
    } finally {
      setBusy(false);
    }
  };

  const doChatChoose = async (choice, idx) => {
    if (!chatScenario || busy) return;
    setBusy(true);
    try {
      const result = await adjustAffinity(choice.affinity);
      await markMentorChatUsed();
      await addMentorHistory({
        type: "chat",
        refId: chatScenario.id,
        question: chatScenario.question,
        userChoice: choice.text,
        content: choice.reply,
        category: chatScenario.category,
        affinityChange: result.applied,
        choiceIndex: idx
      });
      setBubble({ kind: "chat-reply", payload: { scenario: chatScenario, choice, applied: result.applied } });
      if (result.crossedMax) setMaxedCelebrate(true);
      if (result.applied === 0 && choice.affinity < 0) {
        pushToast("호감도 변화 없음 (하한 0)");
      }
    } finally {
      setBusy(false);
    }
  };

  const closeBubble = () => {
    setBubble(null);
    setChatScenario(null);
  };

  const hearts = compactHearts(mentor?.affinity || 0);
  const affinityNum = (mentor?.affinity || 0).toFixed(1);

  // 오늘 보여줄 사진 — 여러 장이면 날짜 시드로 결정
  const photoSrc = useMemo(() => {
    if (!mentor?.showPhoto || !mentor?.photos?.length) return null;
    const today = new Date();
    const seed = today.getFullYear() * 1000 + today.getMonth() * 50 + today.getDate();
    const idx = seed % mentor.photos.length;
    return mentor.photos[idx] || null;
  }, [mentor?.showPhoto, mentor?.photos]);

  const containerStyle = variant === "full"
    ? { padding: 24 }
    : { padding: 16 };

  return (
    <div className="card" style={{
      ...containerStyle,
      background: "linear-gradient(135deg, #FFF5F3 0%, #FFF0EC 100%)",
      border: `1px solid ${R.rose300}`,
      position: "relative", overflow: "hidden"
    }}>
      {/* 헤더: 사진 + 인삿말 */}
      <div style={{ display: "flex", gap: variant === "full" ? 16 : 12, alignItems: "flex-start" }}>
        <MentorPhoto
          src={photoSrc}
          size={variant === "full" ? 88 : 64}
          fallbackColor={R.rose400}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: variant === "full" ? 12 : 11,
            color: R.textLight, marginBottom: 4, fontWeight: 600
          }}>
            💬 {mentorName ? `${mentorName}` : "경제 멘토"}
          </div>
          <div
            style={{
              display: "inline-block",
              padding: variant === "full" ? "10px 14px" : "8px 12px",
              background: "#fff",
              border: `1px solid ${R.rose300}`,
              borderRadius: "14px 14px 14px 4px",
              fontSize: variant === "full" ? 14 : 13,
              fontWeight: 600,
              color: R.textDark,
              lineHeight: 1.45,
              maxWidth: "100%"
            }}
          >
            {!bubble && greeting({ user })}
            {bubble?.kind === "advice" && (
              <AdviceBubble advice={bubble.payload} onClose={closeBubble} />
            )}
            {bubble?.kind === "chat-q" && (
              <ChatQuestionBubble
                scenario={bubble.payload}
                tokens={tokens}
              />
            )}
            {bubble?.kind === "chat-reply" && (
              <ChatReplyBubble
                scenario={bubble.payload.scenario}
                choice={bubble.payload.choice}
                applied={bubble.payload.applied}
                tokens={tokens}
                onClose={closeBubble}
              />
            )}
          </div>
        </div>
      </div>

      {/* 수다 선택지 (chat-q일 때) */}
      {bubble?.kind === "chat-q" && (
        <div style={{
          marginTop: 12, display: "flex", flexDirection: "column", gap: 6
        }}>
          {bubble.payload.choices.map((c, idx) => (
            <button
              key={idx}
              onClick={() => doChatChoose(c, idx)}
              disabled={busy}
              style={{
                padding: "10px 14px", borderRadius: 10,
                border: `1px solid ${R.rose300}`,
                background: "#fff", color: R.textDark,
                fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                cursor: busy ? "wait" : "pointer",
                textAlign: "left", transition: "all 0.15s"
              }}
              onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = R.cream; }}
              onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
            >
              {applyTokens(c.text, tokens)}
            </button>
          ))}
        </div>
      )}

      {/* 버튼 행 */}
      {!bubble && (
        <div style={{
          marginTop: variant === "full" ? 16 : 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto auto",
          gap: 6, alignItems: "stretch"
        }}>
          <ActionButton
            icon="💡"
            label="조언 듣기"
            sub={adviceLeft > 0 ? `오늘 ${adviceLeft}회 남음` : "내일 다시 와"}
            disabled={adviceLeft <= 0 || busy}
            onClick={doAdvice}
            color={R.rose400}
          />
          <ActionButton
            icon="💬"
            label="수다 떨기"
            sub={chatLeft > 0 ? "오늘 1회 남음" : "오늘은 끝"}
            disabled={chatLeft <= 0 || busy}
            onClick={doChatStart}
            color={R.mint}
          />
          <IconBtn
            title={`호감도 ${affinityNum}/10`}
            onClick={() => setShowAffinity(true)}
          >
            <span style={{ fontSize: 14, letterSpacing: -1 }}>{hearts}</span>
            <span style={{ fontSize: 9, color: R.textMid, fontWeight: 700 }}>{affinityNum}</span>
          </IconBtn>
          <IconBtn title="설정" onClick={() => setShowSettings(true)}>
            <span style={{ fontSize: 14 }}>⚙️</span>
          </IconBtn>
        </div>
      )}

      {/* 만점 축하 오버레이 */}
      {maxedCelebrate && (
        <div
          onClick={() => setMaxedCelebrate(false)}
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle, rgba(255,200,200,0.6), transparent 70%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 10
          }}
        >
          <div style={{
            background: "#fff", borderRadius: 16,
            padding: "20px 28px", textAlign: "center",
            boxShadow: "0 8px 32px rgba(192,128,128,0.3)",
            border: `2px solid ${R.rose300}`
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💖</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: R.rose600 }}>호감도 10 도달</div>
            <div style={{ fontSize: 11, color: R.textMid, marginTop: 4 }}>소울메이트 단계</div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          background: R.textDark, color: "#fff",
          padding: "8px 14px", borderRadius: 999, fontSize: 11, fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)", whiteSpace: "nowrap"
        }}>{toast}</div>
      )}

      {showAffinity && mentor && (
        <AffinityModal mentor={mentor} onClose={() => setShowAffinity(false)} />
      )}
      {showSettings && (
        <SettingsModal mentor={mentor} tokens={tokens} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ActionButton({ icon, label, sub, disabled, onClick, color }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 12px", borderRadius: 10,
        border: `1.5px solid ${disabled ? "#E5DCD8" : color}`,
        background: disabled ? "#F5EFEC" : "#fff",
        color: disabled ? "#B8A9A3" : "#4A3535",
        fontSize: 13, fontWeight: 700, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", flexDirection: "column", gap: 1, alignItems: "center",
        transition: "all 0.15s"
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = color; e.currentTarget.style.color = "#fff"; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#4A3535"; } }}
    >
      <span style={{ fontSize: 14 }}>{icon} {label}</span>
      <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 500 }}>{sub}</span>
    </button>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "8px 12px", borderRadius: 10,
        border: "1.5px solid #D4A0A0",
        background: "#fff", cursor: "pointer", fontFamily: "inherit",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
        minWidth: 52, transition: "all 0.15s"
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "#FFF5F3"}
      onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
    >
      {children}
    </button>
  );
}

function AdviceBubble({ advice, onClose }) {
  return (
    <div style={{ cursor: "pointer" }} onClick={onClose} title="탭하면 닫혀">
      <div style={{ fontSize: 13, lineHeight: 1.5, color: "#4A3535" }}>
        "{advice.text}"
      </div>
      <div style={{ fontSize: 10, color: "#7A6060", marginTop: 6, fontWeight: 600 }}>
        — {advice.author} <span style={{ color: "#B8A9A3", fontWeight: 500 }}>· {advice.category}</span>
      </div>
    </div>
  );
}

function ChatQuestionBubble({ scenario, tokens }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5, color: "#4A3535", fontWeight: 600 }}>
      {applyTokens(scenario.question, tokens)}
    </div>
  );
}

function ChatReplyBubble({ scenario, choice, applied, tokens, onClose }) {
  const color = applied > 0 ? "#6BAF8D" : applied < 0 ? "#C06060" : "#B8A9A3";
  return (
    <div style={{ cursor: "pointer" }} onClick={onClose} title="탭하면 닫혀">
      <div style={{ fontSize: 12, color: "#B8A9A3", marginBottom: 4, fontStyle: "italic" }}>
        "{applyTokens(choice.text, tokens)}"
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: "#4A3535" }}>
        {applyTokens(choice.reply, tokens)}
      </div>
      <div style={{ fontSize: 10, color, marginTop: 6, fontWeight: 700 }}>
        호감도 {applied >= 0 ? "+" : ""}{applied.toFixed(2)}
      </div>
    </div>
  );
}
