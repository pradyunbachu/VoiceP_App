import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Navigation from "./components/Navigation";
import LandingPage from "./components/LandingPage";
import Login from "./components/Login";
import VoiceRecorder from "./components/VoiceRecorder";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import ExpenseList from "./components/ExpenseList";
import BudgetManagement from "./components/BudgetManagement";
import Pantry from "./components/Pantry";
import ShoppingList from "./components/ShoppingList";
import SpendingInsights from "./components/SpendingInsights";
import SpendingComparisons from "./components/SpendingComparisons";
import ToastContainer from "./components/ToastContainer";
import LoadingSkeleton from "./components/LoadingSkeleton";
import QuickRecordPopup from "./components/QuickRecordPopup";
import DailyRecs from "./components/DailyRecs";
import TutorialOverlay from "./components/TutorialOverlay";
import ConfirmDialog from "./components/ConfirmDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { useAnalytics, useClearAllExpenses } from "./hooks";
import type { AppUser, AppView, Toast as ToastType, ToastAction } from "./types";
import "./App.css";

function AppContent() {
  const queryClient = useQueryClient();
  const { session, user: authUser, loading: authLoading, signOut, getToken } = useAuth();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [currentView, setCurrentView] = useState<AppView>("landing");
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);

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
          setCurrentView("record");
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
    setCurrentView("record");
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
              onGetStarted={() => setCurrentView("record")}
              isAuthenticated={true}
            />
          </div>
        );
      case "record":
        return (
          <div className="view-container" key="record">
            <VoiceRecorder showToast={showToast} onShowTutorial={() => setShowTutorial(true)} />
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
      default:
        return (
          <div className="view-container" key="default">
            <VoiceRecorder showToast={showToast} onShowTutorial={() => setShowTutorial(true)} />
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
          <QuickRecordPopup showToast={showToast} />
        </ErrorBoundary>
      )}
      <ErrorBoundary name="view" key={currentView}>
        <main className={isAuthenticated ? "app-main" : ""}>{renderView()}</main>
      </ErrorBoundary>
      {currentView === "record" && <DailyRecs />}
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
