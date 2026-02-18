/*
 * Login.jsx
 * Authentication page supporting email/password login, new account
 * registration (with username), and Google OAuth sign-in via Supabase.
 * Toggles between login and sign-up forms, validates input lengths, and
 * displays inline error messages. On success, calls the onLogin callback
 * with the session token and user data.
 */
import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

const Login = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { signIn, signUp, signInWithGoogle } = useAuth();

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Login with Supabase
        const { data, error } = await signIn(email, password);
        if (error) throw error;

        const userData = {
          id: data.user.id,
          email: data.user.email,
          username: data.user.user_metadata?.username || email.split("@")[0],
        };

        onLogin(data.session.access_token, userData);
      } else {
        // Validate username for registration
        if (!username || username.trim().length < 3) {
          throw new Error("Username must be at least 3 characters");
        }

        // Sign up with Supabase
        const { data, error } = await signUp(email, password, username);
        if (error) throw error;

        // Check if email confirmation is required
        if (data.user && !data.session) {
          setError("Please check your email to confirm your account.");
          setLoading(false);
          return;
        }

        const userData = {
          id: data.user.id,
          email: data.user.email,
          username: username,
        };

        onLogin(data.session.access_token, userData);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2>{isLogin ? "Login" : "Create Account"}</h2>
          <p>
            {isLogin
              ? "Welcome back to voxal"
              : "Start tracking your expenses"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Enter your username"
                minLength={3}
              />
              <small style={{ color: "#a0a0a0", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                Must be at least 3 characters
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              minLength={6}
            />
            {!isLogin && (
              <small style={{ color: "#a0a0a0", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                Must be at least 6 characters
              </small>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? (
              "Processing..."
            ) : isLogin ? (
              <>
                <LogIn size={18} />
                <span>Login</span>
              </>
            ) : (
              <>
                <UserPlus size={18} />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>

        <div className="divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="google-button"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="login-switch">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
                setUsername("");
              }}
              className="switch-button"
            >
              {isLogin ? "Sign up" : "Login"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
