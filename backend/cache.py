"""In-memory API response cache with time-to-live (TTL) expiration.

Provides a lightweight, per-process cache to reduce redundant external API
calls (e.g. Supabase queries). Entries expire automatically on read after
their TTL elapses. Not shared across workers — suitable for single-process
deployments or as a best-effort optimization in multi-worker setups.
"""

import time


class TTLCache:
    """Simple in-memory TTL cache.

    Stores entries as (value, expiry_timestamp) tuples. Expired entries are
    lazily evicted on the next get() call rather than via background cleanup.
    """

    def __init__(self):
        self._store = {}  # key -> (value, expiry_timestamp)

    def get(self, key):
        """Get a value from cache. Returns None if expired or missing."""
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if time.time() > expiry:
            del self._store[key]  # Lazy eviction on read
            return None
        return value

    def set(self, key, value, ttl):
        """Set a value with TTL in seconds."""
        self._store[key] = (value, time.time() + ttl)

    def invalidate_prefix(self, prefix):
        """Remove all keys that start with the given prefix.

        Useful for busting all cached data for a specific user or endpoint
        (e.g. invalidate_prefix("pantry:user123") after a pantry update).
        """
        # Snapshot keys first to avoid mutating dict during iteration
        keys_to_delete = [k for k in self._store if k.startswith(prefix)]
        for k in keys_to_delete:
            del self._store[k]


def make_cache_key(user_id, endpoint, **params):
    """Build a deterministic cache key from user, endpoint, and params.

    Params are sorted alphabetically and None values excluded so that
    equivalent queries always produce the same key regardless of kwarg order.
    """
    param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v is not None)
    return f"{endpoint}:{user_id}:{param_str}"


# Singleton cache instance shared across the application
api_cache = TTLCache()
