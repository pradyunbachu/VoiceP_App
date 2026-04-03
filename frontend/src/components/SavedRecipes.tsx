/**
 * SavedRecipes.tsx — Browsable list of saved/favorited recipes.
 *
 * Displays all recipes the user has saved via the Heart button in
 * RecipeDetailPanel. Clicking a recipe opens the detail panel on the right.
 */
import { useState, useCallback, useRef } from 'react';
import { Heart, Clock, Users, UtensilsCrossed, Trash2, Loader } from 'lucide-react';
import { useSavedRecipes, useDeleteSavedRecipe, useRecipeDetail, useCookMeal } from '../hooks';
import RecipeDetailPanel from './RecipeDetailModal';
import type { SavedRecipe } from '../hooks/mutations/useSavedRecipes';
import type { RecipeDetail, CookMealResponse, ShowToast } from '../types';
import './SavedRecipes.css';

interface Props {
  showToast: ShowToast;
  selectedPantryGroup?: number | null | 'demo';
}

const SavedRecipes: React.FC<Props> = ({ showToast, selectedPantryGroup }) => {
  const { data, isLoading } = useSavedRecipes();
  const deleteSaved = useDeleteSavedRecipe();
  const recipeDetail = useRecipeDetail();
  const cookMeal = useCookMeal();
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const recipeCacheRef = useRef<Record<string, RecipeDetail>>({});

  const groupId = selectedPantryGroup === 'demo' ? undefined : (selectedPantryGroup ?? undefined) as number | undefined;
  const recipes = data?.recipes ?? [];

  const handleRecipeClick = useCallback((recipe: SavedRecipe) => {
    setSelectedRecipe(recipe);
    // Saved recipes already have full data — use directly as cached
    recipeCacheRef.current[recipe.name] = recipe;
  }, []);

  const closePanel = useCallback(() => {
    setSelectedRecipe(null);
    recipeDetail.reset();
  }, [recipeDetail]);

  const handleRemove = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setRemovingId(id);
    deleteSaved.mutate(id, {
      onSuccess: () => {
        if (selectedRecipe?.id === id) closePanel();
        setRemovingId(null);
      },
      onError: () => {
        setRemovingId(null);
      },
    });
  }, [deleteSaved, selectedRecipe, closePanel]);

  const handleCookMeal = useCallback(
    (recipeName: string, ingredients: Array<{ item: string; amount: string }>) => {
      cookMeal.mutate(
        { recipe_name: recipeName, ingredients, group_id: groupId },
        {
          onSuccess: (result: CookMealResponse) => {
            const msg =
              result.expiring_items_saved > 0
                ? `You used ${result.expiring_items_saved} expiring item${result.expiring_items_saved > 1 ? 's' : ''} — $${result.estimated_savings} saved from the trash!`
                : `Recipe logged! ${result.deducted_count} pantry item${result.deducted_count !== 1 ? 's' : ''} updated.`;
            showToast(msg, 'celebration', 5000);
            setTimeout(closePanel, 300);
          },
          onError: () => showToast("Couldn't log your meal.", 'error'),
        }
      );
    },
    [cookMeal, groupId, showToast, closePanel]
  );

  return (
    <div className="saved-recipes">
      <div className="sr-header">
        <Heart size={22} />
        <h2>Saved Recipes</h2>
        {recipes.length > 0 && (
          <span className="sr-count">{recipes.length}</span>
        )}
      </div>

      {isLoading ? (
        <div className="sr-loading">
          <Loader size={20} className="sr-spin" />
          <span>Loading saved recipes...</span>
        </div>
      ) : recipes.length === 0 ? (
        <div className="sr-empty">
          <Heart size={32} strokeWidth={1.5} />
          <h3>No saved recipes yet</h3>
          <p>When you find a recipe you love, tap the heart to save it here for quick access</p>
        </div>
      ) : (
        <div className="sr-grid">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className={`sr-card${selectedRecipe?.id === recipe.id ? ' sr-card--active' : ''}`}
              onClick={() => handleRecipeClick(recipe)}
            >
              <div className="sr-card-top">
                <UtensilsCrossed size={16} className="sr-card-icon" />
                <button
                  className="sr-card-remove"
                  onClick={(e) => handleRemove(e, recipe.id)}
                  disabled={removingId === recipe.id}
                  aria-label={`Remove ${recipe.name}`}
                >
                  {removingId === recipe.id ? (
                    <Loader size={12} className="sr-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                </button>
              </div>
              <span className="sr-card-name">{recipe.name}</span>
              {recipe.description && (
                <span className="sr-card-desc">{recipe.description}</span>
              )}
              <div className="sr-card-meta">
                {recipe.prep_minutes && (
                  <span className="sr-card-tag">
                    <Clock size={11} />
                    {recipe.prep_minutes + (recipe.cook_minutes ?? 0)}m
                  </span>
                )}
                {recipe.servings && (
                  <span className="sr-card-tag">
                    <Users size={11} />
                    {recipe.servings}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recipe detail slide-out panel */}
      <div className={`sr-recipe-panel ${selectedRecipe ? 'open' : ''}`}>
        {selectedRecipe && (
          <RecipeDetailPanel
            recipe={recipeCacheRef.current[selectedRecipe.name] || selectedRecipe}
            isLoading={false}
            error={false}
            onClose={closePanel}
            onCookMeal={handleCookMeal}
            isCooking={cookMeal.isPending}
            showToast={showToast}
          />
        )}
      </div>
      {selectedRecipe && <div className="sr-backdrop" onClick={closePanel} />}
    </div>
  );
};

export default SavedRecipes;
