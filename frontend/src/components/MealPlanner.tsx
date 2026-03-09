/**
 * MealPlanner.tsx — Weekly meal planning grid.
 *
 * Displays a 7-day x 3-slot grid (breakfast/lunch/dinner) where users can
 * add meals manually or generate a full week via AI. Shows missing ingredients
 * and lets users push them to the shopping list in one click.
 */
import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShoppingCart,
  Plus,
  X,
  Clock,
  Trash2,
  Loader2,
  Check,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  useMealPlan,
  useCreatePlannedMeal,
  useDeletePlannedMeal,
  useGenerateMealPlan,
  useAddMealPlanToShoppingList,
  useReplaceMeal,
  useSwapMeals,
} from '../hooks';
import MixingBowlLoader from './MixingBowlLoader';
import type {
  ShowToast,
  PlannedMeal,
  DayOfWeek,
  MealSlot,
  MissingIngredient,
} from '../types';
import './MealPlanner.css';

// ── Helpers ──────────────────────────────────────────────────────────

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
};

/** Get the Monday of the week containing `date`. */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatWeekRange(monday: Date): string {
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}, ${monday.getFullYear()}`;
}

function getDayDate(monday: Date, day: DayOfWeek): string {
  const idx = DAYS.indexOf(day);
  const d = new Date(monday);
  d.setDate(d.getDate() + idx);
  return d.getDate().toString();
}

function isToday(monday: Date, day: DayOfWeek): boolean {
  const idx = DAYS.indexOf(day);
  const d = new Date(monday);
  d.setDate(d.getDate() + idx);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

// ── Component ────────────────────────────────────────────────────────

interface Props {
  showToast: ShowToast;
  selectedPantryGroup?: number | null | 'demo';
}

interface AddMealForm {
  day: DayOfWeek;
  slot: MealSlot;
}

const MealPlanner: React.FC<Props> = ({ showToast, selectedPantryGroup }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [addForm, setAddForm] = useState<AddMealForm | null>(null);
  const [recipeName, setRecipeName] = useState('');
  const [mobileDay, setMobileDay] = useState<DayOfWeek>(() => {
    const today = new Date().getDay();
    return DAYS[today === 0 ? 6 : today - 1];
  });
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [dragSource, setDragSource] = useState<{ day: DayOfWeek; slot: MealSlot } | null>(null);
  const [dragOver, setDragOver] = useState<{ day: DayOfWeek; slot: MealSlot } | null>(null);
  const dragDataRef = useRef<{ day: DayOfWeek; slot: MealSlot } | null>(null);

  const monday = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const weekStart = formatDate(monday);
  const groupId = selectedPantryGroup === 'demo' ? undefined : (selectedPantryGroup ?? undefined) as number | undefined;

  // ── Data ──────────────────────────────────────────
  const { data: plan, isLoading } = useMealPlan(weekStart, groupId);
  const createMeal = useCreatePlannedMeal();
  const deleteMeal = useDeletePlannedMeal();
  const generatePlan = useGenerateMealPlan();
  const addToShopping = useAddMealPlanToShoppingList();
  const replaceMeal = useReplaceMeal();
  const swapMeals = useSwapMeals();

  const meals = plan?.meals ?? [];
  const missingSummary: MissingIngredient[] = plan?.shopping_summary ?? [];

  // Build lookup: day-slot → PlannedMeal
  const mealMap = useMemo(() => {
    const map = new Map<string, PlannedMeal>();
    for (const m of meals) {
      map.set(`${m.day}-${m.slot}`, m);
    }
    return map;
  }, [meals]);

  // ── Actions ───────────────────────────────────────
  const handleAddMeal = useCallback(async () => {
    if (!addForm || !recipeName.trim()) return;
    try {
      await createMeal.mutateAsync({
        day: addForm.day,
        slot: addForm.slot,
        recipe_name: recipeName.trim(),
        week_start: weekStart,
      });
      showToast('Meal added to plan', 'success');
      setAddForm(null);
      setRecipeName('');
    } catch {
      showToast('Failed to add meal', 'error');
    }
  }, [addForm, recipeName, weekStart, createMeal, showToast]);

  const handleDeleteMeal = useCallback(async (id: number) => {
    try {
      await deleteMeal.mutateAsync(id);
      showToast('Meal removed', 'info');
    } catch {
      showToast('Failed to remove meal', 'error');
    }
  }, [deleteMeal, showToast]);

  const handleGenerate = useCallback(async () => {
    try {
      await generatePlan.mutateAsync({ week_start: weekStart, group_id: groupId });
      showToast('Meal plan generated!', 'success');
    } catch {
      showToast('Failed to generate meal plan', 'error');
    }
  }, [generatePlan, weekStart, groupId, showToast]);

  const handleAddToShoppingList = useCallback(async () => {
    const shoppingGroupId = selectedPantryGroup === 'demo' ? null : (selectedPantryGroup ?? null);
    try {
      const result = await addToShopping.mutateAsync({ week_start: weekStart, group_id: shoppingGroupId, pantry_group_id: groupId });
      showToast(`${result.added_count} item${result.added_count !== 1 ? 's' : ''} added to shopping list`, 'success');
    } catch {
      showToast('Failed to add to shopping list', 'error');
    }
  }, [addToShopping, weekStart, selectedPantryGroup, groupId, showToast]);

  const handleReplaceMeal = useCallback(async (mealId: number) => {
    setReplacingId(mealId);
    try {
      await replaceMeal.mutateAsync({ meal_id: mealId, week_start: weekStart, group_id: groupId });
      showToast('Meal replaced!', 'success');
    } catch {
      showToast('Failed to replace meal', 'error');
    } finally {
      setReplacingId(null);
    }
  }, [replaceMeal, weekStart, groupId, showToast]);

  const handleDragStart = useCallback((day: DayOfWeek, slot: MealSlot) => {
    setDragSource({ day, slot });
    dragDataRef.current = { day, slot };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, day: DayOfWeek, slot: MealSlot) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ day, slot });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetDay: DayOfWeek, targetSlot: MealSlot) => {
    e.preventDefault();
    const source = dragDataRef.current;
    setDragSource(null);
    setDragOver(null);
    dragDataRef.current = null;

    if (!source || (source.day === targetDay && source.slot === targetSlot)) return;

    try {
      await swapMeals.mutateAsync({
        source_day: source.day,
        source_slot: source.slot,
        target_day: targetDay,
        target_slot: targetSlot,
        week_start: weekStart,
      });
      showToast('Meals swapped!', 'success');
    } catch {
      showToast('Failed to swap meals', 'error');
    }
  }, [swapMeals, weekStart, showToast]);

  const handleDragEnd = useCallback(() => {
    setDragSource(null);
    setDragOver(null);
    dragDataRef.current = null;
  }, []);

  // ── Render helpers ────────────────────────────────
  const renderCell = (day: DayOfWeek, slot: MealSlot) => {
    const meal = mealMap.get(`${day}-${slot}`);
    const isAdding = addForm?.day === day && addForm?.slot === slot;

    if (isAdding) {
      return (
        <motion.div
          className="mp-cell mp-cell--adding"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          key={`add-${day}-${slot}`}
        >
          <input
            className="mp-add-input"
            placeholder="Recipe name..."
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddMeal(); if (e.key === 'Escape') { setAddForm(null); setRecipeName(''); } }}
            autoFocus
          />
          <div className="mp-add-actions">
            <button
              className="mp-add-confirm"
              onClick={handleAddMeal}
              disabled={!recipeName.trim() || createMeal.isPending}
            >
              {createMeal.isPending ? <Loader2 size={14} className="mp-spin" /> : <Check size={14} />}
            </button>
            <button className="mp-add-cancel" onClick={() => { setAddForm(null); setRecipeName(''); }}>
              <X size={14} />
            </button>
          </div>
        </motion.div>
      );
    }

    if (meal) {
      const hasIngredients = meal.ingredients && meal.ingredients.length > 0;
      const allInPantry = hasIngredients && meal.ingredients.every(i => i.in_pantry);
      const someInPantry = hasIngredients && meal.ingredients.some(i => i.in_pantry);
      const isReplacing = replacingId === meal.id;
      const isDraggedOver = dragOver?.day === day && dragOver?.slot === slot;
      const isDragSource = dragSource?.day === day && dragSource?.slot === slot;

      return (
        <motion.div
          className={`mp-cell mp-cell--filled${isDraggedOver ? ' mp-drag-over' : ''}${isDragSource ? ' mp-dragging' : ''}`}
          key={`meal-${meal.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          layout
          draggable
          onDragStart={() => handleDragStart(day, slot)}
          onDragOver={(e) => handleDragOver(e, day, slot)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, day, slot)}
          onDragEnd={handleDragEnd}
        >
          <div className="mp-meal-header">
            <span className="mp-meal-name">{meal.recipe_name}</span>
            <div className="mp-meal-actions">
              <button
                className="mp-meal-replace"
                onClick={(e) => { e.stopPropagation(); handleReplaceMeal(meal.id); }}
                disabled={isReplacing}
                title="Replace with AI suggestion"
              >
                <RefreshCw size={11} className={isReplacing ? 'mp-spin' : ''} />
              </button>
              <button
                className="mp-meal-delete"
                onClick={(e) => { e.stopPropagation(); handleDeleteMeal(meal.id); }}
                title="Remove"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
          {meal.description && (
            <span className="mp-meal-desc">{meal.description}</span>
          )}
          <div className="mp-meal-meta">
            {meal.time_minutes && (
              <span className="mp-meal-time">
                <Clock size={11} />
                {meal.time_minutes}m
              </span>
            )}
            {hasIngredients && (
              <span className={`mp-meal-status ${allInPantry ? 'ready' : someInPantry ? 'partial' : 'missing'}`}>
                {allInPantry ? 'Ready' : someInPantry ? 'Partial' : 'Need items'}
              </span>
            )}
          </div>
        </motion.div>
      );
    }

    const isDraggedOverEmpty = dragOver?.day === day && dragOver?.slot === slot;

    return (
      <div
        className={`mp-cell mp-cell--empty${isDraggedOverEmpty ? ' mp-drag-over' : ''}`}
        onClick={() => { setAddForm({ day, slot }); setRecipeName(''); }}
        onDragOver={(e) => handleDragOver(e, day, slot)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, day, slot)}
        key={`empty-${day}-${slot}`}
      >
        <Plus size={16} />
      </div>
    );
  };

  // ── Main render ───────────────────────────────────

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.04 } },
  };
  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
  };

  return (
    <motion.div
      className="meal-planner"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div className="mp-header" variants={fadeUp}>
        <div className="mp-title-row">
          <div className="mp-title">
            <CalendarDays size={22} />
            <h2>Meal Planner</h2>
          </div>
          <div className="mp-actions">
            <button
              className="mp-action-btn mp-action-btn--generate"
              onClick={handleGenerate}
              disabled={generatePlan.isPending}
              title="AI-generate meals for the week"
            >
              {generatePlan.isPending ? <Loader2 size={16} className="mp-spin" /> : <Sparkles size={16} />}
              <span>Generate</span>
            </button>
            {missingSummary.length > 0 && (
              <button
                className="mp-action-btn mp-action-btn--shopping"
                onClick={handleAddToShoppingList}
                disabled={addToShopping.isPending}
                title="Add missing ingredients to shopping list"
              >
                {addToShopping.isPending ? <Loader2 size={16} className="mp-spin" /> : <ShoppingCart size={16} />}
                <span>Add to list</span>
              </button>
            )}
          </div>
        </div>
        <div className="mp-week-nav">
          <button className="mp-week-arrow" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft size={18} />
          </button>
          <span className="mp-week-label">{formatWeekRange(monday)}</span>
          <button className="mp-week-arrow" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight size={18} />
          </button>
          {weekOffset !== 0 && (
            <button className="mp-week-today" onClick={() => setWeekOffset(0)}>
              Today
            </button>
          )}
        </div>
      </motion.div>

      {/* Mobile day selector */}
      <motion.div className="mp-mobile-day-tabs" variants={fadeUp}>
        {DAYS.map(day => (
          <button
            key={day}
            className={`mp-day-tab ${mobileDay === day ? 'active' : ''} ${isToday(monday, day) ? 'today' : ''}`}
            onClick={() => setMobileDay(day)}
          >
            <span className="mp-day-tab-name">{DAY_SHORT[day]}</span>
            <span className="mp-day-tab-date">{getDayDate(monday, day)}</span>
          </button>
        ))}
      </motion.div>

      {/* Grid */}
      {isLoading ? (
        <div className="mp-loading">
          <MixingBowlLoader size="lg" label="Loading meal plan..." />
        </div>
      ) : (
        <motion.div className="mp-grid-wrapper" variants={fadeUp}>
          {/* Desktop grid */}
          <div className="mp-grid">
            {/* Header row */}
            <div className="mp-grid-corner" />
            {DAYS.map(day => (
              <div key={day} className={`mp-grid-day-header ${isToday(monday, day) ? 'today' : ''}`}>
                <span className="mp-day-name">{DAY_SHORT[day]}</span>
                <span className="mp-day-date">{getDayDate(monday, day)}</span>
              </div>
            ))}

            {/* Slot rows */}
            {SLOTS.map(slot => (
              <div className="mp-grid-row" key={slot}>
                <div className="mp-grid-slot-label">{SLOT_LABEL[slot]}</div>
                {DAYS.map(day => (
                  <div className="mp-grid-cell" key={`${day}-${slot}`}>
                    {renderCell(day, slot)}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Mobile single-day view */}
          <div className="mp-mobile-view">
            {SLOTS.map(slot => (
              <div className="mp-mobile-slot" key={slot}>
                <span className="mp-mobile-slot-label">{SLOT_LABEL[slot]}</span>
                {renderCell(mobileDay, slot)}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Missing ingredients summary */}
      <AnimatePresence>
        {missingSummary.length > 0 && (
          <motion.div
            className="mp-missing"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <div className="mp-missing-header">
              <AlertTriangle size={16} />
              <span>Missing Ingredients ({missingSummary.length})</span>
            </div>
            <div className="mp-missing-list">
              {missingSummary.map((item, i) => (
                <div key={i} className="mp-missing-item">
                  <span className="mp-missing-name">
                    {item.amount} {item.item}
                  </span>
                  <span className="mp-missing-for">
                    for {item.needed_for.join(', ')}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default MealPlanner;
