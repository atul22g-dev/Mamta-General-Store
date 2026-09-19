import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  listProducts,
  type ProductWithImages,
} from '@/lib/products/product-service';

export const SEARCH_DEBOUNCE_MS = 350;

export type SearchStatus = 'loading' | 'ready' | 'error';

export type UseProductSearch = {
  /** Raw text in the search box. */
  search: string;
  setSearch: (text: string) => void;
  /** Active category filter ('all' → no filter). */
  category: string;
  setCategory: (category: string) => void;
  products: ProductWithImages[];
  status: SearchStatus;
  errorMessage: string | null;
  /** True on the very first load (full-page loader). */
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Manual product search state: debounced name query + category filter over
 * the live Supabase catalog. Once loaded, refetches are silent so typing
 * never flashes a loader over existing results.
 */
export function useProductSearch(): UseProductSearch {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const [products, setProducts] = useState<ProductWithImages[]>([]);
  const [status, setStatus] = useState<SearchStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const [debounced, setDebounced] = useState({ term: '', category: 'all' });

  // Debounce BOTH inputs together so a query fires once per settled change.
  // The setter returns the previous object when nothing changed, so an
  // already-applied update doesn't trigger a second fetch.
  useEffect(() => {
    const timer = setTimeout(() => {
      const term = search.trim();
      setDebounced((previous) =>
        previous.term === term && previous.category === category
          ? previous
          : { term, category },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, category]);

  /** Category taps apply instantly (no debounce) — chips should feel snappy. */
  const changeCategory = useCallback((next: string) => {
    setCategory(next);
    setDebounced((previous) =>
      previous.category === next ? previous : { ...previous, category: next },
    );
  }, []);

  const load = useCallback(async () => {
    const result = await listProducts({
      search: debounced.term,
      category: debounced.category,
    });

    if (result.ok) {
      hasLoadedRef.current = true;
      setProducts(result.data);
      setStatus('ready');
      setErrorMessage(null);
    } else if (!hasLoadedRef.current) {
      setStatus('error');
      setErrorMessage(result.error);
    }
    // Silent failures keep the previous results on screen.
  }, [debounced]);

  // Fetch on mount and on focus (back from result) — useFocusEffect
  // subscribes like an external system, keeping the fetch out of render.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return {
    search,
    setSearch,
    category,
    setCategory: changeCategory,
    products,
    status,
    errorMessage,
    loading: status === 'loading',
    refresh,
  };
}
