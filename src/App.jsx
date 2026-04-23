import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Sidebar from "./components/Sidebar.jsx";
import OnboardingModal from "./components/OnboardingModal.jsx";
import ChangelogModal from "./components/ChangelogModal.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import ExpensesPage from "./pages/ExpensesPage.jsx";
import EconomyPage from "./pages/EconomyPage.jsx";
import { isOnboardingComplete, getUserProfile } from "./db.js";
import { getUserPhases } from "./lib/phase.js";

const VALID = ["dashboard", "calendar", "expenses", "economy"];

function readHash() {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  return VALID.includes(h) ? h : "dashboard";
}

const CHANGELOG_SEEN_KEY = "changelog-last-seen";

export default function App() {
  const [page, setPage] = useState(readHash());
  const [ready, setReady] = useState(false);
  const [onboardingState, setOnboardingState] = useState(null);
  const [changelogEntries, setChangelogEntries] = useState(null);
  // null | { mode: "initial" } | { mode: "edit", profile, phases }

  useEffect(() => {
    (async () => {
      const done = await isOnboardingComplete();
      if (!done) setOnboardingState({ mode: "initial" });
      setReady(true);
    })();
  }, []);

  // 업데이트 알림: changelog.json 을 가져와 처음 보는 항목이 있으면 모달로 표시
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`./changelog.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        if (entries.length === 0) return;
        const latestVersion = entries.map((e) => String(e.version)).sort().slice(-1)[0];
        const seen = localStorage.getItem(CHANGELOG_SEEN_KEY);
        // 최초 설치: 알림 띄우지 않고 기준점만 저장 (신규 유저는 과거 이력 관심 없음)
        if (!seen) {
          if (latestVersion) localStorage.setItem(CHANGELOG_SEEN_KEY, latestVersion);
          return;
        }
        const fresh = entries.filter((e) => String(e.version) > seen);
        if (!cancelled && fresh.length > 0) setChangelogEntries(fresh);
      } catch {
        // 네트워크 오류시 조용히 무시
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const closeChangelog = () => {
    if (changelogEntries && changelogEntries.length > 0) {
      const latest = changelogEntries.map((e) => String(e.version)).sort().slice(-1)[0];
      if (latest) localStorage.setItem(CHANGELOG_SEEN_KEY, latest);
    }
    setChangelogEntries(null);
  };

  // 사용자가 설정한 대시보드 제목을 브라우저 탭 타이틀에도 반영
  const dbProfile = useLiveQuery(() => getUserProfile(), [], null);
  useEffect(() => {
    const title = dbProfile?.dashboardTitle?.trim()
      ? dbProfile.dashboardTitle
      : dbProfile?.name
        ? `${dbProfile.name}의 자산관리앱`
        : "자산관리 앱";
    document.title = title;
  }, [dbProfile?.dashboardTitle, dbProfile?.name]);

  useEffect(() => {
    const handler = () => setPage(readHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = (key) => {
    window.location.hash = `/${key}`;
    setPage(key);
  };

  const openProfileEdit = useCallback(async () => {
    const [profile, phases] = await Promise.all([getUserProfile(), getUserPhases()]);
    setOnboardingState({ mode: "edit", profile, phases });
  }, []);

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#B8A9A3" }}>
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={navigate} onOpenProfileEdit={openProfileEdit} />
      <main className="app-main">
        {page === "dashboard" && <DashboardPage />}
        {page === "calendar" && <CalendarPage />}
        {page === "expenses" && <ExpensesPage />}
        {page === "economy" && <EconomyPage />}
      </main>
      {onboardingState && (
        <OnboardingModal
          onComplete={() => setOnboardingState(null)}
          onClose={onboardingState.mode === "edit" ? () => setOnboardingState(null) : undefined}
          initialProfile={onboardingState.mode === "edit" ? onboardingState.profile : undefined}
          initialPhases={onboardingState.mode === "edit" ? onboardingState.phases : undefined}
        />
      )}
      {changelogEntries && !onboardingState && (
        <ChangelogModal entries={changelogEntries} onClose={closeChangelog} />
      )}
    </div>
  );
}
