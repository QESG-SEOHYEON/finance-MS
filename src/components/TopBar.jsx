export default function TopBar({ breadcrumb, title, subtitle, right }) {
  return (
    <div className="topbar">
      <div className="topbar-breadcrumb">
        {breadcrumb.map((b, i) => (
          <span key={i}>
            {i > 0 && <span className="topbar-sep">/</span>}
            <span className={i === breadcrumb.length - 1 ? "active" : ""}>{b}</span>
          </span>
        ))}
      </div>
      <div className="topbar-main">
        <div>
          <h1 className="topbar-title">{title}</h1>
          {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
        </div>
        {right && <div className="topbar-right">{right}</div>}
      </div>
    </div>
  );
}
