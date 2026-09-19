import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import type { Product } from '@/types/database';

/** stock ≤ this many units counts as "low stock". */
export const LOW_STOCK_THRESHOLD = 10;

export type DashboardStats = {
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
};

type DashboardStatus = 'loading' | 'ready' | 'error';

type DashboardState = {
  status: DashboardStatus;
  stats: DashboardStats;
  recent: Product[];
  lowStockItems: Product[];
  errorMessage: string | null;
};

const INITIAL_STATE: DashboardState = {
  status: 'loading',
  stats: { total: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
  recent: [],
  lowStockItems: [],
  errorMessage: null,
};

/** Stock → status mapping shared by dashboard cards. */
export function stockStatus(stock: number): 'active' | 'pending' | 'inactive' {
  if (stock <= 0) return 'inactive';
  if (stock <= LOW_STOCK_THRESHOLD) return 'pending';
  return 'active';
}

/**
 * Live inventory statistics for the admin dashboard, straight from
 * Supabase (RLS-scoped to the signed-in admin). Stats are exact head
 * counts — no payload — computed as a clean partition:
 *   out of stock = 0 · low = 1..threshold · in stock = above threshold.
 */
export function useAdminDashboard() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // head: true → counts only, zero rows transferred.
      const base = () => supabase.from('products').select('id', { count: 'exact', head: true });

      const [totalR, inStockR, lowStockR, outStockR, recentR, lowListR] = await Promise.all([
        base(),
        base().gt('stock', LOW_STOCK_THRESHOLD),
        base().gt('stock', 0).lte('stock', LOW_STOCK_THRESHOLD),
        base().eq('stock', 0),
        supabase.from('products').select('*').order('created_at', { ascending: false }).limit(5),
        supabase
          .from('products')
          .select('*')
          .gt('stock', 0)
          .lte('stock', LOW_STOCK_THRESHOLD)
          .order('stock', { ascending: true })
          .limit(5),
      ]);

      for (const r of [totalR, inStockR, lowStockR, outStockR, recentR, lowListR]) {
        if (r.error) throw r.error;
      }

      setState({
        status: 'ready',
        stats: {
          total: totalR.count ?? 0,
          inStock: inStockR.count ?? 0,
          lowStock: lowStockR.count ?? 0,
          outOfStock: outStockR.count ?? 0,
        },
        recent: recentR.data ?? [],
        lowStockItems: lowListR.data ?? [],
        errorMessage: null,
      });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: 'error',
        errorMessage: toUserMessage(error, 'Failed to load dashboard data.'),
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Pull-to-refresh handler: reloads while showing the spinner. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { ...state, refreshing, refresh, reload: load };
}
