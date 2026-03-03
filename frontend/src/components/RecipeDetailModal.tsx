/**
 * RecipeDetailModal.jsx - Panel displaying full recipe details.
 *
 * Shown inside the DailyRecs slide-out when a meal card is clicked.
 * Renders the recipe name, description, servings/timing metadata,
 * ingredient list, and step-by-step instructions. Handles loading
 * and error states while the AI generates the recipe.
 */
import { X, Clock, Users, Loader, ChevronLeft, Flame, ChefHat } from 'lucide-react';
import './RecipeDetailModal.css';

interface RecipeIngredient {
  amount: string;
  item: string;
}

interface NutritionInfo {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

interface RecipeData {
  name: string;
  description?: string;
  servings?: number;
  prep_minutes?: number;
  cook_minutes?: number;
  ingredients?: (string | RecipeIngredient)[];
  instructions?: string[];
  nutrition?: NutritionInfo;
}

interface Props {
  recipe: RecipeData | null | undefined;
  isLoading: boolean;
  error: boolean;
  onClose: () => void;
  onCookMeal?: (name: string, ingredients: Array<{ item: string; amount: string }>) => void;
  isCooking?: boolean;
}

const RecipeDetailPanel: React.FC<Props> = ({ recipe, isLoading, error, onClose, onCookMeal, isCooking }) => {
  const handleCookClick = () => {
    if (!recipe || !onCookMeal || isCooking) return;
    const ingredients = (recipe.ingredients || []).map((ing) => {
      if (typeof ing === 'string') return { item: ing, amount: '' };
      return { item: ing.item, amount: ing.amount };
    });
    onCookMeal(recipe.name, ingredients);
  };

  return (
    <>
      <div className="recipe-panel-header">
        <button className="recipe-back-btn" onClick={onClose}>
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>
        <button className="recipe-close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="recipe-panel-body">
        {isLoading && (
          <div className="recipe-loading">
            <Loader size={24} className="recipe-spinner" />
            <span>Voxy is writing up the full recipe...</span>
          </div>
        )}

        {error && (
          <div className="recipe-error">
            <span>Couldn't generate the recipe. Please try again.</span>
          </div>
        )}

        {!isLoading && !error && recipe && (
          <>
            <h3 className="recipe-name">{recipe.name}</h3>
            <p className="recipe-description">{recipe.description}</p>

            <div className="recipe-meta">
              {recipe.servings && (
                <span className="recipe-meta-item">
                  <Users size={14} />
                  {recipe.servings} servings
                </span>
              )}
              {recipe.prep_minutes && (
                <span className="recipe-meta-item">
                  <Clock size={14} />
                  Prep: {recipe.prep_minutes}m
                </span>
              )}
              {recipe.cook_minutes && (
                <span className="recipe-meta-item">
                  <Clock size={14} />
                  Cook: {recipe.cook_minutes}m
                </span>
              )}
            </div>

            {recipe.nutrition && (
              <div className="recipe-section">
                <h4>Nutrition (per serving)</h4>
                <div className="recipe-nutrition-grid">
                  <div className="recipe-nutrition-item recipe-nutrition-calories">
                    <Flame size={16} />
                    <span className="recipe-nutrition-value">{recipe.nutrition.calories}</span>
                    <span className="recipe-nutrition-label">Calories</span>
                  </div>
                  <div className="recipe-nutrition-item">
                    <span className="recipe-nutrition-value">{recipe.nutrition.protein_g}g</span>
                    <span className="recipe-nutrition-label">Protein</span>
                  </div>
                  <div className="recipe-nutrition-item">
                    <span className="recipe-nutrition-value">{recipe.nutrition.carbs_g}g</span>
                    <span className="recipe-nutrition-label">Carbs</span>
                  </div>
                  <div className="recipe-nutrition-item">
                    <span className="recipe-nutrition-value">{recipe.nutrition.fat_g}g</span>
                    <span className="recipe-nutrition-label">Fat</span>
                  </div>
                  <div className="recipe-nutrition-item">
                    <span className="recipe-nutrition-value">{recipe.nutrition.fiber_g}g</span>
                    <span className="recipe-nutrition-label">Fiber</span>
                  </div>
                  <div className="recipe-nutrition-item">
                    <span className="recipe-nutrition-value">{recipe.nutrition.sugar_g}g</span>
                    <span className="recipe-nutrition-label">Sugar</span>
                  </div>
                  <div className="recipe-nutrition-item">
                    <span className="recipe-nutrition-value">{recipe.nutrition.sodium_mg}mg</span>
                    <span className="recipe-nutrition-label">Sodium</span>
                  </div>
                </div>
              </div>
            )}

            <div className="recipe-section">
              <h4>Ingredients</h4>
              <ul className="recipe-ingredients">
                {recipe.ingredients?.map((ing: string | RecipeIngredient, i: number) => (
                  <li key={i}>
                    {typeof ing === 'string' ? (
                      <span className="ingredient-item">{ing}</span>
                    ) : (
                      <>
                        <span className="ingredient-amount">{ing.amount}</span>
                        <span className="ingredient-item">{ing.item}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="recipe-section">
              <h4>Instructions</h4>
              <ol className="recipe-instructions">
                {recipe.instructions?.map((step: string, i: number) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>

            {onCookMeal && (
              <div className="recipe-cook-action">
                <button
                  className="recipe-cook-btn"
                  onClick={handleCookClick}
                  disabled={isCooking}
                >
                  {isCooking ? (
                    <Loader size={16} className="recipe-spinner" />
                  ) : (
                    <ChefHat size={16} />
                  )}
                  {isCooking ? 'Logging...' : 'I made this!'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default RecipeDetailPanel;
