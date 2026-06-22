import { createPortal } from "react-dom";

const R = {
  rose400: "#C08080", rose500: "#A66060", textDark: "#4A3535",
  textMid: "#7A6060", textLight: "#B8A9A3", cream: "#FAF5F3", border: "#EDE5E2"
};

// 자산 종류 단일 소스. v=nwImpact 키, icon/label/short(힌트)/detail/example.
// taskType = 캘린더 task 색상 매핑, goalLike = 목표/적립성(예적금·투자·상환) 여부.
export const ASSET_TYPE_GUIDE = [
  {
    v: "income", icon: "💰", label: "💰 수입", short: "월급·부수입",
    taskType: "income", goalLike: false,
    detail: "월급, 부수입, 환급금, 이자 등 새로 들어오는 돈. 현금이 늘고 순자산도 그만큼 증가해요.",
    example: "월급 300만, 부수입 30만, 환급 5만"
  },
  {
    v: "liquid_asset", icon: "💧", label: "💧 유동 자산↑", short: "비상금·CMA 모으기",
    taskType: "income", goalLike: true,
    detail: "비상금·CMA·파킹통장처럼 즉시 뺄 수 있는 곳에 새로 모으는 돈. 현금 영역이 늘고 순자산도 증가해요.",
    example: "비상금 50만 적립, 파킹통장 입금"
  },
  {
    v: "locked_asset", icon: "🔒", label: "🔒 묶인 자산↑(투자)", short: "ETF·적금·전세금",
    taskType: "invest", goalLike: true,
    detail: "ETF·주식 매수, 정기적금처럼 묶이는 자산으로 돈을 옮겨요. 현금에서 빠져 투자 영역으로 이동(순자산 총액은 그대로).",
    example: "ETF 25만 매수, 청년적금 30만"
  },
  {
    v: "debt_down", icon: "⚡", label: "⚡ 부채 상환", short: "대출·마통 갚기",
    taskType: "debt", goalLike: true,
    detail: "대출·마통·카드대출을 갚아요. 현금이 빠지고 그만큼 부채가 줄어요(순자산 총액은 그대로).",
    example: "마통 상환 16만, 대출 원금 상환"
  },
  {
    v: "debt_up_cash", icon: "🏦", label: "🏦 대출↑ (현금으로)", short: "현금 들어오는 대출",
    taskType: "income", goalLike: false,
    detail: "대출을 받아 현금이 들어와요. 현금이 늘지만 그만큼 부채도 늘어요(순자산 총액은 그대로).",
    example: "마통에서 100만 인출, 신용대출 수령"
  },
  {
    v: "debt_up_asset", icon: "🏠", label: "🏠 대출↑ (자산으로)", short: "전세대출·빚투",
    taskType: "invest", goalLike: false,
    detail: "대출금이 현금을 거치지 않고 바로 자산이 돼요(전세대출→전세금, 빚투). 투자가 늘고 부채도 늘어요(총액은 그대로).",
    example: "전세대출 2억(전세금), 신용대출로 주식"
  },
  {
    v: "expense", icon: "🔴", label: "🔴 지출/소비", short: "식비·여가·의료",
    taskType: "general", goalLike: false,
    detail: "식비, 여가, 의료, 구독료 등 소비한 돈. 현금에서 빠져나가고 순자산도 줄어요. 기본값이에요.",
    example: "식비 12만, 카페 5만, 구독 10,900"
  },
  {
    v: "neutral", icon: "⚪", label: "⚪ 중립", short: "계좌 간 이체",
    taskType: "general", goalLike: false,
    detail: "내 자산 안에서 위치만 옮기는 거래(통장↔통장, 환전). 총량 그대로라 순자산·현금·투자 어디에도 안 더해져요.",
    example: "자유입출금 → CMA 이체, 원화 → 달러"
  }
];

export const IMPACT_BY_KEY = Object.fromEntries(ASSET_TYPE_GUIDE.map((g) => [g.v, g]));

export default function AssetTypeGuideModal({ onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: "85vh", overflow: "auto" }}>
        <div className="modal-title">🏷 자산 종류 가이드</div>
        <div className="modal-sub">
          순자산 = 현금 + 투자 − 부채. 카테고리/거래에 어떤 영향인지 골라요. 헷갈리면 예시 참고.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {ASSET_TYPE_GUIDE.map((g) => (
            <div key={g.v} style={{
              padding: "10px 12px", borderRadius: 10,
              background: R.cream, border: `1px solid ${R.border}`
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{g.label}</div>
              <div style={{ fontSize: 11, color: R.textMid, marginTop: 4, lineHeight: 1.6 }}>{g.detail}</div>
              <div style={{ fontSize: 10, color: R.textLight, marginTop: 4 }}>예시: {g.example}</div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>알겠어요</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AssetTypeHelpButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none", background: "transparent",
        color: R.rose400, fontSize: 11, fontWeight: 600,
        cursor: "pointer", padding: "0 4px", fontFamily: "inherit"
      }}
      title="자산 종류가 뭔지 헷갈리면 클릭"
    >ℹ️ 가이드</button>
  );
}
