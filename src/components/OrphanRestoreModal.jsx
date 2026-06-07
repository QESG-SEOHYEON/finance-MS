import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  getOrphanedTaskRefs,
  restoreOrphanTask,
  deleteOrphanData
} from "../db.js";
import { fmt } from "../schedule.js";

const R = {
  rose50: "#FFF5F5", rose100: "#FCEAEA", rose200: "#F0D5D5",
  rose300: "#D4A0A0", rose400: "#C08080", rose500: "#A66060", rose600: "#8B4F4F",
  mint: "#6BAF8D", mintLight: "#E8F5EE",
  lavender: "#9B7EC0",
  textDark: "#4A3535", textMid: "#7A6060", textLight: "#B8A9A3",
  cream: "#FAF5F3", creamDark: "#F0EBE8",
  border: "#EDE5E2",
  over: "#C06060"
};

function parseId(id) {
  const parts = String(id).split("-");
  if (parts.length >= 4) {
    const [y, mo, day, ...rest] = parts;
    return { year: y, month: mo, day, label: rest.join("-") };
  }
  return null;
}

function guessIcon(label) {
  const s = String(label || "").toLowerCase();
  if (/급여|월급|보너스|용돈|수입/.test(s)) return "💰";
  if (/카드/.test(s)) return "💳";
  if (/관리비|전세|월세|보증/.test(s)) return "🏠";
  if (/적금|예금|cma|비상금/.test(s)) return "🏦";
  if (/etf|주식|투자|펀드/.test(s)) return "📈";
  if (/대출|마통|상환/.test(s)) return "⚡";
  if (/이자/.test(s)) return "🔑";
  return "📌";
}

