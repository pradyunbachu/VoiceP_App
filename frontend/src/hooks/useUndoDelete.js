/**
 * useUndoDelete.js
 * Hook for undo-able deletes with toast notifications.
 * Optimistically removes items from the React Query cache, starts a 5 s timer,
 * and only fires the real API delete when the timer expires. If the user clicks
 * "Undo" in the toast, the cache snapshots are restored and the delete is cancelled.
 * Pending deletes are flushed immediately on unmount to prevent data loss.
 */
import { useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook for delayed-delete with undo support.
 *
 * scheduleDelete({
 *   id,              – unique key for this pending delete (e.g. item id or "bulk-<timestamp>")
 *   queryKeyPrefix,  – first element(s) of the query key to match (e.g. ['expenses'] or ['pantry'])
 *   filterFn,        – (cacheEntry) => filtered array/object  — removes deleted items from cache
 *   dataKey,         – if the cached data is wrapped (e.g. { expenses: [...] }), the key; null for plain arrays
 *   onDelete,        – async () => void — the real API delete call
 *   message,         – toast message
 * })
 */
export function useUndoDelete(showToast) {
  const queryClient = useQueryClient();
  const pendingRef = useRef(new Map()); // id → { timer, onDelete, snapshots }

  // On unmount, flush all pending deletes immediately
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      pending.forEach(({ timer, onDelete }) => {
        clearTimeout(timer);
        onDelete();
      });
      pending.clear();
    };
  }, []);

  const scheduleDelete = useCallback(
    ({ id, queryKeyPrefix, filterFn, dataKey, onDelete, message }) => {
      // If the same id is already pending, flush it immediately
      const existing = pendingRef.current.get(id);
      if (existing) {
        clearTimeout(existing.timer);
        existing.onDelete();
        pendingRef.current.delete(id);
      }

      // 1. Cancel outgoing refetches so they don't overwrite our optimistic update
      queryClient.cancelQueries({ queryKey: queryKeyPrefix });

      // 2. Snapshot all matching query caches
      const snapshots = new Map();
      const queries = queryClient.getQueryCache().findAll({
        queryKey: queryKeyPrefix,
      });

      for (const query of queries) {
        const data = queryClient.getQueryData(query.queryKey);
        if (data !== undefined) {
          snapshots.set(query.queryKey, structuredClone(data));
        }
      }

      // 3. Optimistically remove the deleted item(s) from each cached query
      for (const query of queries) {
        const data = queryClient.getQueryData(query.queryKey);
        if (data === undefined) continue;

        if (data?.pages) {
          // Infinite query data shape ({ pages: [...], pageParams: [...] })
          const itemsKey = dataKey || 'items';
          queryClient.setQueryData(query.queryKey, {
            ...data,
            pages: data.pages.map((page) => {
              const arr = page[itemsKey] || page.expenses;
              if (!Array.isArray(arr)) return page;
              const filtered = arr.filter(filterFn);
              const key = page[itemsKey] ? itemsKey : 'expenses';
              return {
                ...page,
                [key]: filtered,
                ...(page.total_count !== undefined
                  ? { total_count: page.total_count - (arr.length - filtered.length) }
                  : {}),
              };
            }),
          });
        } else if (dataKey && data[dataKey]) {
          // Wrapped data (e.g. { expenses: [...], total_count })
          const filtered = data[dataKey].filter(filterFn);
          queryClient.setQueryData(query.queryKey, {
            ...data,
            [dataKey]: filtered,
            ...(data.total_count !== undefined
              ? { total_count: data.total_count - (data[dataKey].length - filtered.length) }
              : {}),
          });
        } else if (Array.isArray(data)) {
          // Plain array
          queryClient.setQueryData(query.queryKey, data.filter(filterFn));
        }
        // If the data shape is something else (stats, etc.), skip
      }

      // 4. Start 5s timeout → on expiry, execute the real delete
      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        onDelete();
      }, 5000);

      // 5. Store the pending entry
      pendingRef.current.set(id, { timer, onDelete, snapshots });

      // 6. Show toast with undo action
      showToast(message, "info", 5000, {
        label: "Undo",
        onClick: () => {
          // Cancel the pending delete
          const entry = pendingRef.current.get(id);
          if (entry) {
            clearTimeout(entry.timer);
            // Restore all snapshots
            entry.snapshots.forEach((snapshot, queryKey) => {
              queryClient.setQueryData(queryKey, snapshot);
            });
            pendingRef.current.delete(id);
          }
        },
      });
    },
    [queryClient, showToast]
  );

  return { scheduleDelete };
}
