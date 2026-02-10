import { useState } from 'react';
import { RefreshCw, Link2, Unlink } from 'lucide-react';
import {
  useGoogleCalendarStatus,
  useGoogleCalendarAuthUrl,
  useImportGoogleCalendarEvents,
  useDisconnectGoogleCalendar,
} from '../hooks';
import './GoogleCalendarButton.css';

const GoogleCalendarButton = ({ showToast }) => {
  const [isImporting, setIsImporting] = useState(false);

  const { data: status, isLoading: statusLoading } = useGoogleCalendarStatus();
  const authUrlMutation = useGoogleCalendarAuthUrl();
  const importMutation = useImportGoogleCalendarEvents();
  const disconnectMutation = useDisconnectGoogleCalendar();

  const handleConnect = async () => {
    try {
      const data = await authUrlMutation.mutateAsync();
      // Redirect to Google OAuth
      window.location.href = data.auth_url;
    } catch (error) {
      showToast(error.message || 'Failed to start Google Calendar connection', 'error');
    }
  };

  const handleSync = async () => {
    setIsImporting(true);
    try {
      const result = await importMutation.mutateAsync({});
      showToast(result.message, 'success');
    } catch (error) {
      if (error.message.includes('not connected') || error.message.includes('expired')) {
        showToast('Please reconnect your Google Calendar', 'error');
      } else {
        showToast(error.message || 'Failed to import events', 'error');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Calendar?')) {
      return;
    }

    try {
      await disconnectMutation.mutateAsync();
      showToast('Google Calendar disconnected', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to disconnect', 'error');
    }
  };

  if (statusLoading) {
    return (
      <div className="google-calendar-section">
        <div className="google-calendar-loading">Loading...</div>
      </div>
    );
  }

  const isConnected = status?.connected;

  return (
    <div className="google-calendar-section">
      <div className="google-calendar-header">
        <svg className="google-calendar-icon" viewBox="0 0 24 24" width="18" height="18">
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
        <span>Google Calendar</span>
      </div>

      {isConnected ? (
        <div className="google-calendar-connected">
          <div className="google-calendar-email" title={status.google_email}>
            {status.google_email || 'Connected'}
          </div>
          <div className="google-calendar-actions">
            <button
              className="google-calendar-sync-btn"
              onClick={handleSync}
              disabled={isImporting || importMutation.isPending}
              title="Sync events from Google Calendar"
            >
              <RefreshCw size={14} className={isImporting ? 'spinning' : ''} />
              <span>{isImporting ? 'Syncing...' : 'Sync'}</span>
            </button>
            <button
              className="google-calendar-disconnect-btn"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              title="Disconnect Google Calendar"
            >
              <Unlink size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          className="google-calendar-connect-btn"
          onClick={handleConnect}
          disabled={authUrlMutation.isPending}
        >
          <Link2 size={14} />
          <span>{authUrlMutation.isPending ? 'Connecting...' : 'Connect'}</span>
        </button>
      )}
    </div>
  );
};

export default GoogleCalendarButton;
