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
  applyTokens, greeting,
  DAILY_ADVICE_LIMIT, ADVICE_AFFINITY
} from "../../lib/mentor.js";
import MentorPhoto from "./MentorPhoto.jsx";
import AffinityModal from "./AffinityModal.jsx";
import SettingsModal from "./SettingsModal.jsx";
import { DetailedHearts } from "./Heart.jsx";
import PixelButton, { PixelBubble } from "./PixelButton.jsx";

// ═════════════════════════════════════════════════════════
// [DEV] localhost(개발자 환경)에서만 일일 제한 비활성화.
// 배포된 친구 앱(github.io 등)에서는 자동으로 false → 정상 카운팅.
// ═════════════════════════════════════════════════════════
const DEV_UNLIMITED =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

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

  const adviceLeft = DEV_UNLIMITED
    ? DAILY_ADVICE_LIMIT // [DEV] 표시는 3회로 유지 (UI상 자연스러움)
    : DAILY_ADVICE_LIMIT - (daily?.adviceCount || 0);
  const chatLeft = DEV_UNLIMITED ? 1 : (daily?.chatUsed ? 0 : 1);

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
      if (!DEV_UNLIMITED) await incMentorAdvice(); // [DEV] 제한 OFF 시 카운터 스킵
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
      if (!DEV_UNLIMITED) await markMentorChatUsed(); // [DEV] 제한 OFF 시 카운터 스킵
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

  const affinityNum = (mentor?.affinity || 0).toFixed(1);

  // 오늘 보여줄 사진 — 여러 장이면 날짜 시드로 결정. 없으면 기본 픽셀 고양이.
  const photoSrc = useMemo(() => {
    if (!mentor?.showPhoto) return null; // OFF → 기본 일러스트 (💭)
    if (!mentor?.photos?.length) return "./mentor-default-cat.jpeg";
    const today = new Date();
    const seed = today.getFullYear() * 1000 + today.getMonth() * 50 + today.getDate();
    const idx = seed % mentor.photos.length;
    return mentor.photos[idx] || "./mentor-default-cat.jpeg";
  }, [mentor?.showPhoto, mentor?.photos]);

  // CSS 레트로 윈도우 프레임 — 가로·세로 자유 스케일, 왜곡 없음.
  const frame = variant === "full"
    ? { photo: 160, bodyPad: "20px 24px", titleH: 26, footerH: 22, titleFont: 13 }
    : { photo: 128, bodyPad: "14px 18px", titleH: 22, footerH: 18, titleFont: 11 };

  return (
    <div style={{
      position: "relative",
      borderRadius: 8,
      overflow: "hidden",
      background: "#fff",
      border: "1.5px solid #C08080",
      boxShadow: "3px 3px 0 rgba(192,128,128,0.25)"
    }}>
      {/* 타이틀바 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        height: frame.titleH,
        padding: "0 10px",
        background: "linear-gradient(180deg, #F5A6C8 0%, #E88AB0 100%)",
        borderBottom: "1.5px solid #C08080",
        fontFamily: "'Galmuri11', monospace",
        fontSize: frame.titleFont,
        color: "#5A2840"
      }}>
        <WindowIcon>×</WindowIcon>
        <WindowIcon>□</WindowIcon>
        <WindowIcon>−</WindowIcon>
        <span style={{ marginLeft: "auto", opacity: 0.85 }}>
          {mentorName || "mentor"}.exe
        </span>
      </div>

      {/* 본체 */}
      <div style={{
        padding: frame.bodyPad,
        background: "linear-gradient(180deg, #FFF8FA 0%, #FFEDF3 100%)"
      }}>
      {/* 헤더: 사진 + 인삿말 */}
      <div style={{ display: "flex", gap: variant === "full" ? 20 : 14, alignItems: "flex-start" }}>
        <MentorPhoto
          src={photoSrc}
          size={frame.photo}
          fallbackColor={R.rose400}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: variant === "full" ? 12 : 11,
            color: R.textLight, marginBottom: 4, fontWeight: 600
          }}>
            💬 {mentorName ? `${mentorName}` : "경제 멘토"}
          </div>
          <PixelBubble
            border={R.rose400}
            bg="#fff"
            padding={variant === "full" ? "10px 14px" : "8px 12px"}
            fontSize={variant === "full" ? 13 : 12}
            color={R.textDark}
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
          </PixelBubble>
        </div>
      </div>

      {/* 수다 선택지 (chat-q일 때) — 픽셀 스타일 */}
      {bubble?.kind === "chat-q" && (
        <div style={{
          marginTop: 12, display: "flex", flexDirection: "column", gap: 8
        }}>
          {bubble.payload.choices.map((c, idx) => (
            <ChoiceButton
              key={idx}
              onClick={() => doChatChoose(c, idx)}
              disabled={busy}
            >
              {applyTokens(c.text, tokens)}
            </ChoiceButton>
          ))}
        </div>
      )}

      {/* 버블 있을 때 — 뒤로가기 픽셀 버튼 */}
      {bubble && (
        <div style={{
          marginTop: variant === "full" ? 14 : 10,
          display: "flex", justifyContent: "flex-end"
        }}>
          <PixelButton
            palette="cream"
            size="sm"
            onClick={closeBubble}
            title="뒤로"
          >← 뒤로</PixelButton>
        </div>
      )}

      {/* 호감도 + 버튼을 한 줄로 병렬 배치 */}
      {!bubble && (
        <div style={{
          marginTop: variant === "full" ? 16 : 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap"
        }}>
          <button
            onClick={() => setShowAffinity(true)}
            title="탭하여 호감도 상세 보기"
            style={{
              flex: "1 1 280px",
              minWidth: 0,
              padding: variant === "full" ? "12px 16px" : "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.85)",
              border: `1.5px solid ${R.rose300}`,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, transition: "all 0.15s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#FFF5F3"; e.currentTarget.style.borderColor = R.rose400; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.85)"; e.currentTarget.style.borderColor = R.rose300; }}
          >
            <DetailedHearts
              affinity={mentor?.affinity || 0}
              size={variant === "full" ? 22 : 18}
            />
            <span style={{
              fontSize: variant === "full" ? 15 : 13,
              fontWeight: 800, color: R.rose500, letterSpacing: -0.5,
              flexShrink: 0, fontFamily: "'Galmuri11', monospace"
            }}>
              {affinityNum}
              <span style={{ fontSize: 11, color: R.textLight, fontWeight: 500, marginLeft: 2 }}>/10</span>
            </span>
          </button>
          <PixelButton
            palette="pink"
            size="sm"
            disabled={adviceLeft <= 0 || busy}
            onClick={doAdvice}
            title={adviceLeft > 0 ? `조언 듣기 (${adviceLeft}회 남음)` : "내일 다시 와"}
          >💡 조언</PixelButton>
          <PixelButton
            palette="mint"
            size="sm"
            disabled={chatLeft <= 0 || busy}
            onClick={doChatStart}
            title={chatLeft > 0 ? "수다 떨기 (1회 남음)" : "오늘은 끝"}
          >💬 수다</PixelButton>
          <PixelButton
            palette="cream"
            size="sm"
            onClick={() => setShowSettings(true)}
            title="설정"
          >⚙ 설정</PixelButton>
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
      </div>{/* /body */}

      {/* 푸터 — 장식용 < > 네비 (호감도 모달 단축키 역할) */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: frame.footerH,
        padding: "0 12px",
        background: "linear-gradient(180deg, #FFE0ED 0%, #F5A6C8 100%)",
        borderTop: "1.5px solid #C08080",
        fontFamily: "'Galmuri11', monospace",
        color: "#5A2840", fontSize: 12
      }}>
        <span>‹</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>
          호감도 {(mentor?.affinity || 0).toFixed(1)}/10
        </span>
        <span>›</span>
      </div>
    </div>
  );
}

