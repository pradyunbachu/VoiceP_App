import "./LoadingSkeleton.css";

const LoadingSkeleton = ({ type = "card", count = 1 }) => {
  const skeletons = Array(count).fill(0);

  if (type === "card") {
    return (
      <>
        {skeletons.map((_, index) => (
          <div key={index} className="skeleton-card">
            <div className="skeleton-line skeleton-title"></div>
            <div className="skeleton-line skeleton-text"></div>
            <div className="skeleton-line skeleton-text short"></div>
          </div>
        ))}
      </>
    );
  }

  if (type === "list") {
    return (
      <>
        {skeletons.map((_, index) => (
          <div key={index} className="skeleton-list-item">
            <div className="skeleton-line skeleton-title"></div>
            <div className="skeleton-line skeleton-text"></div>
          </div>
        ))}
      </>
    );
  }

  if (type === "chart") {
    return (
      <div className="skeleton-chart">
        <div className="skeleton-line skeleton-title"></div>
        <div className="skeleton-bars">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="skeleton-bar" style={{ height: `${Math.random() * 60 + 40}%` }}></div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default LoadingSkeleton;

