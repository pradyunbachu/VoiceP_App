/**
 * RecipeDetailModal.jsx - Panel displaying full recipe details.
 *
 * Shown inside the DailyRecs slide-out when a meal card is clicked.
 * Renders the recipe name, description, servings/timing metadata,
 * ingredient list, and step-by-step instructions. Handles loading
 * and error states while the AI generates the recipe.
 */
import { useState } from 'react';
import { X, Clock, Users, Loader, ChevronLeft, Flame, ChefHat, ShoppingCart, Check, Play, Heart } from 'lucide-react';
import { useCreateShoppingListItem, useSaveRecipe, useSavedRecipes, useDeleteSavedRecipe } from '../hooks';
import CookingMode from './CookingMode';
import type { ShowToast } from '../types';
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
  /** Ingredient names the user already has in their pantry/bowl */
  availableIngredients?: string[];
  showToast?: ShowToast;
}

const RecipeDetailPanel: React.FC<Props> = ({ recipe, isLoading, error, onClose, onCookMeal, isCooking, availableIngredients, showToast }) => {
  const createShoppingItem = useCreateShoppingListItem();
  const saveRecipe = useSaveRecipe();
  const deleteSavedRecipe = useDeleteSavedRecipe();
  const { data: savedData } = useSavedRecipes();
  const [addedToList, setAddedToList] = useState(false);
  const [cookingModeOpen, setCookingModeOpen] = useState(false);

  // Check if current recipe is already saved
  const savedEntry = savedData?.recipes?.find(
    (r) => r.name === recipe?.name
  );
  const isSaved = !!savedEntry;

  const handleToggleSave = () => {
    if (!recipe) return;
    if (isSaved && savedEntry) {
      deleteSavedRecipe.mutate(savedEntry.id, {
        onSuccess: () => showToast?.('Recipe removed from saved', 'info', 3000),
      });
    } else {
      saveRecipe.mutate({ ...recipe, instructions: recipe.instructions || [], ingredients: recipe.ingredients || [] } as import('../types').RecipeDetail, {
        onSuccess: () => showToast?.('Recipe saved!', 'success', 3000),
        onError: (err) => {
          if (err.message === 'Already saved') {
            showToast?.('Recipe already saved', 'info', 3000);
          } else {
            showToast?.('Failed to save recipe', 'error', 3000);
          }
        },
      });
    }
  };

  const handleCookClick = () => {
    if (!recipe || !onCookMeal || isCooking) return;
    const ingredients = (recipe.ingredients || []).map((ing) => {
      if (typeof ing === 'string') return { item: ing, amount: '' };
      return { item: ing.item, amount: ing.amount };
    });
    onCookMeal(recipe.name, ingredients);
  };

  // Determine which recipe ingredients the user doesn't already have
  const missingIngredients = recipe?.ingredients?.filter((ing) => {
    const name = typeof ing === 'string' ? ing : ing.item;
    if (!availableIngredients || availableIngredients.length === 0) return true;
    const lower = name.toLowerCase();
    return !availableIngredients.some(
      (avail) => lower.includes(avail.toLowerCase()) || avail.toLowerCase().includes(lower)
    );
  }) || [];

  const handleAddToShoppingList = async () => {
    if (missingIngredients.length === 0 || addedToList) return;
    try {
      await Promise.all(
        missingIngredients.map((ing) => {
          const name = typeof ing === 'string' ? ing : `${ing.amount} ${ing.item}`.trim();
          return createShoppingItem.mutateAsync({
            name,
            quantity: 1,
            unit: '',
            category: '',
            notes: recipe?.name ? `For: ${recipe.name}` : '',
          });
        })
      );
      setAddedToList(true);
      if (showToast) {
        showToast(
          `${missingIngredients.length} ingredient${missingIngredients.length !== 1 ? 's' : ''} added to shopping list`,
          'success'
        );
      }
    } catch {
      if (showToast) showToast('Failed to add items to shopping list', 'error');
    }
  };

  return (
    <>
      {cookingModeOpen && recipe && onCookMeal && (
        <CookingMode
          recipe={recipe}
          onCookMeal={(name, ingredients) => {
            onCookMeal(name, ingredients);
            setCookingModeOpen(false);
          }}
          isCooking={isCooking || false}
          onClose={() => setCookingModeOpen(false)}
          showToast={showToast}
        />
      )}
      <div className="recipe-panel-header">
        <button className="recipe-back-btn" onClick={onClose}>
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>
        <div className="recipe-header-actions">
          {recipe && !isLoading && !error && (
            <button
              className={`recipe-save-btn${isSaved ? ' saved' : ''}`}
              onClick={handleToggleSave}
              disabled={saveRecipe.isPending || deleteSavedRecipe.isPending}
              aria-label={isSaved ? 'Remove from saved' : 'Save recipe'}
            >
              <Heart size={18} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          )}
          <button className="recipe-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
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

            {/* Start Cooking — hands-free mode */}
            {recipe.instructions && recipe.instructions.length > 0 && onCookMeal && (
              <div className="recipe-cooking-action">
                <button
                  className="recipe-start-cooking-btn"
                  onClick={() => setCookingModeOpen(true)}
                >
                  <Play size={16} />
                  Start Cooking
                </button>
              </div>
            )}

            {/* Add missing ingredients to shopping list */}
            {missingIngredients.length > 0 && (
              <div className="recipe-shopping-action">
                <button
                  className={`recipe-shopping-btn${addedToList ? ' added' : ''}`}
                  onClick={handleAddToShoppingList}
                  disabled={addedToList || createShoppingItem.isPending}
                >
                  {createShoppingItem.isPending ? (
                    <Loader size={16} className="recipe-spinner" />
                  ) : addedToList ? (
                    <Check size={16} />
                  ) : (
                    <ShoppingCart size={16} />
                  )}
                  {createShoppingItem.isPending
                    ? 'Adding...'
                    : addedToList
                      ? 'Added to shopping list'
                      : `Add ${missingIngredients.length} missing ingredient${missingIngredients.length !== 1 ? 's' : ''} to list`}
                </button>
              </div>
            )}

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