// 3지선다 선택지 버튼 — 픽셀 스타일, 여러 줄 가능, 왼쪽 정렬
function ChoiceButton({ children, onClick, disabled }) {
  const STEP = 3;
  const clip = `polygon(
    0 ${STEP}px, ${STEP}px ${STEP}px, ${STEP}px 0,
    calc(100% - ${STEP}px) 0, calc(100% - ${STEP}px) ${STEP}px, 100% ${STEP}px,
    100% calc(100% - ${STEP}px), calc(100% - ${STEP}px) calc(100% - ${STEP}px), calc(100% - ${STEP}px) 100%,
    ${STEP}px 100%, ${STEP}px calc(100% - ${STEP}px), 0 calc(100% - ${STEP}px)
  )`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: "relative",
        width: "100%",
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: disabled ? "wait" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.55 : 1,
        textAlign: "left"
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.querySelector(".ch-inner").style.background = "#FFF5F3";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.querySelector(".ch-inner").style.background = "#fff";
        }
      }}
    >
      <span style={{
        position: "absolute", inset: 0, background: "#D4A0A0",
        clipPath: clip, WebkitClipPath: clip
      }} />
      <span className="ch-inner" style={{
        position: "absolute", inset: STEP, background: "#fff",
        clipPath: `polygon(
          0 ${STEP - 1}px, ${STEP - 1}px ${STEP - 1}px, ${STEP - 1}px 0,
          calc(100% - ${STEP - 1}px) 0, calc(100% - ${STEP - 1}px) ${STEP - 1}px, 100% ${STEP - 1}px,
          100% calc(100% - ${STEP - 1}px), calc(100% - ${STEP - 1}px) calc(100% - ${STEP - 1}px), calc(100% - ${STEP - 1}px) 100%,
          ${STEP - 1}px 100%, ${STEP - 1}px calc(100% - ${STEP - 1}px), 0 calc(100% - ${STEP - 1}px)
        )`,
        transition: "background 0.15s"
      }} />
      <span style={{
        position: "relative", zIndex: 1, display: "block",
        padding: "10px 14px",
        fontFamily: "'Galmuri11', 'Press Start 2P', monospace",
        fontSize: 13,
        color: "#4A3535",
        lineHeight: 1.5,
        letterSpacing: "0.3px",
        textAlign: "left"
      }}>{children}</span>
    </button>
  );
}

function WindowIcon({ children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 14, height: 14,
      background: "rgba(255,255,255,0.8)",
      border: "1px solid #5A2840",
      color: "#5A2840",
      fontSize: 10, fontWeight: 800, lineHeight: 1,
      fontFamily: "'Galmuri11', monospace"
    }}>{children}</span>
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
      {/* 내 대답 (플레이어 선택) — 엷은 색 */}
      <div style={{ fontSize: 11, color: "#B8A9A3", marginBottom: 6 }}>
        &gt; {applyTokens(choice.text, tokens)}
      </div>
      <div style={{ lineHeight: 1.5, color: "#4A3535" }}>
        {applyTokens(choice.reply, tokens)}
      </div>
      <div style={{ fontSize: 11, color, marginTop: 6, fontWeight: 700 }}>
        호감도 {applied >= 0 ? "+" : ""}{applied.toFixed(2)}
      </div>
    </div>
  );
}
