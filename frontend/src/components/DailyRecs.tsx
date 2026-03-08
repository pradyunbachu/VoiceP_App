/**
 * DailyRecs.jsx - Slide-out panel for daily meal recommendations.
 *
 * Fetches personalized meal ideas from the backend based on the user's
 * pantry contents, expiring items, and low-stock items. Clicking a meal
 * card opens a nested RecipeDetailPanel with full recipe details (fetched
 * on demand and cached in a ref to avoid redundant API calls).
 */
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, ShoppingCart, UtensilsCrossed, Loader, X, RefreshCw, Send } from 'lucide-react';
import { useDailyRecs, useRecipeDetail, useCookMeal, useCookStats } from '../hooks';
import RecipeDetailPanel from './RecipeDetailModal';
import type { MealSuggestion, ExpiringItem, LowStockItem, RecipeDetail, ShowToast, CookMealResponse } from '../types';
import './DailyRecs.css';

interface RecipeDetailResponse extends RecipeDetail {
  // RecipeDetail already includes description, servings, prep_minutes, cook_minutes,
  // and ingredients as (string | RecipeIngredient)[]
}

interface DailyRecsProps {
  showToast: ShowToast;
}

const DailyRecs: React.FC<DailyRecsProps> = ({ showToast }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [selectedMeal, setSelectedMeal] = useState<MealSuggestion | null>(null);
  const [cachedRecipe, setCachedRecipe] = useState<RecipeDetailResponse | null>(null);
  const [preference, setPreference] = useState<string>(() =>
    localStorage.getItem("voxal_dietary_preference") || ""
  );
  const [prefInput, setPrefInput] = useState<string>(() =>
    localStorage.getItem("voxal_dietary_preference") || ""
  );
  // In-memory recipe cache keyed by meal name to avoid re-fetching
  const recipeCacheRef = useRef<Record<string, RecipeDetailResponse>>({});
  const { data, isLoading, isError, isFetching, refreshRecs } = useDailyRecs(preference);
  const recipeDetail = useRecipeDetail();
  const cookMeal = useCookMeal();
  const { data: cookStats } = useCookStats();

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

  const handleRefresh = () => {
    recipeCacheRef.current = {};
    refreshRecs();
  };

  const handlePreferenceSubmit = () => {
    const trimmed = prefInput.trim();
    if (!trimmed || trimmed === preference) return;
    recipeCacheRef.current = {};
    setPreference(trimmed);
  };

  const handlePreferenceClear = () => {
    recipeCacheRef.current = {};
    setPreference('');
    setPrefInput('');
  };

  const closeRecipePanel = () => {
    setSelectedMeal(null);
    setCachedRecipe(null);
    recipeDetail.reset();
  };

  const handleCookMeal = (recipeName: string, ingredients: Array<{ item: string; amount: string }>) => {
    cookMeal.mutate(
      { recipe_name: recipeName, ingredients },
      {
        onSuccess: (result: CookMealResponse) => {
          const msg = result.expiring_items_saved > 0
            ? `You used ${result.expiring_items_saved} expiring item${result.expiring_items_saved > 1 ? 's' : ''} — $${result.estimated_savings} saved from the trash!`
            : `Recipe logged! ${result.deducted_count} pantry item${result.deducted_count !== 1 ? 's' : ''} updated.`;
          showToast(msg, 'celebration', 5000);
          setTimeout(closeRecipePanel, 300);
        },
        onError: () => {
          showToast("Couldn't log your meal.", 'error');
        },
      }
    );
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

        {/* Weekly cooking stats */}
        {cookStats && cookStats.week_meals_cooked > 0 && (
          <div className="daily-recs-cook-stats">
            <div className="cook-stat">
              <span className="cook-stat-value">{cookStats.week_meals_cooked}</span>
              <span className="cook-stat-label">meal{cookStats.week_meals_cooked !== 1 ? 's' : ''} this week</span>
            </div>
            {cookStats.week_estimated_savings > 0 && (
              <div className="cook-stat highlight">
                <span className="cook-stat-value">${cookStats.week_estimated_savings}</span>
                <span className="cook-stat-label">saved from waste</span>
              </div>
            )}
          </div>
        )}

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
        <UtensilsCrossed size={14} />
        <span className="daily-recs-toggle-label">Voxy's Picks</span>
        <ChevronLeft size={14} />
      </button>

      <AnimatePresence>
      {open && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            className="daily-recs-backdrop"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

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
                {hasContent && !isLoading && (
                  <button
                    className="daily-recs-refresh"
                    onClick={handleRefresh}
                    disabled={isFetching}
                    aria-label="Refresh recommendations"
                  >
                    <RefreshCw size={14} className={isFetching ? 'daily-recs-spinner' : ''} />
                  </button>
                )}
              </div>
              <button className="daily-recs-mobile-close" onClick={() => setOpen(false)} aria-label="Close recommendations">
                <X size={18} />
              </button>
            </div>

            <div className="daily-recs-preference-input">
              <input
                type="text"
                placeholder="e.g. Indian food, low carb, quick & easy..."
                value={prefInput}
                onChange={(e) => setPrefInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePreferenceSubmit(); }}
                disabled={isFetching}
              />
              <button
                className="preference-submit"
                onClick={handlePreferenceSubmit}
                disabled={isFetching || !prefInput.trim() || prefInput.trim() === preference}
                aria-label="Submit preference"
              >
                <Send size={14} />
              </button>
            </div>

            {preference && (
              <div className="preference-active-chip">
                <span>{preference}</span>
                <button onClick={handlePreferenceClear} aria-label="Clear preference" disabled={isFetching}>
                  <X size={12} />
                </button>
              </div>
            )}

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
                onCookMeal={handleCookMeal}
                isCooking={cookMeal.isPending}
                availableIngredients={data?.available_ingredients?.split(', ').filter(Boolean)}
                showToast={showToast}
              />
            )}
          </div>
        </>
      )}
      </AnimatePresence>
    </>
  );
};

export default DailyRecs;
