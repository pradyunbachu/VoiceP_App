import { useState, useEffect } from "react";
import type { FC } from "react";
import {
  Save,
  User,
  Globe,
  Sun,
  Moon,
  UtensilsCrossed,
  Bell,
  RotateCcw,
  Package,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { usePushNotifications } from "../hooks";
import type { ShowToast } from "../types";
import "./Settings.css";

interface Props {
  showToast: ShowToast;
}

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "EUR", symbol: "\u20AC", label: "Euro (\u20AC)" },
  { code: "GBP", symbol: "\u00A3", label: "British Pound (\u00A3)" },
  { code: "CAD", symbol: "CA$", label: "Canadian Dollar (CA$)" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar (A$)" },
  { code: "INR", symbol: "\u20B9", label: "Indian Rupee (\u20B9)" },
  { code: "JPY", symbol: "\u00A5", label: "Japanese Yen (\u00A5)" },
];

const Settings: FC<Props> = ({ showToast }) => {
  const { user, updateUserProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const push = usePushNotifications();

  // Profile
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  // Preferences (localStorage)
  const [currency, setCurrency] = useState(() =>
    localStorage.getItem("voxal_currency") || "USD"
  );
  const [dietaryPref, setDietaryPref] = useState(() =>
    localStorage.getItem("voxal_dietary_preference") || ""
  );
  const [expirationDays, setExpirationDays] = useState(() =>
    parseInt(localStorage.getItem("voxal_expiration_days") || "7", 10)
  );
  const [streakNotifs, setStreakNotifs] = useState(() =>
    localStorage.getItem("voxal_streak_notifs") !== "false"
  );
  const [budgetAlerts, setBudgetAlerts] = useState(() =>
    localStorage.getItem("voxal_budget_alerts") !== "false"
  );
  const [hideOutOfStock, setHideOutOfStock] = useState(() =>
    localStorage.getItem("voxal_hide_out_of_stock") === "true"
  );

  // Initialize profile from user_metadata
  useEffect(() => {
    if (!user) return;
    const meta = user.user_metadata;
    const storedFirst = meta?.first_name;
    const storedLast = meta?.last_name;

    if (storedFirst !== undefined) {
      setFirstName(storedFirst || "");
      setLastName(storedLast || "");
    } else if (meta?.full_name || meta?.name) {
      const fullName = (meta.full_name || meta.name || "") as string;
      const parts = fullName.split(" ");
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
    } else if (meta?.username) {
      setFirstName(meta.username as string);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await updateUserProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });
    setSaving(false);

    if (error) {
      showToast("Failed to update profile", "error");
    } else {
      showToast("Profile updated", "success");
    }
  };

  const handleCurrencyChange = (code: string) => {
    setCurrency(code);
    localStorage.setItem("voxal_currency", code);
    showToast("Currency updated", "success");
  };

  const handleDietaryPrefSave = () => {
    localStorage.setItem("voxal_dietary_preference", dietaryPref.trim());
    showToast("Dietary preference saved", "success");
  };

  const handleExpirationDaysChange = (value: number) => {
    const clamped = Math.max(1, Math.min(30, value));
    setExpirationDays(clamped);
    localStorage.setItem("voxal_expiration_days", String(clamped));
  };

  const handleStreakNotifsToggle = () => {
    const next = !streakNotifs;
    setStreakNotifs(next);
    localStorage.setItem("voxal_streak_notifs", String(next));
  };

  const handleBudgetAlertsToggle = () => {
    const next = !budgetAlerts;
    setBudgetAlerts(next);
    localStorage.setItem("voxal_budget_alerts", String(next));
  };

  const handleHideOutOfStockToggle = () => {
    const next = !hideOutOfStock;
    setHideOutOfStock(next);
    localStorage.setItem("voxal_hide_out_of_stock", String(next));
  };

  const handleResetTutorial = () => {
    localStorage.removeItem("voxal_tutorial_seen");
    localStorage.removeItem("voxal_spacebar_tip_dismissed");
    showToast("Tutorial will show on next page load", "info");
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>Settings</h2>
      </div>

      {/* ── Profile ───────────────────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-header">
          <User size={18} />
          <h3>Profile</h3>
        </div>

        <div className="settings-field">
          <label htmlFor="settings-email">Email</label>
          <input
            id="settings-email"
            type="email"
            value={user?.email || ""}
            disabled
            className="settings-input settings-input--disabled"
          />
        </div>

        <div className="settings-row">
          <div className="settings-field">
            <label htmlFor="settings-first-name">First name</label>
            <input
              id="settings-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="settings-input"
            />
          </div>
          <div className="settings-field">
            <label htmlFor="settings-last-name">Last name</label>
            <input
              id="settings-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="settings-input"
            />
          </div>
        </div>

        <button
          className="settings-save"
          onClick={handleSaveProfile}
          disabled={saving}
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>

      {/* ── Appearance ────────────────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-header">
          {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
          <h3>Appearance</h3>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-toggle-label">Theme</span>
            <span className="settings-toggle-desc">
              {theme === "dark" ? "Dark mode" : "Light mode"}
            </span>
          </div>
          <button
            className={`settings-theme-btn ${theme}`}
            onClick={toggleTheme}
          >
            <span className="settings-theme-track">
              <span className="settings-theme-thumb" />
            </span>
            {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </div>

      {/* ── Currency ──────────────────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-header">
          <Globe size={18} />
          <h3>Currency</h3>
        </div>

        <div className="settings-field">
          <label htmlFor="settings-currency">Display currency</label>
          <select
            id="settings-currency"
            value={currency}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            className="settings-input settings-select"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Dietary Preferences ───────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-header">
          <UtensilsCrossed size={18} />
          <h3>Dietary Preferences</h3>
        </div>

        <div className="settings-field">
          <label htmlFor="settings-dietary">Default preference for meal suggestions</label>
          <input
            id="settings-dietary"
            type="text"
            value={dietaryPref}
            onChange={(e) => setDietaryPref(e.target.value)}
            placeholder="e.g. vegetarian, low carb, gluten-free..."
            className="settings-input"
          />
          <span className="settings-field-hint">
            Used as the default when generating recipe suggestions
          </span>
        </div>

        <button className="settings-save" onClick={handleDietaryPrefSave}>
          <Save size={16} />
          Save preference
        </button>
      </div>

      {/* ── Notifications ─────────────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-header">
          <Bell size={18} />
          <h3>Notifications</h3>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-toggle-label">Streak celebrations</span>
            <span className="settings-toggle-desc">
              Show toast when you hit logging milestones
            </span>
          </div>
          <button
            className={`settings-toggle ${streakNotifs ? "on" : ""}`}
            onClick={handleStreakNotifsToggle}
            role="switch"
            aria-checked={streakNotifs}
          >
            <span className="settings-toggle-track">
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-toggle-label">Budget alerts</span>
            <span className="settings-toggle-desc">
              Notify when spending approaches budget limits
            </span>
          </div>
          <button
            className={`settings-toggle ${budgetAlerts ? "on" : ""}`}
            onClick={handleBudgetAlertsToggle}
            role="switch"
            aria-checked={budgetAlerts}
          >
            <span className="settings-toggle-track">
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        </div>

        {push.isSupported && (
          <>
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <span className="settings-toggle-label">"What's for dinner?" alerts</span>
                <span className="settings-toggle-desc">
                  Daily push notification at ~4-5pm with a dinner idea based on your pantry
                </span>
              </div>
              <button
                className={`settings-toggle ${push.isSubscribed ? "on" : ""}`}
                onClick={async () => {
                  if (push.isSubscribed) {
                    await push.unsubscribe();
                    showToast("Dinner notifications disabled", "info");
                  } else {
                    const ok = await push.subscribe();
                    if (ok) {
                      showToast("Dinner notifications enabled!", "success");
                    } else if (push.permission === "denied") {
                      showToast("Notifications blocked. Enable them in your browser settings.", "error");
                    } else {
                      showToast("Failed to enable notifications", "error");
                    }
                  }
                }}
                disabled={push.isLoading}
                role="switch"
                aria-checked={push.isSubscribed}
              >
                <span className="settings-toggle-track">
                  <span className="settings-toggle-thumb" />
                </span>
              </button>
            </div>

            {push.isSubscribed && (
              <button
                className="settings-action-btn"
                onClick={async () => {
                  const ok = await push.sendTest();
                  if (ok) showToast("Test notification sent!", "success");
                  else showToast("Failed to send test notification", "error");
                }}
                style={{ marginLeft: "auto", display: "block", marginTop: "var(--space-1)" }}
              >
                Send test notification
              </button>
            )}
          </>
        )}

        <div className="settings-field" style={{ marginTop: "var(--space-4)" }}>
          <label htmlFor="settings-expiry-days">Expiration alert window</label>
          <div className="settings-number-row">
            <input
              id="settings-expiry-days"
              type="number"
              min={1}
              max={30}
              value={expirationDays}
              onChange={(e) => handleExpirationDaysChange(parseInt(e.target.value, 10) || 7)}
              className="settings-input settings-input--number"
            />
            <span className="settings-number-suffix">days before expiration</span>
          </div>
          <span className="settings-field-hint">
            Items expiring within this window appear in pantry alerts
          </span>
        </div>
      </div>

      {/* ── Pantry ──────────────────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-header">
          <Package size={18} />
          <h3>Pantry</h3>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-toggle-label">Hide out-of-stock items</span>
            <span className="settings-toggle-desc">
              Automatically hide items marked as out of stock from pantry views
            </span>
          </div>
          <button
            className={`settings-toggle ${hideOutOfStock ? "on" : ""}`}
            onClick={handleHideOutOfStockToggle}
            role="switch"
            aria-checked={hideOutOfStock}
          >
            <span className="settings-toggle-track">
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        </div>
      </div>

      {/* ── Data & Privacy ────────────────────────────── */}
      <div className="settings-section">
        <div className="settings-section-header">
          <RotateCcw size={18} />
          <h3>Data</h3>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-toggle-label">Reset tutorial</span>
            <span className="settings-toggle-desc">
              Show the onboarding walkthrough again
            </span>
          </div>
          <button className="settings-action-btn" onClick={handleResetTutorial}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
