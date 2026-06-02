import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // 콘솔에 남겨 디버깅 가능. (서비스 워커 + 새로고침 안내가 우선)
    console.error("[ErrorBoundary]", error, info);
  }
  hardReload = async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}
    window.location.reload();
  };
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#FAF5F3", padding: 24, fontFamily: "inherit"
        }}>
          <div style={{
            maxWidth: 360, textAlign: "center",
            background: "#fff", padding: 24, borderRadius: 16,
            border: "1px solid #EDE5E2",
            boxShadow: "0 8px 24px rgba(74,53,53,0.1)"
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🌸</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#4A3535" }}>
              일시적인 문제가 발생했어요
            </div>
            <div style={{ fontSize: 12, color: "#7A6060", margin: "8px 0 16px", lineHeight: 1.6 }}>
              업데이트 직후 캐시가 꼬여 화면이 안 뜨는 경우가 있어요.<br/>
              아래 버튼을 누르면 캐시를 비우고 다시 불러옵니다.
            </div>
            <button
              onClick={this.hardReload}
              style={{
                width: "100%", padding: "10px 14px",
                background: "#C08080", color: "#fff",
                border: "none", borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit"
              }}
            >캐시 비우고 새로고침</button>
            <div style={{ marginTop: 10, fontSize: 10, color: "#B8A9A3" }}>
              저장된 데이터는 그대로 유지됩니다.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
