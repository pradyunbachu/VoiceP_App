/**
 * Chef.tsx — Drag-and-drop recipe generator.
 *
 * Users pick ingredients from their pantry (left panel) by dragging or
 * clicking them into a "bowl" (right panel), then hit "Generate Recipes"
 * to get AI-powered recipe suggestions. Clicking a recipe card opens the
 * RecipeDetailPanel in a modal overlay; "I made this!" deducts pantry.
 */
import { useState, useRef, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { Search, X, Loader, UtensilsCrossed, Clock, Sparkles, Trash2 } from 'lucide-react';
import { usePantryItems, useChefSuggestions, useRecipeDetail, useCookMeal } from '../hooks';
import { DEMO_PANTRY_ITEMS } from '../constants/demoPantry';
import RecipeDetailPanel from './RecipeDetailModal';
import type { PantryItem, MealSuggestion, RecipeDetail, ShowToast, CookMealResponse } from '../types';
import './Chef.css';

// ── Sub-components ──────────────────────────────────────────────────────

interface DraggablePantryItemProps {
  item: PantryItem;
  inBowl: boolean;
  onAdd: (item: PantryItem) => void;
}

function DraggablePantryItem({ item, inBowl, onAdd }: DraggablePantryItemProps) {
  const isEmpty = (item.quantity ?? 0) <= 0 || item.stock_status === 'out_of_stock';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pantry-${item.id}`,
    data: { item },
    disabled: isEmpty,
  });

  return (
    <div
      ref={setNodeRef}
      className={`chef-pantry-item${inBowl ? ' in-bowl' : ''}${isDragging ? ' dragging' : ''}${isEmpty ? ' empty' : ''}`}
      onClick={() => !inBowl && !isEmpty && onAdd(item)}
      {...(isEmpty ? {} : listeners)}
      {...attributes}
    >
      <span className="chef-item-name">{item.name}</span>
      <span className="chef-item-qty">
        {item.quantity} {item.unit}
      </span>
    </div>
  );
}

function DroppableBowl({ children, isOver }: { children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: 'bowl' });

  return (
    <div ref={setNodeRef} className={`chef-bowl${isOver ? ' drag-over' : ''}`}>
      {children}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

interface ChefProps {
  showToast: ShowToast;
  selectedGroupId?: number | null | "demo";
}

interface RecipeDetailResponse extends RecipeDetail {}

const Chef: React.FC<ChefProps> = ({ showToast, selectedGroupId }) => {
  // State
  const [bowlItems, setBowlItems] = useState<PantryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMeal, setSelectedMeal] = useState<MealSuggestion | null>(null);
  const [cachedRecipe, setCachedRecipe] = useState<RecipeDetailResponse | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isOverBowl, setIsOverBowl] = useState(false);
  const recipeCacheRef = useRef<Record<string, RecipeDetailResponse>>({});

  const isDemoMode = selectedGroupId === "demo";
  const apiGroupId = isDemoMode ? undefined : (selectedGroupId ?? undefined);

  // Hooks
  const { data: pantryData, isLoading: pantryLoadingRaw } = usePantryItems({
    sort_by: 'category',
    group_id: apiGroupId as number | undefined,
  });
  const chefSuggestions = useChefSuggestions();
  const recipeDetail = useRecipeDetail();
  const cookMeal = useCookMeal();

  const pantryLoading = isDemoMode ? false : pantryLoadingRaw;

  // Sensors for dnd-kit
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, keyboardSensor);

  // Pantry items (non-paginated array)
  const pantryItems = useMemo(() => {
    if (isDemoMode) return DEMO_PANTRY_ITEMS;
    if (!pantryData || !Array.isArray(pantryData)) return [];
    return pantryData as PantryItem[];
  }, [pantryData, isDemoMode]);

  // Filtered pantry list
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return pantryItems;
    const q = searchQuery.toLowerCase();
    return pantryItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [pantryItems, searchQuery]);

  // Group by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, PantryItem[]> = {};
    for (const item of filteredItems) {
      const cat = item.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const bowlIds = useMemo(() => new Set(bowlItems.map((i) => i.id)), [bowlItems]);

  // Ingredient names for the bowl
  const bowlIngredientNames = useMemo(
    () => bowlItems.map((i) => i.name),
    [bowlItems]
  );

  // ── Non-cookable item detection ──

  const NON_COOKABLE = /\b(toilet paper|paper towel|napkin|tissue|trash bag|garbage bag|plastic wrap|aluminum foil|tin foil|sponge|dish soap|laundry detergent|fabric softener|bleach|cleaning|cleaner|disinfectant|wipe|hand soap|body wash|shampoo|conditioner|toothpaste|toothbrush|floss|mouthwash|deodorant|lotion|sunscreen|razor|bandaid|band-aid|medicine|vitamin|supplement|pet food|dog food|cat food|cat litter|light bulb|battery|candle|air freshener|detergent|dryer sheet|ziplock|ziploc|parchment|cling wrap|soap)\b/i;

  const isNonCookable = useCallback((name: string) => NON_COOKABLE.test(name), []);

  // ── Handlers ──

  const addToBowl = useCallback((item: PantryItem) => {
    if ((item.quantity ?? 0) <= 0 || item.stock_status === 'out_of_stock') return;
    if (isNonCookable(item.name)) {
      showToast(`"${item.name}" can't be used to make a meal`, 'warning');
      return;
    }
    setBowlItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev;
      return [...prev, item];
    });
  }, [isNonCookable, showToast]);

  const removeFromBowl = useCallback((itemId: number) => {
    setBowlItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const clearBowl = useCallback(() => {
    setBowlItems([]);
    chefSuggestions.reset();
  }, [chefSuggestions]);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: { over: { id: string | number } | null }) => {
    setIsOverBowl(event.over?.id === 'bowl');
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setIsOverBowl(false);
      if (event.over?.id === 'bowl' && event.active.data.current?.item) {
        addToBowl(event.active.data.current.item as PantryItem);
      }
    },
    [addToBowl]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setIsOverBowl(false);
  }, []);

  // Generate recipes
  const handleGenerate = useCallback(() => {
    if (bowlIngredientNames.length === 0) return;
    chefSuggestions.mutate({ ingredients: bowlIngredientNames });
  }, [bowlIngredientNames, chefSuggestions]);

  // Recipe detail flow (same as DailyRecs)
  const handleMealClick = useCallback(
    (meal: MealSuggestion) => {
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
          available_ingredients: bowlIngredientNames.join(', '),
        },
        {
          onSuccess: (result: RecipeDetail) => {
            recipeCacheRef.current[meal.name] = result as RecipeDetailResponse;
          },
        }
      );
    },
    [bowlIngredientNames, recipeDetail]
  );

  const closeRecipePanel = useCallback(() => {
    setSelectedMeal(null);
    setCachedRecipe(null);
    recipeDetail.reset();
  }, [recipeDetail]);

  const handleCookMeal = useCallback(
    (recipeName: string, ingredients: Array<{ item: string; amount: string }>) => {
      cookMeal.mutate(
        { recipe_name: recipeName, ingredients },
        {
          onSuccess: (result: CookMealResponse) => {
            const msg =
              result.expiring_items_saved > 0
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
    },
    [cookMeal, showToast, closeRecipePanel]
  );

  // Active drag item for overlay
  const activeDragItem = useMemo(() => {
    if (!activeDragId) return null;
    const numId = Number(activeDragId.replace('pantry-', ''));
    return pantryItems.find((i) => i.id === numId) || null;
  }, [activeDragId, pantryItems]);

  const meals = chefSuggestions.data?.meals || [];

  return (
    <div className="chef-view">
      <div className="chef-header">
        <h2>Chef</h2>
        <p>Drag ingredients into the bowl and discover recipes</p>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="chef-layout">
          {/* Left: Pantry items */}
          <div className="chef-pantry-panel">
            <h3>Your Pantry</h3>
            <input
              type="text"
              className="chef-search"
              placeholder="Search ingredients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {pantryLoading ? (
              <div className="chef-pantry-empty">
                <Loader size={18} className="chef-spinner" />
              </div>
            ) : pantryItems.length === 0 ? (
              <div className="chef-pantry-empty">
                Add items to your pantry to start cooking!
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="chef-pantry-empty">
                No items match "{searchQuery}"
              </div>
            ) : (
              <div className="chef-pantry-list">
                {groupedItems.map(([category, items]) => (
                  <div key={category} className="chef-category-group">
                    <div className="chef-category-label">{category}</div>
                    {items.map((item) => (
                      <DraggablePantryItem
                        key={item.id}
                        item={item}
                        inBowl={bowlIds.has(item.id)}
                        onAdd={addToBowl}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Bowl + Results */}
          <div className="chef-main-panel">
            <DroppableBowl isOver={isOverBowl}>
              <div className="chef-bowl-header">
                <span className="chef-bowl-title">
                  <Search size={14} />
                  Bowl
                  {bowlItems.length > 0 && (
                    <span className="chef-bowl-count">{bowlItems.length}</span>
                  )}
                </span>
              </div>

              {bowlItems.length === 0 ? (
                <div className="chef-bowl-empty">
                  Drag or click ingredients to add them here
                </div>
              ) : (
                <div className="chef-bowl-chips">
                  {bowlItems.map((item) => (
                    <span key={item.id} className="chef-bowl-chip">
                      {item.name}
                      <button onClick={() => removeFromBowl(item.id)} aria-label={`Remove ${item.name}`}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </DroppableBowl>

            {bowlItems.length > 0 && (
              <div className="chef-bowl-actions">
                <button className="chef-clear-btn" onClick={clearBowl}>
                  <Trash2 size={14} />
                  {' '}Clear All
                </button>
                <button
                  className="chef-generate-btn"
                  onClick={handleGenerate}
                  disabled={chefSuggestions.isPending}
                >
                  {chefSuggestions.isPending ? (
                    <Loader size={16} className="chef-spinner" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {chefSuggestions.isPending ? 'Generating...' : 'Generate Recipes'}
                </button>
              </div>
            )}

            {/* Loading — bowl with stirring spoon */}
            {chefSuggestions.isPending && (
              <div className="chef-loading">
                <div className="chef-loading-bowl">
                  <div className="chef-loading-spoon" />
                  <div className="chef-loading-bowl-rim" />
                  <div className="chef-loading-bowl-body">
                    <div className="chef-loading-bowl-liquid" />
                  </div>
                </div>
                <span className="chef-loading-text">Cooking up recipe ideas...</span>
              </div>
            )}

            {/* Error */}
            {chefSuggestions.isError && (
              <div className="chef-error">
                Couldn't generate recipes. Please try again.
              </div>
            )}

            {/* Results */}
            {meals.length > 0 && (
              <div className="chef-results">
                <span className="chef-results-title">Recipe Ideas</span>
                <div className="chef-meal-cards">
                  {meals.map((meal, i) => (
                    <div key={i} className="chef-meal-card" onClick={() => handleMealClick(meal)}>
                      <div className="chef-meal-icon">
                        <UtensilsCrossed size={16} />
                      </div>
                      <div className="chef-meal-content">
                        <span className="chef-meal-name">{meal.name}</span>
                        <span className="chef-meal-desc">{meal.description}</span>
                        <div className="chef-meal-meta">
                          {meal.time_minutes && (
                            <span className="chef-meal-time">
                              <Clock size={12} />
                              {meal.time_minutes} min
                            </span>
                          )}
                        </div>
                        {(meal.ingredients_used || meal.ingredients_needed) && (
                          <div className="chef-meal-ingredients-info">
                            {meal.ingredients_used?.map((ing, j) => (
                              <span key={`u-${j}`} className="chef-ingredient-tag">{ing}</span>
                            ))}
                            {meal.ingredients_needed?.map((ing, j) => (
                              <span key={`n-${j}`} className="chef-ingredient-tag needed">+{ing}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragItem ? (
            <div className="chef-drag-overlay">
              <span className="chef-item-name">{activeDragItem.name}</span>
              <span className="chef-item-qty">
                {activeDragItem.quantity} {activeDragItem.unit}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Recipe detail side panel (left) */}
      <div className={`chef-recipe-panel ${selectedMeal ? 'open' : ''}`}>
        {selectedMeal && (
          <RecipeDetailPanel
            recipe={cachedRecipe || (recipeDetail.data as RecipeDetailResponse | undefined)}
            isLoading={!cachedRecipe && recipeDetail.isPending}
            error={!cachedRecipe && recipeDetail.isError}
            onClose={closeRecipePanel}
            onCookMeal={handleCookMeal}
            isCooking={cookMeal.isPending}
          />
        )}
      </div>
      {selectedMeal && <div className="chef-recipe-backdrop" onClick={closeRecipePanel} />}
    </div>
  );
};

export default Chef;
