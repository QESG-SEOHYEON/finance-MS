import { useLiveQuery } from "dexie-react-hooks";
import { PROFILE, db, getUserProfile, mergeProfile, resetAllData } from "../db.js";
import { currentPhaseFrom, getUserPhases } from "../lib/phase.js";

const MENU = [
  { key: "dashboard", icon: "📊", label: "Dashboard" },
  { key: "calendar", icon: "📅", label: "Calendar" },
  { key: "expenses", icon: "💸", label: "Expenses" }
];

export default function Sidebar({ page, onNavigate, onOpenProfileEdit }) {
  const today = new Date();
  const userPhases = useLiveQuery(() => getUserPhases(), [], []);
  const phase = currentPhaseFrom(userPhases, today);

  const dbProfile = useLiveQuery(() => getUserProfile(), [], null);
  const p = mergeProfile(dbProfile);

  const goalDate = p.goalDate ? new Date(p.goalDate) : new Date();
  const dday = Math.ceil((goalDate - today) / (1000 * 60 * 60 * 24));
  const goalYear = goalDate.getFullYear();

  const customGoals = useLiveQuery(
    () => db.settings.get(`phase-goals-${phase.num}`),
    [phase.num]
  );
  const c = customGoals?.value || { added: [], hidden: [] };
  const visibleGoals = [
    ...phase.goals.filter((g) => !c.hidden.includes(g)),
    ...c.added
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-profile">
        <div className="sidebar-avatar">
          <img src="./profile.jpeg" alt="" onError={(e) => e.target.style.display = "none"} />
        </div>
        <div className="sidebar-profile-meta">
          <div className="sidebar-profile-name">{p.name}</div>
          <div className="sidebar-profile-sub">
            {p.age ? `${p.age}세 · ` : ""}{p.subtitle || "사용자"}
          </div>
        </div>
      </div>

      <div className="sidebar-section-label">MAIN MENU</div>
      <nav className="sidebar-nav">
        {MENU.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`sidebar-nav-item ${page === item.key ? "active" : ""}`}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-section-label">CURRENT PHASE</div>
      <div className="sidebar-phase">
        <div className="sidebar-phase-num">Phase {phase.num}</div>
        <div className="sidebar-phase-name">{phase.name}</div>
        <div className="sidebar-phase-range">{phase.range}</div>
        {visibleGoals.length > 0 && (
          <ul className="sidebar-phase-goals">
            {visibleGoals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="sidebar-spacer" />

      <img src="./flower-accent.png" alt="" className="sidebar-decor" onError={(e) => e.target.style.display = "none"} />

      <div className="sidebar-dday">
        <div className="sidebar-dday-label">{goalYear} 목표 달성까지</div>
        <div className="sidebar-dday-value">D-{dday > 0 ? dday : 0}</div>
        <div className="sidebar-dday-sub">{p.goalDate}</div>
      </div>

      {onOpenProfileEdit && (
        <button
          onClick={onOpenProfileEdit}
          style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.6)", border: "1px solid #EDE5E2",
            color: "#7A6060", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6
          }}
          title="이름·목표·수입 등 기본 정보 수정"
        >
          ⚙️ 프로필 재설정
        </button>
      )}

      <button
        onClick={() => {
          const msg = import.meta.env.DEV
            ? "⚠️ [DEV] 입력폼 데이터가 전부 삭제됩니다.\n· 프로필, 기록, Phase 등 모든 내용 삭제\n· 새로고침 후 온보딩부터 다시 시작"
            : "⚠️ 경고: 모든 데이터가 영구 삭제됩니다!\n\n· 프로필, 수입원, 목표, Phase\n· 캘린더 이벤트, 완료 체크, 실제 금액\n· 지출 기록, 반복 지출, 프리셋\n· 커스텀 카테고리\n\n정말 초기화하시겠습니까? (되돌릴 수 없음)";
          if (!confirm(msg)) return;
          if (!import.meta.env.DEV && !confirm("마지막 확인 — 정말 삭제?")) return;
          resetAllData();
        }}
        style={{
          marginTop: 8, padding: "8px 10px", borderRadius: 8,
          background: "transparent", border: "1px dashed #D4A0A0",
          color: "#A66060", fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit"
        }}
        title="IndexedDB 전체 삭제 후 새로고침 (되돌릴 수 없음)"
      >
        {import.meta.env.DEV ? "🧪 DEV · 전체 초기화" : "🗑️ 전체 데이터 초기화"}
      </button>
    </aside>
  );
}
