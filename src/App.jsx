import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Sidebar from "./components/Sidebar.jsx";
import OnboardingModal from "./components/OnboardingModal.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import ExpensesPage from "./pages/ExpensesPage.jsx";
import { isOnboardingComplete, getUserProfile } from "./db.js";
import { getUserPhases } from "./lib/phase.js";

const VALID = ["dashboard", "calendar", "expenses"];

function readHash() {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  return VALID.includes(h) ? h : "dashboard";
}

export default function App() {
  const [page, setPage] = useState(readHash());
  const [ready, setReady] = useState(false);
  const [onboardingState, setOnboardingState] = useState(null);
  // null | { mode: "initial" } | { mode: "edit", profile, phases }

  useEffect(() => {
    (async () => {
      const done = await isOnboardingComplete();
      if (!done) setOnboardingState({ mode: "initial" });
      setReady(true);
    })();
  }, []);

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
      </main>
      {onboardingState && (
        <OnboardingModal
          onComplete={() => setOnboardingState(null)}
          onClose={onboardingState.mode === "edit" ? () => setOnboardingState(null) : undefined}
          initialProfile={onboardingState.mode === "edit" ? onboardingState.profile : undefined}
          initialPhases={onboardingState.mode === "edit" ? onboardingState.phases : undefined}
        />
      )}
    </div>
  );
}
