import { useState, useEffect } from 'react';
import { X, Sparkles, ChevronLeft, ChevronRight, Clock, AlertTriangle, ShoppingCart, UtensilsCrossed, Loader } from 'lucide-react';
import { useDailyRecs } from '../hooks';
import './DailyRecs.css';

const DISMISS_KEY = 'voxy_daily_recs_dismissed';

const isDismissedToday = () => {
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const dismissedDate = new Date(dismissed).toDateString();
  const today = new Date().toDateString();
  return dismissedDate === today;
};

const DailyRecs = () => {
  const [dismissed, setDismissed] = useState(isDismissedToday);
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useDailyRecs();

  useEffect(() => {
    setDismissed(isDismissedToday());
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  if (dismissed) return null;

  const meals = data?.meals || [];
  const low_stock = data?.low_stock || [];
  const expiring = data?.expiring || [];
  const pantry_count = data?.pantry_count || 0;
  const greeting = data?.greeting || '';
  const hasContent = meals.length > 0 || low_stock.length > 0 || expiring.length > 0;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setOpen(false);
    setDismissed(true);
  };

  const renderPanelContent = () => {
    if (isLoading) {
      return (
        <div className="daily-recs-empty">
          <Loader size={20} className="daily-recs-spinner" />
          <span>Getting your recommendations...</span>
        </div>
      );
    }

    if (isError || !data) {
      return (
        <div className="daily-recs-empty">
          <span>Couldn't load recommendations right now.</span>
        </div>
      );
    }

    if (!pantry_count) {
      return (
        <div className="daily-recs-empty">
          <span>Add items to your pantry to get personalized meal ideas!</span>
        </div>
      );
    }

    if (!hasContent) {
      return (
        <div className="daily-recs-empty">
          <span>No recommendations right now. Check back later!</span>
        </div>
      );
    }

    return (
      <>
        <p className="daily-recs-greeting">{greeting}</p>

        {meals.length > 0 && (
          <div className="daily-recs-meals">
            {meals.map((meal, i) => (
              <div key={i} className="meal-card">
                <div className="meal-card-icon">
                  <UtensilsCrossed size={16} />
                </div>
                <div className="meal-card-content">
                  <span className="meal-card-name">{meal.name}</span>
                  <span className="meal-card-desc">{meal.description}</span>
                  {meal.time_minutes && (
                    <span className="meal-card-time">
                      <Clock size={12} />
                      {meal.time_minutes} min
                    </span>
                  )}
                </div>
                {meal.uses_expiring && (
                  <span className="meal-card-badge">Uses expiring</span>
                )}
              </div>
            ))}
          </div>
        )}

        {(low_stock.length > 0 || expiring.length > 0) && (
          <div className="daily-recs-alerts">
            {expiring.length > 0 && (
              <div className="alert-group">
                <span className="alert-label">
                  <AlertTriangle size={12} />
                  Expiring soon
                </span>
                <div className="alert-chips">
                  {expiring.map((item, i) => (
                    <span key={i} className="alert-chip expiring">
                      {item.name}
                      <span className="chip-detail">
                        {item.days_left === 0 ? 'today' : item.days_left === 1 ? '1d' : `${item.days_left}d`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {low_stock.length > 0 && (
              <div className="alert-group">
                <span className="alert-label">
                  <ShoppingCart size={12} />
                  Running low
                </span>
                <div className="alert-chips">
                  {low_stock.map((item, i) => (
                    <span key={i} className={`alert-chip ${item.status === 'out_of_stock' ? 'out' : 'low'}`}>
                      {item.name}
                      {item.status === 'out_of_stock' && <span className="chip-detail">out</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <button
        className={`daily-recs-toggle ${open ? 'hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open daily recommendations"
      >
        <ChevronLeft size={18} />
      </button>

      {open && (
        <div className="daily-recs-backdrop" onClick={() => setOpen(false)} />
      )}

      <button
        className={`daily-recs-toggle close ${open ? '' : 'hidden'}`}
        onClick={() => setOpen(false)}
        aria-label="Close daily recommendations"
      >
        <ChevronRight size={18} />
      </button>

      <div className={`daily-recs-panel ${open ? 'open' : ''}`}>
        <div className="daily-recs-panel-header">
          <div className="daily-recs-title">
            <span>Voxy's Recommendations</span>
          </div>
        </div>

        {renderPanelContent()}
      </div>
    </>
  );
};

export default DailyRecs;
