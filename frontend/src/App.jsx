import { useState, useEffect } from 'react'
import Navigation from './components/Navigation'
import LandingPage from './components/LandingPage'
import Login from './components/Login'
import VoiceRecorder from './components/VoiceRecorder'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import ExpenseList from './components/ExpenseList'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [currentView, setCurrentView] = useState('landing')
  const [expenses, setExpenses] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
      setIsAuthenticated(true)
      setCurrentView('dashboard')
    }
  }, [])

  const fetchExpenses = async () => {
    if (!token) return
    try {
      const response = await fetch('http://localhost:8000/api/expenses', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.status === 401) {
        handleLogout()
        return
      }
      const data = await response.json()
      setExpenses(data.expenses || [])
    } catch (error) {
      console.error('Error fetching expenses:', error)
    }
  }

  const fetchAnalytics = async () => {
    if (!token) return
    try {
      const response = await fetch('http://localhost:8000/api/analytics', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.status === 401) {
        handleLogout()
        return
      }
      const data = await response.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    }
  }

  useEffect(() => {
    if (isAuthenticated && currentView !== 'landing' && currentView !== 'login') {
      fetchExpenses()
      fetchAnalytics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, isAuthenticated, token])

  const handleExpenseAdded = () => {
    fetchExpenses()
    fetchAnalytics()
  }

  const handleExpenseDeleted = () => {
    fetchExpenses()
    fetchAnalytics()
  }

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete ALL expenses? This action cannot be undone.")) {
      return
    }

    try {
      const response = await fetch('http://localhost:8000/api/expenses', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.status === 401) {
        handleLogout()
        return
      }

      if (response.ok) {
        fetchExpenses()
        fetchAnalytics()
      } else {
        alert("Failed to clear all expenses")
      }
    } catch (error) {
      console.error('Error clearing expenses:', error)
      alert("Error clearing expenses")
    }
  }

  const handleLogin = (newToken, userData) => {
    setToken(newToken)
    setUser(userData)
    setIsAuthenticated(true)
    setCurrentView('dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
    setIsAuthenticated(false)
    setCurrentView('login')
    setExpenses([])
    setAnalytics(null)
  }

  const renderView = () => {
    if (!isAuthenticated) {
      if (currentView === 'landing') {
        return <LandingPage onGetStarted={() => setCurrentView('login')} />
      }
      return <Login onLogin={handleLogin} />
    }

    switch (currentView) {
      case 'record':
        return (
          <div className="view-container">
            <VoiceRecorder 
              onExpenseAdded={handleExpenseAdded}
              loading={loading}
              setLoading={setLoading}
              token={token}
            />
          </div>
        )
      case 'dashboard':
        return (
          <div className="view-container">
            {analytics ? (
              <AnalyticsDashboard 
                analytics={analytics} 
                onClearAll={handleClearAll}
              />
            ) : (
              <div className="loading-state">Loading analytics...</div>
            )}
          </div>
        )
      case 'expenses':
        return (
          <div className="view-container">
            <ExpenseList 
              expenses={expenses}
              onExpenseDeleted={handleExpenseDeleted}
              token={token}
            />
          </div>
        )
      default:
        return (
          <div className="view-container">
            <VoiceRecorder 
              onExpenseAdded={handleExpenseAdded}
              loading={loading}
              setLoading={setLoading}
              token={token}
            />
          </div>
        )
    }
  }

  return (
    <div className="app">
      {isAuthenticated && (
        <Navigation 
          currentView={currentView} 
          onViewChange={setCurrentView}
          onLogout={handleLogout}
          user={user}
        />
      )}
      <main className="app-main">
        {renderView()}
      </main>
    </div>
  )
}

export default App

