/**
 * RecipeDetailModal.jsx - Panel displaying full recipe details.
 *
 * Shown inside the DailyRecs slide-out when a meal card is clicked.
 * Renders the recipe name, description, servings/timing metadata,
 * ingredient list, and step-by-step instructions. Handles loading
 * and error states while the AI generates the recipe.
 */
import { X, Clock, Users, Loader, ChevronLeft } from 'lucide-react';
import './RecipeDetailModal.css';

const RecipeDetailPanel = ({ recipe, isLoading, error, onClose }) => {
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

            <div className="recipe-section">
              <h4>Ingredients</h4>
              <ul className="recipe-ingredients">
                {recipe.ingredients?.map((ing, i) => (
                  <li key={i}>
                    <span className="ingredient-amount">{ing.amount}</span>
                    <span className="ingredient-item">{ing.item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="recipe-section">
              <h4>Instructions</h4>
              <ol className="recipe-instructions">
                {recipe.instructions?.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default RecipeDetailPanel;