export default function OrphanRestoreModal({ onClose }) {
  const [orphans, setOrphans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const reload = async () => {
    setLoading(true);
    const list = await getOrphanedTaskRefs();
    // 정렬: 실제값 많은 순 → 월 개수 → ID
    list.sort((a, b) => b.actualSum - a.actualSum || b.monthIds.length - a.monthIds.length);
    setOrphans(list);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const handleRestore = async (o) => {
    setBusy(o.id);
    await restoreOrphanTask(o);
    await reload();
    setBusy(null);
  };
  const handleDelete = async (o) => {
    const parsed = parseId(o.id);
    const name = o.override?.label || parsed?.label || o.id;
    if (!confirm(`"${name}" 의 모든 흔적을 삭제할까요?\n복구 불가합니다.`)) return;
    setBusy(o.id);
    await deleteOrphanData(o);
    await reload();
    setBusy(null);
  };
  const handleRestoreAll = async () => {
    if (!confirm(`${orphans.length}개 항목을 모두 캘린더에 복원할까요?`)) return;
    for (const o of orphans) {
      setBusy(o.id);
      await restoreOrphanTask(o);
    }
    await reload();
    setBusy(null);
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 950 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          maxHeight: "85vh",
          overflow: "auto",
          background: `linear-gradient(180deg, ${R.rose50} 0%, #FFFDFD 30%)`,
          padding: 20
        }}
      >
        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 6 }}>🪄</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: R.textDark, letterSpacing: "-0.3px" }}>
            사라진 항목 복원
          </div>
          <div style={{ fontSize: 12, color: R.textMid, marginTop: 4, lineHeight: 1.5 }}>
            업데이트로 캘린더에서 안 보이게 된 기록들 — 다시 살리거나 정리할 수 있어요.
          </div>
        </div>

        {/* 요약 카드 */}
        {!loading && orphans.length > 0 && (
          <div style={{
            display: "flex", justifyContent: "space-around", alignItems: "center",
            padding: "12px 16px", marginBottom: 14,
            background: "#fff", borderRadius: 14, border: `1px solid ${R.border}`,
            boxShadow: "0 2px 8px rgba(166, 96, 96, 0.06)"
          }}>
            <Stat label="항목" value={`${orphans.length}건`} color={R.rose500} />
            <div style={{ width: 1, height: 32, background: R.border }} />
            <Stat
              label="월 합계"
              value={`${new Set(orphans.flatMap((o) => o.monthIds)).size}개월`}
              color={R.lavender}
            />
            <div style={{ width: 1, height: 32, background: R.border }} />
            <Stat
              label="누적 금액"
              value={`${fmt(orphans.reduce((s, o) => s + o.actualSum, 0))}`}
              color={R.mint}
            />
          </div>
        )}

        {/* 로딩 */}
        {loading && (
          <div style={{ padding: 32, textAlign: "center", color: R.textLight, fontSize: 12 }}>
            🔍 확인 중…
          </div>
        )}

        {/* 빈 상태 */}
        {!loading && orphans.length === 0 && (
          <div style={{
            padding: 28, textAlign: "center",
            background: R.mintLight, borderRadius: 14, border: `1px solid #B5DAC2`,
            color: "#3B7A5A"
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✨</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              사라진 항목이 없어요
            </div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
              데이터가 모두 정상적으로 표시되고 있어요.
            </div>
          </div>
        )}

        {/* 일괄 복원 */}
        {!loading && orphans.length > 1 && (
          <button
            onClick={handleRestoreAll}
            disabled={!!busy}
            style={{
              width: "100%", padding: "10px 14px",
              background: `linear-gradient(135deg, ${R.rose400}, ${R.rose500})`,
              color: "#fff", border: "none", borderRadius: 10,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", marginBottom: 12,
              boxShadow: `0 3px 10px ${R.rose400}40`
            }}
          >🪄 모두 한 번에 복원하기 ({orphans.length}건)</button>
        )}

        {/* 항목 리스트 */}
        {!loading && orphans.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {orphans.map((o) => {
              const parsed = parseId(o.id);
              const label = o.override?.label || parsed?.label || "복원된 항목";
              const icon = o.override?.icon || guessIcon(label);
              const monthsLabel = o.monthIds.length === 1
                ? o.monthIds[0]
                : `${o.monthIds[0]} 외 ${o.monthIds.length - 1}건`;
              const isBusy = busy === o.id;
              return (
                <div
                  key={o.id}
                  style={{
                    padding: "12px 14px", borderRadius: 12,
                    background: "#fff",
                    border: `1px solid ${R.border}`,
                    boxShadow: isBusy ? `0 0 0 2px ${R.rose200}` : "0 1px 3px rgba(166,96,96,0.04)",
                    opacity: isBusy ? 0.6 : 1,
                    transition: "all 0.15s"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    {/* 아이콘 */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: R.cream,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0
                    }}>{icon}</div>

                    {/* 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: R.textDark, marginBottom: 3 }}>
                        {label}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 10, color: R.textLight }}>
                        {parsed && <Tag>📅 매월 {parsed.day}일</Tag>}
                        <Tag>📦 {monthsLabel}</Tag>
                        {o.actualSum > 0 && <Tag color={R.mint}>💰 누적 {fmt(o.actualSum)}</Tag>}
                        {o.hasCheck && <Tag color={R.mint}>✓ 완료 기록</Tag>}
                        {o.hasOverride && <Tag color={R.lavender}>✎ 편집됨</Tag>}
                      </div>
                    </div>
                  </div>

                  {/* 액션 */}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button
                      onClick={() => handleRestore(o)}
                      disabled={isBusy}
                      style={{
                        flex: 1, padding: "8px 12px",
                        background: R.rose400, color: "#fff",
                        border: "none", borderRadius: 8,
                        fontSize: 12, fontWeight: 700, cursor: isBusy ? "wait" : "pointer",
                        fontFamily: "inherit"
                      }}
                    >🪄 복원</button>
                    <button
                      onClick={() => handleDelete(o)}
                      disabled={isBusy}
                      style={{
                        padding: "8px 12px",
                        background: "#fff", color: R.over,
                        border: `1px solid ${R.over}30`, borderRadius: 8,
                        fontSize: 12, fontWeight: 600, cursor: isBusy ? "wait" : "pointer",
                        fontFamily: "inherit"
                      }}
                    >🗑 삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 닫기 */}
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 24px",
              background: "transparent",
              color: R.textMid,
              border: `1px solid ${R.border}`,
              borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit"
            }}
          >닫기</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 10, color: R.textLight, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, letterSpacing: "-0.3px" }}>{value}</div>
    </div>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 6px", borderRadius: 6,
      background: color ? color + "15" : R.cream,
      color: color || R.textMid,
      fontSize: 10, fontWeight: 600
    }}>{children}</span>
  );
}
