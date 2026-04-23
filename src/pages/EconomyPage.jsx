import { useState } from "react";
import TopBar from "../components/TopBar.jsx";
import NewsTab from "../components/economy/NewsTab.jsx";
import MentorTab from "../components/economy/MentorTab.jsx";

const TABS = [
  { key: "news", label: "📰 오늘의 뉴스" },
  { key: "mentor", label: "💬 경제 멘토" }
];

// Rose palette
const R = {
  rose400: "#C08080",
  border: "#EDE5E2",
  textDark: "#4A3535",
  textMid: "#7A6060",
  textLight: "#B8A9A3"
};

export default function EconomyPage() {
  const [tab, setTab] = useState("news");

  return (
    <>
      <TopBar
        breadcrumb={["Dashboard", "Economy"]}
        title="Economy"
        subtitle="매일 받아보는 경제 뉴스와 멘토의 한마디"
      />

      <div style={{
        display: "inline-flex", gap: 4,
        background: "#fff", borderRadius: 12, padding: 4,
        border: `1px solid ${R.border}`,
        marginBottom: 16
      }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              background: tab === t.key ? R.rose400 : "transparent",
              color: tab === t.key ? "#fff" : R.textMid,
              transition: "all 0.15s"
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === "news" && <NewsTab />}
      {tab === "mentor" && <MentorTab />}
    </>
  );
}
