export const EXPENSE_CATEGORIES = [
  {
    key: "food",
    label: "식비",
    icon: "🍽️",
    color: "#C08060",
    bg: "#FFF8F3",
    cap: 440000,
    subcats: [
      { name: "장보기", icon: "🛒" },
      { name: "식사", icon: "🍱" },
      { name: "커피", icon: "☕" },
      { name: "간식", icon: "🍫" }
    ],
    presets: [
      { subcategory: "커피", amount: 3500, label: "☕ 커피 ₩3,500" },
      { subcategory: "식사", amount: 12000, label: "🍱 점심 ₩12,000" },
      { subcategory: "식사", amount: 15000, label: "🍽️ 저녁 ₩15,000" },
      { subcategory: "식사", amount: 8000, label: "🍜 혼밥 ₩8,000" },
      { subcategory: "장보기", amount: 45000, label: "🛒 장보기 ₩45,000" },
      { subcategory: "간식", amount: 3000, label: "🍫 간식 ₩3,000" }
    ]
  },
  {
    key: "leisure",
    label: "여가생활",
    icon: "🎉",
    color: "#9B7EC0",
    bg: "#F3EEF8",
    cap: 450000,
    subcats: [
      { name: "약속", icon: "🍻" },
      { name: "취미", icon: "🎨" },
      { name: "문화생활", icon: "🎬" },
      { name: "운동", icon: "🏋️" }
    ],
    presets: [
      { subcategory: "약속", amount: 30000, label: "🍻 약속 ₩30,000" },
      { subcategory: "약속", amount: 50000, label: "🥂 회식/모임 ₩50,000" },
      { subcategory: "취미", amount: 20000, label: "🎨 취미 ₩20,000" },
      { subcategory: "문화생활", amount: 15000, label: "🎬 영화/공연 ₩15,000" },
      { subcategory: "운동", amount: 50000, label: "🏋️ 헬스/운동 ₩50,000" }
    ]
  },
  {
    key: "other",
    label: "기타지출",
    icon: "📦",
    color: "#A09088",
    bg: "#FAF5F3",
    cap: null,
    subcats: [
      { name: "경조사비", icon: "💐" },
      { name: "의류", icon: "👕" },
      { name: "교통", icon: "🚇" },
      { name: "구독", icon: "📺" },
      { name: "의료", icon: "💊" },
      { name: "생활용품", icon: "🧴" },
      { name: "기타", icon: "📦" }
    ],
    presets: [
      { subcategory: "경조사비", amount: 50000, label: "💐 경조사 ₩50,000" },
      { subcategory: "경조사비", amount: 100000, label: "🎁 경조사 ₩100,000" },
      { subcategory: "의류", amount: 50000, label: "👕 의류 ₩50,000" },
      { subcategory: "교통", amount: 1500, label: "🚇 지하철 ₩1,500" },
      { subcategory: "구독", amount: 10900, label: "📺 구독료 ₩10,900" },
      { subcategory: "의료", amount: 20000, label: "🏥 병원/약 ₩20,000" },
      { subcategory: "생활용품", amount: 30000, label: "🧴 생활용품 ₩30,000" }
    ]
  }
];

// 기본 카테고리 여부 (삭제 불가 판별용)
export const DEFAULT_CATEGORY_KEYS = new Set(EXPENSE_CATEGORIES.map((c) => c.key));

// 로즈 팔레트 색 프리셋 (카테고리 추가 시 선택지)
export const CATEGORY_COLOR_PRESETS = [
  { color: "#C08060", bg: "#FFF8F3" },
  { color: "#9B7EC0", bg: "#F3EEF8" },
  { color: "#A89888", bg: "#FAF5F3" },
  { color: "#6BAF8D", bg: "#F0FAF5" },
  { color: "#C08080", bg: "#FFF5F5" },
  { color: "#D49080", bg: "#FEF0EC" },
  { color: "#C0A07E", bg: "#FAF5F0" },
  { color: "#7E9EC0", bg: "#F0F5FA" }
];

// 세부 카테고리는 문자열 또는 { name, icon } 객체로 저장 가능. 화면 표시용으로 항상 객체로 정규화.
export function normalizeSubcats(subcats) {
  return (subcats || []).map((s) =>
    typeof s === "string" ? { name: s, icon: null } : { name: s.name, icon: s.icon ?? null }
  );
}

export function getSubcatIcon(category, name) {
  if (!category || !name) return null;
  const list = normalizeSubcats(category.subcats);
  const found = list.find((s) => s.name === name);
  return found?.icon || null;
}

export function getCategory(key, allCategories) {
  if (allCategories) {
    const found = allCategories.find((c) => c.key === key);
    if (found) return found;
  }
  // 이전 키(social, transit) 호환
  if (key === "social") return EXPENSE_CATEGORIES[1];
  if (key === "transit") return EXPENSE_CATEGORIES[2];
  return EXPENSE_CATEGORIES.find((c) => c.key === key) || EXPENSE_CATEGORIES[2];
}

// 기본 + override + custom 병합. subcats는 모두 정규화(객체 형태).
export function mergeCategories(overrides = {}, customs = []) {
  const withOverrides = EXPENSE_CATEGORIES.map((c) => {
    const ov = overrides[c.key];
    const merged = ov ? { ...c, ...ov } : c;
    return { ...merged, subcats: normalizeSubcats(merged.subcats) };
  });
  const fullCustoms = customs.map((c) => ({
    presets: [],
    ...c,
    subcats: normalizeSubcats(c.subcats),
    isCustom: true
  }));
  return [...withOverrides, ...fullCustoms];
}
