/**
 * DailyRecs.jsx - Slide-out panel for daily meal recommendations.
 *
 * Fetches personalized meal ideas from the backend based on the user's
 * pantry contents, expiring items, and low-stock items. Clicking a meal
 * card opens a nested RecipeDetailPanel with full recipe details (fetched
 * on demand and cached in a ref to avoid redundant API calls).
 */
import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, ShoppingCart, UtensilsCrossed, Loader, X } from 'lucide-react';
import { useDailyRecs, useRecipeDetail } from '../hooks';
import RecipeDetailPanel from './RecipeDetailModal';
import type { MealSuggestion, ExpiringItem, LowStockItem, RecipeDetail, DailyRecs as DailyRecsType } from '../types';
import './DailyRecs.css';

interface RecipeDetailResponse extends RecipeDetail {
  // RecipeDetail already includes description, servings, prep_minutes, cook_minutes,
  // and ingredients as (string | RecipeIngredient)[]
}

const DailyRecs: React.FC = () => {
  const [open, setOpen] = useState<boolean>(false);
  const [selectedMeal, setSelectedMeal] = useState<MealSuggestion | null>(null);
  const [cachedRecipe, setCachedRecipe] = useState<RecipeDetailResponse | null>(null);
  // In-memory recipe cache keyed by meal name to avoid re-fetching
  const recipeCacheRef = useRef<Record<string, RecipeDetailResponse>>({});
  const { data, isLoading, isError } = useDailyRecs();
  const recipeDetail = useRecipeDetail();

  const recipeOpen = !!selectedMeal;

  // Close panels on Escape: recipe panel first, then recommendations panel
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
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

  // Fetch full recipe details when a meal card is clicked.
  // Serves from the in-memory cache if available to avoid redundant AI calls.
  const handleMealClick = (meal: MealSuggestion) => {
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
        onSuccess: (result: RecipeDetail) => {
          recipeCacheRef.current[meal.name] = result as RecipeDetailResponse;
        },
      }
    );
  };

  const closeRecipePanel = () => {
    setSelectedMeal(null);
    setCachedRecipe(null);
    recipeDetail.reset();
  };

  // Render the main panel body based on loading/error/empty states
  const renderPanelContent = (): React.ReactNode => {
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

        {/* Meal suggestion cards */}
        {meals.length > 0 && (
          <div className="daily-recs-meals">
            {meals.map((meal: MealSuggestion, i: number) => (
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

        {/* Expiring and low-stock alert chips */}
        {(low_stock.length > 0 || expiring.length > 0) && (
          <div className="daily-recs-alerts">
            {expiring.length > 0 && (
              <div className="alert-group">
                <span className="alert-label">
                  <AlertTriangle size={12} />
                  Expiring soon
                </span>
                <div className="alert-chips">
                  {expiring.map((item: ExpiringItem, i: number) => (
                    <span key={i} className="alert-chip expiring">
                      {item.name}
                      <span className="chip-detail">
                        {/* Tilde prefix indicates the date was estimated, not user-provided */}
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
                  {low_stock.map((item: LowStockItem, i: number) => (
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
      {/* Toggle button to open the slide-out panel */}
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
          {/* Backdrop overlay */}
          <div className="daily-recs-backdrop" onClick={() => setOpen(false)} />

          <button
            className={`daily-recs-toggle close ${recipeOpen ? 'recipe-shifted' : ''}`}
            onClick={() => setOpen(false)}
            aria-label="Close daily recommendations"
          >
            <ChevronRight size={18} />
          </button>

          {/* Main recommendations panel -- shifts left when recipe panel is open */}
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

          {/* Nested recipe detail panel */}
          <div className={`recipe-panel ${recipeOpen ? 'open' : ''}`}>
            {recipeOpen && (
              <RecipeDetailPanel
                recipe={cachedRecipe || (recipeDetail.data as RecipeDetailResponse | undefined)}
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
