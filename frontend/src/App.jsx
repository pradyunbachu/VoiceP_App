import { useState, useEffect } from 'react'
import Navigation from './components/Navigation'
import LandingPage from './components/LandingPage'
import VoiceRecorder from './components/VoiceRecorder'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import ExpenseList from './components/ExpenseList'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('landing')
  const [expenses, setExpenses] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchExpenses = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/expenses')
      const data = await response.json()
      setExpenses(data.expenses || [])
    } catch (error) {
      console.error('Error fetching expenses:', error)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/analytics')
      const data = await response.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    }
  }

  useEffect(() => {
    if (currentView !== 'landing') {
      fetchExpenses()
      fetchAnalytics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView])

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
        method: 'DELETE'
      })

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

  const renderView = () => {
    switch (currentView) {
      case 'landing':
        return <LandingPage onGetStarted={() => setCurrentView('record')} />
      case 'record':
        return (
          <div className="view-container">
            <VoiceRecorder 
              onExpenseAdded={handleExpenseAdded}
              loading={loading}
              setLoading={setLoading}
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
            />
          </div>
        )
    }
  }

  return (
    <div className="app">
      <Navigation 
        currentView={currentView} 
        onViewChange={setCurrentView}
      />
      <main className="app-main">
        {renderView()}
      </main>
    </div>
  )
}

export default App

