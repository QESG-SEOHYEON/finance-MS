// 경제 멘토 로직: 조언·시나리오 선택 with dedup, 토큰 치환, 인삿말.

export const ADVICE_URL = "./mentor/advice.json";
export const SCENARIOS_URL = "./mentor/scenarios.json";

export const DAILY_ADVICE_LIMIT = 3;
export const ADVICE_AFFINITY = 0.1;

let _adviceCache = null;
let _scenariosCache = null;

async function loadJson(url, ref) {
  if (ref.value) return ref.value;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`load ${url}: ${res.status}`);
  const data = await res.json();
  ref.value = Array.isArray(data?.items) ? data.items : [];
  return ref.value;
}
const adviceRef = { value: null };
const scenariosRef = { value: null };

export async function loadAdvice() {
  return loadJson(ADVICE_URL, adviceRef);
}
export async function loadScenarios() {
  return loadJson(SCENARIOS_URL, scenariosRef);
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 최근 사용된 id를 제외하고 랜덤. 후보 없으면 전체에서 랜덤.
export function pickExcluding(items, excludedIds) {
  const pool = items.filter((it) => !excludedIds.has(it.id));
  if (pool.length === 0) return pickRandom(items);
  return pickRandom(pool);
}

// 토큰 치환 — {USER}, {MENTOR} 모두 처리
export function applyTokens(s, { user = "", mentor = "" } = {}) {
  if (!s) return s;
  return s
    .replace(/\{USER\}/g, user || "너")
    .replace(/\{MENTOR\}/g, mentor || "나");
}

// 인삿말 — 시간대별 변주 (MVP: 3구간)
export function greeting({ user = "" } = {}) {
  const h = new Date().getHours();
  const name = user || "너";
  if (h < 6) return `${name}, 이 시간까지 안 자고 뭐 해.`;
  if (h < 11) return `안녕, ${name}. 오늘 하루 어때?`;
  if (h < 17) return `${name}, 점심은 먹었어?`;
  if (h < 21) return `퇴근했어, ${name}? 고생 많았어.`;
  return `${name}, 오늘도 수고했어.`;
}

// 호감도 컴팩트 인디케이터 (3하트: 0~3.3 / 3.3~6.6 / 6.6~10)
export function compactHearts(affinity) {
  const a = Math.max(0, Math.min(10, Number(affinity) || 0));
  if (a < 10 / 3) return "❤♡♡";
  if (a < (10 / 3) * 2) return "❤❤♡";
  return "❤❤❤";
}

// 10-heart 세밀 (풀/반/빈)
export function detailedHearts(affinity) {
  const a = Math.max(0, Math.min(10, Number(affinity) || 0));
  const full = Math.floor(a);
  const half = a - full >= 0.5 ? 1 : 0;
  return { full, half, empty: 10 - full - half };
}
