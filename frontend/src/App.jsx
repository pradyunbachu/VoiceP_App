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
import ToastContainer from "./components/ToastContainer";
import LoadingSkeleton from "./components/LoadingSkeleton";
import QuickRecordPopup from "./components/QuickRecordPopup";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { useExpenses, useAnalytics, useClearAllExpenses } from "./hooks";
import "./App.css";

function AppContent() {
  const queryClient = useQueryClient();
  const { session, user: authUser, loading: authLoading, signOut, getToken } = useAuth();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState("landing");
  const [toasts, setToasts] = useState([]);

  // React Query hooks for data fetching
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses();
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics();
  const clearAllMutation = useClearAllExpenses();

  // Combined loading state
  const loading = expensesLoading || analyticsLoading;

  // Toast notification helper
  const showToast = useCallback((message, type = "info", duration = 5000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Sync auth state with Supabase session
  useEffect(() => {
    if (session && authUser) {
      const currentToken = getToken();
      setToken(currentToken);
      setUser({
        id: authUser.id,
        email: authUser.email,
        username: authUser.user_metadata?.username || authUser.email?.split("@")[0] || "User",
      });
      setIsAuthenticated(true);
      if (currentView === "landing" || currentView === "login") {
        setCurrentView("dashboard");
      }
    } else if (!authLoading && !session) {
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  }, [session, authUser, authLoading, getToken, currentView]);

  const handleClearAll = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete ALL expenses? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await clearAllMutation.mutateAsync();
      showToast("All expenses deleted successfully", "success");
    } catch (error) {
      console.error("Error clearing expenses:", error);
      showToast(
        error.message || "Failed to clear expenses. Please try again.",
        "error"
      );
    }
  };

  const handleLogin = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    setCurrentView("dashboard");
    showToast(`Welcome, ${userData.username}!`, "success");
  };

  const handleLogout = async () => {
    await signOut();
    // Clear all React Query cache on logout
    queryClient.clear();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setCurrentView("landing");
    showToast("Logged out successfully", "info");
  };

  // Show loading while checking auth state
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
              onGetStarted={() => setCurrentView("dashboard")}
              isAuthenticated={true}
            />
          </div>
        );
      case "record":
        return (
          <div className="view-container" key="record">
            <VoiceRecorder showToast={showToast} />
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
                onClearAll={handleClearAll}
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
              expenses={expenses}
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
            <VoiceRecorder showToast={showToast} />
          </div>
        );
    }
  };

  return (
    <div className="app">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {isAuthenticated && (
        <>
          <Navigation
            currentView={currentView}
            onViewChange={setCurrentView}
            onLogout={handleLogout}
            user={user}
          />
          <QuickRecordPopup showToast={showToast} />
        </>
      )}
      <main className="app-main">{renderView()}</main>
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
