import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, ShoppingCart, UtensilsCrossed, Loader, X } from 'lucide-react';
import { useDailyRecs, useRecipeDetail } from '../hooks';
import RecipeDetailPanel from './RecipeDetailModal';
import './DailyRecs.css';

const DailyRecs = () => {
  const [open, setOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [cachedRecipe, setCachedRecipe] = useState(null);
  const recipeCacheRef = useRef({});
  const { data, isLoading, isError } = useDailyRecs();
  const recipeDetail = useRecipeDetail();

  const recipeOpen = !!selectedMeal;

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (recipeOpen) {
          setSelectedMeal(null);
          recipeDetail.reset();
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, recipeOpen]);

  const meals = data?.meals || [];
  const low_stock = data?.low_stock || [];
  const expiring = data?.expiring || [];
  const pantry_count = data?.pantry_count || 0;
  const greeting = data?.greeting || '';
  const hasContent = meals.length > 0 || low_stock.length > 0 || expiring.length > 0;

  const handleMealClick = (meal) => {
    setSelectedMeal(meal);

    const cached = recipeCacheRef.current[meal.name];
    if (cached) {
      setCachedRecipe(cached);
      recipeDetail.reset();
      return;
    }

    setCachedRecipe(null);
    recipeDetail.reset();
    recipeDetail.mutate(
      {
        meal_name: meal.name,
        meal_description: meal.description,
        available_ingredients: data?.available_ingredients || '',
      },
      {
        onSuccess: (result) => {
          recipeCacheRef.current[meal.name] = result;
        },
      }
    );
  };

  const closeRecipePanel = () => {
    setSelectedMeal(null);
    setCachedRecipe(null);
    recipeDetail.reset();
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
              <div key={i} className="meal-card" onClick={() => handleMealClick(meal)}>
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
                        {item.expiration_predicted ? '~' : ''}{item.days_left === 0 ? 'today' : item.days_left === 1 ? '1d' : `${item.days_left}d`}
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
        data-tutorial="daily-recs-toggle"
      >
        <ChevronLeft size={18} />
      </button>

      {open && (
        <>
          <div className="daily-recs-backdrop" onClick={() => setOpen(false)} />

          <button
            className={`daily-recs-toggle close ${recipeOpen ? 'recipe-shifted' : ''}`}
            onClick={() => setOpen(false)}
            aria-label="Close daily recommendations"
          >
            <ChevronRight size={18} />
          </button>

          <div className={`daily-recs-panel open ${recipeOpen ? 'recipe-shifted' : ''}`}>
            <div className="daily-recs-panel-header">
              <div className="daily-recs-title">
                <span>Voxy's Recommendations</span>
              </div>
              <button className="daily-recs-mobile-close" onClick={() => setOpen(false)} aria-label="Close recommendations">
                <X size={18} />
              </button>
            </div>

            {renderPanelContent()}
          </div>

          <div className={`recipe-panel ${recipeOpen ? 'open' : ''}`}>
            {recipeOpen && (
              <RecipeDetailPanel
                recipe={cachedRecipe || recipeDetail.data}
                isLoading={!cachedRecipe && recipeDetail.isPending}
                error={!cachedRecipe && recipeDetail.isError}
                onClose={closeRecipePanel}
              />
            )}
          </div>
        </>
      )}
    </>
  );
};

export default DailyRecs;
