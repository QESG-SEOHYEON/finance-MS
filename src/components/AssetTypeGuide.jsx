import { createPortal } from "react-dom";

const R = {
  rose400: "#C08080", rose500: "#A66060", textDark: "#4A3535",
  textMid: "#7A6060", textLight: "#B8A9A3", cream: "#FAF5F3", border: "#EDE5E2"
};

export const ASSET_TYPE_GUIDE = [
  {
    v: "income",
    label: "💰 수입",
    short: "월급·부수입",
    detail: "월급, 부수입, 환급금, 이자 등 새로 들어오는 돈이에요. 통장 잔고가 늘고 순자산도 그만큼 증가해요.",
    example: "월급 300만, 부수입 30만, 환급 5만"
  },
  {
    v: "liquid_asset",
    label: "💧 유동 자산↑",
    short: "예적금·비상금",
    detail: "비상금 CMA, 자유입출금 적립처럼 즉시 빼서 쓸 수 있는 자산으로 돈이 들어가는 거예요. 현금 영역에 합산돼요.",
    example: "비상금 CMA 50만 적립, 파킹통장 적립"
  },
  {
    v: "locked_asset",
    label: "🔒 묶인 자산↑",
    short: "ETF·적금·전세금",
    detail: "ETF·주식 매수, 정기적금, 전세금 같이 자산은 늘지만 즉시 인출하긴 어려운 곳으로 돈이 들어가요. 투자 영역에 합산돼요.",
    example: "ETF 25만 매수, 청년적금 30만, 주식 매수"
  },
  {
    v: "debt_down",
    label: "⚡ 부채 감소",
    short: "대출·마통 상환",
    detail: "대출, 마통, 카드대출처럼 빚을 갚는 거예요. 부채가 줄어드니까 결과적으로 순자산이 늘어나요.",
    example: "마통 상환 16만, 대출 원금 상환"
  },
  {
    v: "expense",
    label: "🔴 지출/소비",
    short: "식비·여가·의료",
    detail: "식비, 여가, 의료, 구독료 등 소비한 돈. 통장에서 빠져나가고 순자산도 줄어요. 기본값이에요.",
    example: "식비 12만, 카페 5만, 구독 10,900"
  },
  {
    v: "neutral",
    label: "⚪ 중립",
    short: "계좌 간 이체",
    detail: "내 자산 안에서 위치만 옮기는 거래. 통장 A → 통장 B 이체나 환전처럼 총량은 그대로예요. 순자산·현금·투자 어디에도 안 더해져요.",
    example: "자유입출금 → CMA 이체, 원화 → 달러 환전"
  }
];

export default function AssetTypeGuideModal({ onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-title">🏷 자산 종류 가이드</div>
        <div className="modal-sub">
          카테고리/거래에 어떤 자산 영향이 있는지 6가지 중 골라요. 헷갈리면 아래 예시 참고.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {ASSET_TYPE_GUIDE.map((g) => (
            <div key={g.v} style={{
              padding: "10px 12px", borderRadius: 10,
              background: R.cream, border: `1px solid ${R.border}`
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: R.textDark }}>{g.label}</div>
              <div style={{ fontSize: 11, color: R.textMid, marginTop: 4, lineHeight: 1.6 }}>{g.detail}</div>
              <div style={{ fontSize: 10, color: R.textLight, marginTop: 4 }}>
                예시: {g.example}
              </div>
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
