// Phase 로드맵은 사용자가 온보딩 또는 설정에서 직접 정의.
// DB (settings.user-phases)에 저장된 배열을 읽어 사용한다.
// 비어있으면 Phase 개념 없이 기본 "현재" 상태로만 표시.

import { db } from "../db.js";

export const DEFAULT_PHASES = [];

// 사용자 지정 Phase를 DB에서 가져오는 hook용 조회 함수
export async function getUserPhases() {
  const row = await db.settings.get("user-phases");
  return row?.value || [];
}

export async function setUserPhases(phases) {
  await db.settings.put({ id: "user-phases", value: phases });
}

function toIdx(y, m) { return y * 12 + m; }

/**
 * Phase 배열(비동기적으로 로드된)에서 현재 시점에 해당하는 Phase 반환.
 * 정의 범위 이전/이후/없음에 대해 안전하게 처리.
 */
export function currentPhaseFrom(phases, date = new Date()) {
  if (!Array.isArray(phases) || phases.length === 0) {
    return { num: 0, name: "시작 전", range: "-", goals: [] };
  }
  const k = toIdx(date.getFullYear(), date.getMonth() + 1);
  for (const p of phases) {
    if (!p.start || !p.end) continue;
    if (k >= toIdx(p.start.y, p.start.m) && k <= toIdx(p.end.y, p.end.m)) return p;
  }
  const first = phases[0];
  const last = phases[phases.length - 1];
  if (first?.start && k < toIdx(first.start.y, first.start.m)) {
    return { num: 0, name: "준비 중", range: `~ ${first.range?.split("~")[0] || ""}`, goals: [] };
  }
  if (last?.end && k > toIdx(last.end.y, last.end.m)) {
    return { num: (last.num || 0) + 1, name: "목표 달성", range: "-", goals: [] };
  }
  return { num: 0, name: "시작 전", range: "-", goals: [] };
}

// 레거시 호환: 동기 currentPhase — phases가 빈 배열이면 기본값 반환
export const PHASES = DEFAULT_PHASES;
export function currentPhase(date = new Date()) {
  return currentPhaseFrom(DEFAULT_PHASES, date);
}

export function phaseForMonth(year, month) {
  return currentPhase(new Date(year, month - 1, 15));
}
