import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Sidebar from "./components/Sidebar.jsx";
import OnboardingModal from "./components/OnboardingModal.jsx";
import ChangelogModal from "./components/ChangelogModal.jsx";
import AttendanceModal from "./components/AttendanceModal.jsx";
import AssetSetupWizard from "./components/AssetSetupWizard.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import ExpensesPage from "./pages/ExpensesPage.jsx";
import EconomyPage from "./pages/EconomyPage.jsx";
import {
  isOnboardingComplete, getUserProfile,
  getAttendanceDates, markAttendance,
  applyRecurringTasksForMonth, migrateRecurringExpensesToTasks,
  isAssetSetupDone
} from "./db.js";
import { getUserPhases } from "./lib/phase.js";
import { attendanceKeyForNow, msUntilNextKSTNoon } from "./lib/attendance.js";

const VALID = ["dashboard", "calendar", "expenses", "economy"];

function readHash() {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  return VALID.includes(h) ? h : "dashboard";
}

const CHANGELOG_SEEN_KEY = "changelog-last-seen";

function computeStreak(sortedDates, todayKey) {
  const set = new Set(sortedDates);
  let count = 0;
  let cursor = new Date(`${todayKey}T00:00:00Z`);
  if (!set.has(todayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (set.has(key)) {
      count++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else break;
  }
  return count;
}

export default function App() {
  const [page, setPage] = useState(readHash());
  const [ready, setReady] = useState(false);
  const [onboardingState, setOnboardingState] = useState(null);
  const [changelogEntries, setChangelogEntries] = useState(null);
  const [attendanceModal, setAttendanceModal] = useState(null);
  const [showAssetWizard, setShowAssetWizard] = useState(false);

  useEffect(() => {
    (async () => {
      const done = await isOnboardingComplete();
      if (!done) setOnboardingState({ mode: "initial" });

      // 기존 반복 지출 → 반복 일정 1회 마이그레이션
      try {
        const r = await migrateRecurringExpensesToTasks();
        if (r.migrated > 0) console.log(`[migrate] 반복 지출 ${r.migrated}건을 반복 일정으로 이전했어요.`);
      } catch (e) { console.warn("[migrate] failed", e); }

      // 진입 시 현재 달의 반복 일정 자동 적용
      try {
        const now = new Date();
        await applyRecurringTasksForMonth(now.getFullYear(), now.getMonth() + 1);
      } catch {}

      // 자산 마법사 — 온보딩 완료자 중 아직 한 번도 안 본 사람만
      try {
        const onboardingDone = await isOnboardingComplete();
        const setupDone = await isAssetSetupDone();
        if (onboardingDone && !setupDone) setShowAssetWizard(true);
      } catch {}

      setReady(true);
    })();
  }, []);

  // 업데이트 알림: changelog.json
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
        if (!seen) {
          if (latestVersion) localStorage.setItem(CHANGELOG_SEEN_KEY, latestVersion);
          return;
        }
        const fresh = entries.filter((e) => String(e.version) > seen);
        if (!cancelled && fresh.length > 0) setChangelogEntries(fresh);
      } catch {}
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

  // 출석체크: 마운트 + visibilitychange + KST 정오 타이머
  useEffect(() => {
    let cancelled = false;
    let timer;
    const checkToday = async () => {
      if (cancelled) return;
      const onboardingDone = await isOnboardingComplete();
      if (!onboardingDone) return;
      const todayKey = attendanceKeyForNow();
      const dates = await getAttendanceDates();
      if (cancelled) return;
      if (!dates.includes(todayKey)) {
        const streak = computeStreak(dates, todayKey);
        const hasPrior = dates.length > 0;
        setAttendanceModal({ todayKey, streak, hasPrior });
      }
      clearTimeout(timer);
      timer = setTimeout(checkToday, msUntilNextKSTNoon() + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") checkToday();
    };
    checkToday();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onboardingState]);

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

  // 우선순위: 온보딩 → 자산 마법사 → changelog → 출석체크
  const showWizard = showAssetWizard && !onboardingState;
  const showChangelog = changelogEntries && !onboardingState && !showWizard;
  const showAttendance = attendanceModal && !onboardingState && !showWizard && !showChangelog;

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
      {showWizard && (
        <AssetSetupWizard onClose={() => setShowAssetWizard(false)} />
      )}
      {showChangelog && (
        <ChangelogModal entries={changelogEntries} onClose={closeChangelog} />
      )}
      {showAttendance && (
        <AttendanceModal
          streak={attendanceModal.streak}
          hasPrior={attendanceModal.hasPrior}
          onStamp={() => markAttendance(attendanceModal.todayKey)}
          onClose={() => setAttendanceModal(null)}
        />
      )}
    </div>
  );
}
