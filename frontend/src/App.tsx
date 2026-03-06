import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import SpendingInsights from "./components/SpendingInsights";
import SpendingComparisons from "./components/SpendingComparisons";
import ToastContainer from "./components/ToastContainer";
import LoadingSkeleton from "./components/LoadingSkeleton";
import QuickRecordPopup from "./components/QuickRecordPopup";
import type { QuickRecordPopupHandle } from "./components/QuickRecordPopup";
import VoxyFAB from "./components/VoxyFAB";
import DailyRecs from "./components/DailyRecs";
import TutorialOverlay from "./components/TutorialOverlay";
import ConfirmDialog from "./components/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import UpdatePassword from "./components/UpdatePassword";
import { API_BASE_URL } from "./config/api";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { useAnalytics, useClearAllExpenses } from "./hooks";
import type { AppUser, AppView, Toast as ToastType, ToastAction } from "./types";
import "./App.css";

function AppContent() {
  const queryClient = useQueryClient();
  const { session, user: authUser, loading: authLoading, signOut, getToken, passwordRecovery, updatePassword } = useAuth();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [currentView, setCurrentView] = useState<AppView>("landing");
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedPantryGroup, setSelectedPantryGroup] = useState<number | null | "demo">(null);
  const quickRecordRef = useRef<QuickRecordPopupHandle>(null);

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

  // Seed demo pantry for first-time users (fire-and-forget)
  useEffect(() => {
    if (isAuthenticated && !localStorage.getItem("voxal_demo_seeded")) {
      getToken().then((t) => {
        if (!t) return;
        fetch(`${API_BASE_URL}/api/pantry/seed-demo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
        }).then(() => {
          localStorage.setItem("voxal_demo_seeded", "true");
        }).catch(() => {});
      });
    }
  }, [isAuthenticated, getToken]);

  const handleTutorialClose = useCallback(() => {
    setShowTutorial(false);
    localStorage.setItem("voxal_tutorial_seen", "true");
  }, []);

  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

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
            <LoadingSkeleton type="card" count={1} />
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
              onOpenVoxy={() => quickRecordRef.current?.triggerOpen()}
              selectedPantryGroup={selectedPantryGroup}
            />
          </div>
        );
      case "dashboard":
        return (
          <div className="view-container" key="dashboard">
            {loading && !analytics ? (
              <div className="loading-container">
                <LoadingSkeleton type="chart" />
                <LoadingSkeleton type="card" count={3} />
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
              selectedGroupId={selectedPantryGroup}
              onSelectGroup={setSelectedPantryGroup}
            />
          </div>
        );
      case "shopping-list":
        return (
          <div className="view-container" key="shopping-list">
            <ShoppingList
              showToast={showToast}
              selectedPantryGroup={selectedPantryGroup}
            />
          </div>
        );
      case "chef":
        return (
          <div className="view-container" key="chef">
            <Chef showToast={showToast} selectedGroupId={selectedPantryGroup} />
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
              onOpenVoxy={() => quickRecordRef.current?.triggerOpen()}
              selectedPantryGroup={selectedPantryGroup}
            />
          </div>
        );
    }
  };

  return (
    <div className="app">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {isAuthenticated && (
        <ErrorBoundary name="navigation">
          <Navigation
            currentView={currentView}
            onViewChange={setCurrentView}
            onLogout={handleLogout}
            user={user}
          />
          <QuickRecordPopup ref={quickRecordRef} showToast={showToast} />
          <VoxyFAB popupRef={quickRecordRef} />
        </ErrorBoundary>
      )}
      <ErrorBoundary name="view" key={currentView}>
        <main className={isAuthenticated ? "app-main" : ""}>{renderView()}</main>
      </ErrorBoundary>
      {isAuthenticated && <DailyRecs showToast={showToast} />}
      <TutorialOverlay isOpen={showTutorial} onClose={handleTutorialClose} />
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
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
