import { useState, useEffect, useCallback } from "react";
import Navigation from "./components/Navigation";
import LandingPage from "./components/LandingPage";
import Login from "./components/Login";
import VoiceRecorder from "./components/VoiceRecorder";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import ExpenseList from "./components/ExpenseList";
import BudgetManagement from "./components/BudgetManagement";
import ToastContainer from "./components/ToastContainer";
import LoadingSkeleton from "./components/LoadingSkeleton";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./App.css";

// Utility function for API calls with retry
const fetchWithRetry = async (
  url,
  options = {},
  maxRetries = 3,
  delay = 1000
) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status === 401) {
        return response;
      }
      // Retry on server errors (5xx) or network errors
      if (i < maxRetries - 1 && (response.status >= 500 || !response.ok)) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      return response;
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      throw error;
    }
  }
};

function AppContent() {
  const { session, user: authUser, loading: authLoading, signOut, getToken } = useAuth();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState("landing");
  const [expenses, setExpenses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

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

  const fetchExpenses = async (showLoading = true) => {
    const currentToken = getToken();
    if (!currentToken) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetchWithRetry(
        "http://localhost:8000/api/expenses",
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      if (response.status === 401) {
        handleLogout();
        showToast("Session expired. Please login again.", "warning");
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch expenses: ${response.status}`);
      }

      const data = await response.json();
      setExpenses(data.expenses || []);
    } catch (error) {
      console.error("Error fetching expenses:", error);
      showToast("Failed to load expenses. Please try again.", "error");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchAnalytics = async (showLoading = true) => {
    const currentToken = getToken();
    if (!currentToken) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetchWithRetry(
        "http://localhost:8000/api/analytics",
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      if (response.status === 401) {
        handleLogout();
        showToast("Session expired. Please login again.", "warning");
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.status}`);
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      showToast("Failed to load analytics. Please try again.", "error");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (
      isAuthenticated &&
      currentView !== "landing" &&
      currentView !== "login"
    ) {
      fetchExpenses();
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, isAuthenticated, token]);

  const handleExpenseAdded = () => {
    fetchExpenses(false);
    fetchAnalytics(false);
  };

  const handleExpenseDeleted = () => {
    fetchExpenses(false);
    fetchAnalytics(false);
  };

  const handleExpenseUpdated = () => {
    fetchExpenses(false);
    fetchAnalytics(false);
  };

  const handleExpensesChange = (newExpenses) => {
    setExpenses(newExpenses);
  };

  const handleClearAll = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete ALL expenses? This action cannot be undone."
      )
    ) {
      return;
    }

    const currentToken = getToken();
    try {
      const response = await fetchWithRetry(
        "http://localhost:8000/api/expenses",
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (response.ok) {
        showToast("All expenses deleted successfully", "success");
        fetchExpenses(false);
        fetchAnalytics(false);
      } else {
        const error = await response.json();
        throw new Error(error.detail || "Failed to clear all expenses");
      }
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

  const handleBudgetChange = () => {
    fetchAnalytics(false);
  };

  const handleLogout = async () => {
    await signOut();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setCurrentView("login");
    setExpenses([]);
    setAnalytics(null);
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
        return <LandingPage onGetStarted={() => setCurrentView("login")} />;
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
            <VoiceRecorder
              onExpenseAdded={handleExpenseAdded}
              loading={loading}
              setLoading={setLoading}
              token={token}
              showToast={showToast}
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
                onClearAll={handleClearAll}
                token={token}
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
              onExpenseDeleted={handleExpenseDeleted}
              onExpenseUpdated={handleExpenseUpdated}
              onExpensesChange={handleExpensesChange}
              token={token}
              showToast={showToast}
            />
          </div>
        );
      case "budgets":
        return (
          <div className="view-container" key="budgets">
            <BudgetManagement
              token={token}
              onBudgetChange={handleBudgetChange}
              showToast={showToast}
            />
          </div>
        );
      default:
        return (
          <div className="view-container" key="default">
            <VoiceRecorder
              onExpenseAdded={handleExpenseAdded}
              loading={loading}
              setLoading={setLoading}
              token={token}
              showToast={showToast}
            />
          </div>
        );
    }
  };

  return (
    <div className="app">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {isAuthenticated && (
        <Navigation
          currentView={currentView}
          onViewChange={setCurrentView}
          onLogout={handleLogout}
          user={user}
        />
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
