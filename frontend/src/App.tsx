import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { SessionExpiredError } from "./lib/authFetch";
import SessionExpiredBanner from "./components/SessionExpiredBanner";
import Navigation from "./components/Navigation";
import LandingPage from "./components/LandingPage";
import Login from "./components/Login";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import ExpenseList from "./components/ExpenseList";
import BudgetManagement from "./components/BudgetManagement";
import Pantry from "./components/Pantry";
import ShoppingList from "./components/ShoppingList";
import Chef from "./components/Chef";
import HomeDashboard from "./components/HomeDashboard";
import Settings from "./components/Settings";
import MealPlanner from "./components/MealPlanner";
import SavedRecipes from "./components/SavedRecipes";
import SpendingInsights from "./components/SpendingInsights";
import SpendingComparisons from "./components/SpendingComparisons";
import ToastContainer from "./components/ToastContainer";
import MixingBowlLoader from "./components/MixingBowlLoader";
import QuickRecordPopup from "./components/QuickRecordPopup";
import type { QuickRecordPopupHandle } from "./components/QuickRecordPopup";
import VoxyFAB from "./components/VoxyFAB";
// DailyRecs slide-out panel removed — recipes now shown inline on dashboard
import TutorialOverlay from "./components/TutorialOverlay";
import ConfirmDialog from "./components/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import MobileBottomNav from "./components/MobileBottomNav";
import UpdatePassword from "./components/UpdatePassword";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { PantryProvider, usePantrySelection } from "./context/PantryContext";
import { X } from "lucide-react";
import RecipeDetailPanel from "./components/RecipeDetailModal";
import { useAnalytics, useClearAllExpenses, useRecipeDetail, useCookMeal, usePantryItems, usePantryGroups, usePantryStats } from "./hooks";
import type { AppUser, AppView, Toast as ToastType, ToastAction, RecipeDetail, MealSuggestion, CookMealResponse } from "./types";
import "./App.css";

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const pageTransition = {
  duration: 0.25,
  ease: "easeOut" as const,
};

