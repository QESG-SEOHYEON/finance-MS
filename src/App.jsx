import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar.jsx";
import OnboardingModal from "./components/OnboardingModal.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import ExpensesPage from "./pages/ExpensesPage.jsx";
import { isOnboardingComplete } from "./db.js";

const VALID = ["dashboard", "calendar", "expenses"];

function readHash() {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  return VALID.includes(h) ? h : "dashboard";
}

export default function App() {
  const [page, setPage] = useState(readHash());
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      const done = await isOnboardingComplete();
      setShowOnboarding(!done);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const handler = () => setPage(readHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = (key) => {
    window.location.hash = `/${key}`;
    setPage(key);
  };

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#B8A9A3" }}>
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={navigate} />
      <main className="app-main">
        {page === "dashboard" && <DashboardPage />}
        {page === "calendar" && <CalendarPage />}
        {page === "expenses" && <ExpensesPage />}
      </main>
      {showOnboarding && (
        <OnboardingModal onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
