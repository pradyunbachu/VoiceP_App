import { useRef, useEffect, useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { ShowToast } from "../types";

interface PendingDelete {
  timer: ReturnType<typeof setTimeout>;
  onDelete: () => void;
  snapshots: Map<QueryKey, unknown>;
}

interface ScheduleDeleteOptions {
  id: string | number;
  queryKeyPrefix: string[];
  filterFn: (item: any) => boolean;
  dataKey?: string | null;
  onDelete: () => void;
  message: string;
}

export function useUndoDelete(showToast: ShowToast) {
  const queryClient = useQueryClient();
  const pendingRef = useRef(new Map<string | number, PendingDelete>());

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
    ({ id, queryKeyPrefix, filterFn, dataKey, onDelete, message }: ScheduleDeleteOptions) => {
      const existing = pendingRef.current.get(id);
      if (existing) {
        clearTimeout(existing.timer);
        existing.onDelete();
        pendingRef.current.delete(id);
      }

      queryClient.cancelQueries({ queryKey: queryKeyPrefix });

      const snapshots = new Map<QueryKey, unknown>();
      const queries = queryClient.getQueryCache().findAll({
        queryKey: queryKeyPrefix,
      });

      for (const query of queries) {
        const data = queryClient.getQueryData(query.queryKey);
        if (data !== undefined) {
          snapshots.set(query.queryKey, structuredClone(data));
        }
      }

      for (const query of queries) {
        const data = queryClient.getQueryData(query.queryKey) as Record<string, unknown> | unknown[] | undefined;
        if (data === undefined) continue;

        if ((data as Record<string, unknown>)?.pages) {
          const infiniteData = data as { pages: Record<string, unknown>[]; pageParams: unknown[] };
          const itemsKey = dataKey || 'items';
          queryClient.setQueryData(query.queryKey, {
            ...infiniteData,
            pages: infiniteData.pages.map((page) => {
              const arr = (page[itemsKey] || page.expenses) as Record<string, unknown>[] | undefined;
              if (!Array.isArray(arr)) return page;
              const filtered = arr.filter(filterFn);
              const key = page[itemsKey] ? itemsKey : 'expenses';
              return {
                ...page,
                [key]: filtered,
                ...(page.total_count !== undefined
                  ? { total_count: (page.total_count as number) - (arr.length - filtered.length) }
                  : {}),
              };
            }),
          });
        } else if (dataKey && (data as Record<string, unknown>)[dataKey]) {
          const wrappedData = data as Record<string, unknown>;
          const arr = wrappedData[dataKey] as Record<string, unknown>[];
          const filtered = arr.filter(filterFn);
          queryClient.setQueryData(query.queryKey, {
            ...wrappedData,
            [dataKey]: filtered,
            ...(wrappedData.total_count !== undefined
              ? { total_count: (wrappedData.total_count as number) - (arr.length - filtered.length) }
              : {}),
          });
        } else if (Array.isArray(data)) {
          queryClient.setQueryData(query.queryKey, data.filter(filterFn as (item: unknown) => boolean));
        }
      }

      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        onDelete();
      }, 5000);

      pendingRef.current.set(id, { timer, onDelete, snapshots });

      showToast(message, "info", 5000, {
        label: "Undo",
        onClick: () => {
          const entry = pendingRef.current.get(id);
          if (entry) {
            clearTimeout(entry.timer);
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
