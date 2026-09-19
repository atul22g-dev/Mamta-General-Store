import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  deleteProduct,
  listProducts,
  type ProductWithImages,
} from '@/lib/products/product-service';

export const SEARCH_DEBOUNCE_MS = 350;

export type ProductListStatus = 'loading' | 'ready' | 'error';

export type DeleteOutcome = { ok: true } | { ok: false; error: string };

export type UseProductList = {
  /** Raw text in the search box. */
  search: string;
  setSearch: (text: string) => void;
  /** Debounced term actually sent to Supabase. */
  debouncedSearch: string;
  products: ProductWithImages[];
  status: ProductListStatus;
  errorMessage: string | null;
  /** Pull-to-refresh in flight. */
  refreshing: boolean;
  /** Initial load in flight (shows the full-page loader). */
  loading: boolean;
  /** Product id whose delete request is in flight, if any. */
  deletingId: string | null;
  refresh: () => Promise<void>;
  /** Optimistic delete; returns the outcome so the UI can alert on failure. */
  deleteProductById: (productId: string) => Promise<DeleteOutcome>;
};

/**
 * Catalog state for the admin list: debounced search, pull-to-refresh,
 * focus refetch (keeps the list fresh after add/edit/delete elsewhere in
 * the stack), and optimistic delete. Supabase calls live in the service.
 */
export function useProductList(): UseProductList {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [products, setProducts] = useState<ProductWithImages[]>([]);
  const [status, setStatus] = useState<ProductListStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // True once a fetch has succeeded — later focus fetches become silent
  // (stale data stays on screen instead of flashing a loader).
  const hasLoadedRef = useRef(false);

  // Debounce the search term before it hits Supabase.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const silent = hasLoadedRef.current;

    const result = await listProducts({ search: debouncedSearch });
    if (result.ok) {
      hasLoadedRef.current = true;
      setProducts(result.data);
      setStatus('ready');
      setErrorMessage(null);
    } else if (!silent) {
      setStatus('error');
      setErrorMessage(result.error);
    }
    // Silent failures keep the existing list on screen.
  }, [debouncedSearch]);

  // Refetch on mount AND whenever the screen regains focus (e.g. back from
  // add/edit) so the list always reflects the database.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const deleteProductById = useCallback(async (productId: string): Promise<DeleteOutcome> => {
    setDeletingId(productId);
    const result = await deleteProduct(productId);
    setDeletingId(null);

    if (result.ok) {
      // Remove locally — no refetch needed for a single delete.
      setProducts((previous) => previous.filter((product) => product.id !== productId));
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }, []);

  return {
    search,
    setSearch,
    debouncedSearch,
    products,
    status,
    errorMessage,
    refreshing,
    loading: status === 'loading',
    deletingId,
    refresh,
    deleteProductById,
  };
}
