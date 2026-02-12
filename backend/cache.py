import time


class TTLCache:
    """Simple in-memory TTL cache."""

    def __init__(self):
        self._store = {}

    def get(self, key):
        """Get a value from cache. Returns None if expired or missing."""
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if time.time() > expiry:
            del self._store[key]
            return None
        return value

    def set(self, key, value, ttl):
        """Set a value with TTL in seconds."""
        self._store[key] = (value, time.time() + ttl)

    def invalidate_prefix(self, prefix):
        """Remove all keys that start with the given prefix."""
        keys_to_delete = [k for k in self._store if k.startswith(prefix)]
        for k in keys_to_delete:
            del self._store[k]


def make_cache_key(user_id, endpoint, **params):
    """Build a deterministic cache key from user, endpoint, and params."""
    param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v is not None)
    return f"{endpoint}:{user_id}:{param_str}"


api_cache = TTLCache()
