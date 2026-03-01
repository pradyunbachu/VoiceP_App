import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
  name?: string;
  fallback?: (info: { error: Error | null; reset: () => void }) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.name || "unknown"}]`, error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <AlertTriangle size={32} className="error-boundary-icon" />
            <h3 className="error-boundary-title">Something went wrong</h3>
            <p className="error-boundary-message">
              An unexpected error occurred. Please try again.
            </p>
            <button className="error-boundary-button" onClick={this.handleReset}>
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
