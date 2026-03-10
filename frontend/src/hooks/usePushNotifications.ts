/**
 * usePushNotifications.ts
 * Hook for managing Web Push notification subscriptions.
 * Handles service worker registration, permission requests,
 * and subscription management via the backend API.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import { getCsrfHeaders } from '../lib/csrf';

type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const usePushNotifications = () => {
  const { session, getToken } = useAuth();
  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
    return Notification.permission as PushPermission;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check current subscription status on mount
  useEffect(() => {
    if (!session || permission === 'unsupported') return;

    navigator.serviceWorker.ready.then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    }).catch(() => {});
  }, [session, permission]);

  const subscribe = useCallback(async () => {
    if (permission === 'unsupported') return false;
    setIsLoading(true);

    try {
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') {
        setIsLoading(false);
        return false;
      }

      // Get VAPID public key from backend
      const token = await getToken();
      const keyResp = await fetch(`${API_BASE_URL}/api/notifications/vapid-public-key`);
      if (!keyResp.ok) {
        setIsLoading(false);
        return false;
      }
      const { public_key } = await keyResp.json();

      // Register service worker if needed
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });

      const subJson = subscription.toJSON();

      // Send subscription to backend
      const resp = await fetch(`${API_BASE_URL}/api/notifications/subscribe`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (resp.ok) {
        setIsSubscribed(true);
        setIsLoading(false);
        return true;
      }
    } catch (err) {
      console.error('Push subscription failed:', err);
    }

    setIsLoading(false);
    return false;
  }, [permission, getToken]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const token = await getToken();

        // Unsubscribe from backend
        await fetch(`${API_BASE_URL}/api/notifications/unsubscribe`, {
          method: 'DELETE',
          headers: getCsrfHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          }),
          credentials: 'include',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Unsubscribe from browser
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }

    setIsLoading(false);
  }, [getToken]);

  const sendTest = useCallback(async () => {
    try {
      const token = await getToken();
      await fetch(`${API_BASE_URL}/api/notifications/test`, {
        method: 'POST',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });
      return true;
    } catch {
      return false;
    }
  }, [getToken]);

  return {
    permission,
    isSubscribed,
    isLoading,
    isSupported: permission !== 'unsupported',
    subscribe,
    unsubscribe,
    sendTest,
  };
};