function AppContent() {
  const queryClient = useQueryClient();
  const { session, user: authUser, loading: authLoading, signOut, getToken, passwordRecovery, updatePassword } = useAuth();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [currentView, setCurrentView] = useState<AppView>("landing");
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const { selectedGroupId: selectedPantryGroup, setSelectedGroupId: setSelectedPantryGroup } = usePantrySelection();
  const [chefInitialItems, setChefInitialItems] = useState<string[]>([]);
  // Global recipe panel state (slides out on any screen)
  const [globalMeal, setGlobalMeal] = useState<{ name: string; description: string } | null>(null);
  const [globalRecipeCache, setGlobalRecipeCache] = useState<RecipeDetail | null>(null);
  const globalRecipeDetail = useRecipeDetail();
  const globalCookMeal = useCookMeal();
  const { data: globalPantryData } = usePantryItems({ group_id: selectedPantryGroup ?? undefined });
  const [sessionExpired, setSessionExpired] = useState(false);
  const quickRecordRef = useRef<QuickRecordPopupHandle>(null);

  // First-run pantry default: a genuinely new user (empty personal pantry) with
  // no stored selection lands on the Demo Pantry; existing users stay on My
  // Pantry. Captured at first render, before the context persist effect writes,
  // so an absent key is distinguishable from an explicit "My Pantry" (null).
  const hadStoredSelectionRef = useRef<boolean>(
    (() => { try { return localStorage.getItem("voxal_selected_pantry") !== null; } catch { return false; } })()
  );
  const firstRunAppliedRef = useRef<boolean>(false);
  const { data: pantryGroupsForDefault } = usePantryGroups();
  const { data: personalPantryStats } = usePantryStats(undefined);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (hadStoredSelectionRef.current || firstRunAppliedRef.current) return;
    if (!pantryGroupsForDefault || !personalPantryStats) return;
    firstRunAppliedRef.current = true;
    const demoGroup = pantryGroupsForDefault.find((g) => g.name === "Demo Pantry");
    if (personalPantryStats.total_items === 0 && demoGroup) {
      setSelectedPantryGroup(demoGroup.id);
    }
  }, [isAuthenticated, pantryGroupsForDefault, personalPantryStats, setSelectedPantryGroup]);

  const { data: analytics, isLoading: analyticsLoading } = useAnalytics();
  const clearAllMutation = useClearAllExpenses();

  const loading = analyticsLoading;

  const showToast = useCallback((message: string, type: ToastType["type"] = "info", duration = 5000, action: ToastAction | null = null) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, duration, action }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const syncAuth = async () => {
      if (session && authUser) {
        const currentToken = await getToken();
        setToken(currentToken);
        setUser({
          id: authUser.id,
          email: authUser.email!,
          username: authUser.user_metadata?.username || authUser.email?.split("@")[0] || "User",
          avatar_url: authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || undefined,
        });
        setIsAuthenticated(true);
        if (currentView === "landing" || currentView === "login") {
          setCurrentView("home");
        }
      } else if (!authLoading && !session) {
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    };
    syncAuth();
  }, [session, authUser, authLoading, getToken, currentView]);

  useEffect(() => {
    if (isAuthenticated && !localStorage.getItem("voxal_tutorial_seen")) {
      const timer = setTimeout(() => setShowTutorial(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  // Listen for SessionExpiredError from any query/mutation
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (
        event.type === "updated" &&
        event.query.state.status === "error" &&
        event.query.state.error instanceof SessionExpiredError
      ) {
        setSessionExpired(true);
      }
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Clear the expired banner when the user successfully re-authenticates
  useEffect(() => {
    if (session && sessionExpired) {
      setSessionExpired(false);
      // Refetch all active queries with fresh token
      queryClient.invalidateQueries();
    }
  }, [session, sessionExpired, queryClient]);

  const handleTutorialClose = useCallback(() => {
    setShowTutorial(false);
    localStorage.setItem("voxal_tutorial_seen", "true");
  }, []);

  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  const handleSessionSignIn = useCallback(async () => {
    await signOut();
    queryClient.clear();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setSessionExpired(false);
    setCurrentView("login");
  }, [signOut, queryClient]);

  // Global recipe panel handlers
  const handleSelectMeal = useCallback((meal: { name: string; description: string }) => {
    setGlobalMeal(meal);
    setGlobalRecipeCache(null);
    globalRecipeDetail.reset();
    const available = (Array.isArray(globalPantryData) ? globalPantryData : [])
      .filter((i: { quantity?: number; stock_status?: string }) => (i.quantity ?? 0) > 0 && i.stock_status !== 'out_of_stock')
      .map((i: { name: string }) => i.name)
      .join(', ');
    globalRecipeDetail.mutate(
      { meal_name: meal.name, meal_description: meal.description, available_ingredients: available },
      { onSuccess: (result: RecipeDetail) => setGlobalRecipeCache(result) }
    );
  }, [globalPantryData, globalRecipeDetail]);

  const handleCloseGlobalRecipe = useCallback(() => {
    setGlobalMeal(null);
    setGlobalRecipeCache(null);
    globalRecipeDetail.reset();
  }, [globalRecipeDetail]);

  const handleGlobalCookMeal = useCallback((recipeName: string, ingredients: Array<{ item: string; amount: string }>) => {
    const recipe = globalRecipeCache || (globalRecipeDetail.data as RecipeDetail | undefined);
    globalCookMeal.mutate(
      {
        recipe_name: recipeName,
        ingredients,
        group_id: selectedPantryGroup ?? undefined,
        recipe_instructions: recipe?.instructions as string[] | undefined,
        recipe_description: recipe?.description,
        recipe_servings: recipe?.servings,
        recipe_prep_minutes: recipe?.prep_minutes,
        recipe_cook_minutes: recipe?.cook_minutes,
        recipe_nutrition: recipe?.nutrition as Record<string, unknown> | undefined,
      },
      {
        onSuccess: (result: CookMealResponse) => {
          const msg = result.expiring_items_saved > 0
            ? `Used ${result.expiring_items_saved} expiring item${result.expiring_items_saved > 1 ? 's' : ''} — $${result.estimated_savings} saved!`
            : `Recipe logged! ${result.deducted_count} pantry item${result.deducted_count !== 1 ? 's' : ''} updated.`;
          showToast(msg, 'celebration', 5000);
          handleCloseGlobalRecipe();
        },
        onError: () => {
          showToast("Couldn't log your meal.", 'error', 6000, {
            label: "Retry",
            onClick: () => handleGlobalCookMeal(recipeName, ingredients),
          });
        },
      }
    );
  }, [globalRecipeCache, globalRecipeDetail.data, selectedPantryGroup, globalCookMeal, showToast, handleCloseGlobalRecipe]);

  const handleClearAll = async () => {
    try {
      await clearAllMutation.mutateAsync();
      showToast("All expenses deleted successfully", "success");
    } catch (error) {
      console.error("Error clearing expenses:", error);
      showToast(
        (error as Error).message || "Failed to clear expenses. Please try again.",
        "error"
      );
    }
  };

  const handleLogin = (newToken: string, userData: AppUser) => {
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    setCurrentView("home");
    showToast(`Welcome, ${userData.username}!`, "success");
  };

  const handleLogout = async () => {
    await signOut();
    queryClient.clear();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setCurrentView("landing");
    showToast("Logged out successfully", "info");
  };

  if (authLoading) {
    return (
      <div className="app">
        <main className="app-main">
          <div className="loading-container">
            <MixingBowlLoader size="lg" label="Loading..." />
          </div>
        </main>
      </div>
    );
  }

  const renderView = () => {
    if (passwordRecovery) {
      return (
        <UpdatePassword
          onUpdate={async (newPassword: string) => {
            const { error } = await updatePassword(newPassword);
            if (error) {
              showToast((error as Error).message || "Failed to update password", "error");
            } else {
              showToast("Password updated successfully!", "success");
              setCurrentView("home");
            }
          }}
        />
      );
    }

    if (!isAuthenticated) {
      if (currentView === "landing") {
        return (
          <LandingPage
            onGetStarted={() => setCurrentView("login")}
            onLogin={() => setCurrentView("login")}
          />
        );
      }
      return <Login onLogin={handleLogin} showToast={showToast} />;
    }

    switch (currentView) {
      case "landing":
        return (
          <div className="view-container" key="landing">
            <LandingPage
              onGetStarted={() => setCurrentView("home")}
              isAuthenticated={true}
            />
          </div>
        );
      case "home":
        return (
          <div className="view-container" key="home">
            <HomeDashboard
              showToast={showToast}
              onNavigate={setCurrentView}
              onShowTutorial={() => setShowTutorial(true)}
              onOpenVoxy={() => quickRecordRef.current?.triggerRecord()}
            />
          </div>
        );
      case "dashboard":
        return (
          <div className="view-container" key="dashboard">
            {loading && !analytics ? (
              <div className="loading-container">
                <MixingBowlLoader size="lg" label="Loading analytics..." />
              </div>
            ) : analytics ? (
              <AnalyticsDashboard
                analytics={analytics}
                onClearAll={() => setShowClearAllConfirm(true)}
                showToast={showToast}
              />
            ) : (
              <div className="empty-state-container">
                <h3>No analytics data</h3>
                <p>Record some expenses to see your spending analytics.</p>
              </div>
            )}
          </div>
        );
      case "expenses":
        return (
          <div className="view-container" key="expenses">
            <ExpenseList
              showToast={showToast}
            />
          </div>
        );
      case "budgets":
        return (
          <div className="view-container" key="budgets">
            <BudgetManagement
              showToast={showToast}
            />
          </div>
        );
      case "insights":
        return (
          <div className="view-container" key="insights">
            <SpendingInsights
              showToast={showToast}
            />
          </div>
        );
      case "comparisons":
        return (
          <div className="view-container" key="comparisons">
            <SpendingComparisons
              showToast={showToast}
            />
          </div>
        );
      case "pantry":
        return (
          <div className="view-container" key="pantry">
            <Pantry
              showToast={showToast}
              onCookExpiring={(itemNames) => {
                setChefInitialItems(itemNames);
                setCurrentView("chef");
              }}
            />
          </div>
        );
      case "shopping-list":
        return (
          <div className="view-container" key="shopping-list">
            <ShoppingList
              showToast={showToast}
            />
          </div>
        );
      case "chef":
        return (
          <div className="view-container" key="chef">
            <Chef showToast={showToast} initialBowlItemNames={chefInitialItems} onInitialItemsConsumed={() => setChefInitialItems([])} />
          </div>
        );
      case "meal-planner":
        return (
          <div className="view-container" key="meal-planner">
            <MealPlanner
              showToast={showToast}
            />
          </div>
        );
      case "saved-recipes":
        return (
          <div className="view-container" key="saved-recipes">
            <SavedRecipes
              showToast={showToast}
            />
          </div>
        );
      case "settings":
        return (
          <div className="view-container" key="settings">
            <Settings showToast={showToast} />
          </div>
        );
      default:
        return (
          <div className="view-container" key="default">
            <HomeDashboard
              showToast={showToast}
              onNavigate={setCurrentView}
              onShowTutorial={() => setShowTutorial(true)}
              onOpenVoxy={() => quickRecordRef.current?.triggerRecord()}
            />
          </div>
        );
    }
  };

  return (
    <div className="app">
      {sessionExpired && <SessionExpiredBanner onSignIn={handleSessionSignIn} />}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {isAuthenticated && (
        <ErrorBoundary name="navigation">
          <Navigation
            currentView={currentView}
            onViewChange={setCurrentView}
            onLogout={handleLogout}
            user={user}
            showToast={showToast}
          />
          <QuickRecordPopup ref={quickRecordRef} showToast={showToast} onNavigate={setCurrentView} onSelectMeal={handleSelectMeal} />
          <VoxyFAB popupRef={quickRecordRef} />

          {/* Global recipe panel — slides out on any screen */}
          {globalMeal && <div className="global-recipe-backdrop" onClick={handleCloseGlobalRecipe} />}
          <div className={`global-recipe-panel ${globalMeal ? 'open' : ''}`}>
            {globalMeal && (
              <RecipeDetailPanel
                recipe={globalRecipeCache || (globalRecipeDetail.data as RecipeDetail | undefined)}
                isLoading={!globalRecipeCache && globalRecipeDetail.isPending}
                error={!globalRecipeCache && globalRecipeDetail.isError}
                onClose={handleCloseGlobalRecipe}
                onCookMeal={handleGlobalCookMeal}
                isCooking={globalCookMeal.isPending}
                showToast={showToast}
              />
            )}
          </div>
        </ErrorBoundary>
      )}
      <ErrorBoundary name="view" key={currentView}>
        <main className={isAuthenticated ? "app-main" : ""}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              style={{ width: "100%" }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </ErrorBoundary>
      {isAuthenticated && <MobileBottomNav currentView={currentView} onViewChange={setCurrentView} />}
      <TutorialOverlay isOpen={showTutorial} onClose={handleTutorialClose} />
      <AnimatePresence>
        {showClearAllConfirm && (
          <ConfirmDialog
            message="Are you sure you want to delete ALL expenses? This action cannot be undone."
            confirmLabel="Delete All"
            onConfirm={() => {
              handleClearAll();
              setShowClearAllConfirm(false);
            }}
            onCancel={() => setShowClearAllConfirm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PantryProvider>
          <AppContent />
        </PantryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
