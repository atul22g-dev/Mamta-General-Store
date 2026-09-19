import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  getProduct,
  type ProductWithImages,
} from '@/lib/products/product-service';

export type ProductDetailStatus = 'loading' | 'ready' | 'error' | 'not-found';

export type UseProductDetail = {
  product: ProductWithImages | null;
  status: ProductDetailStatus;
  errorMessage: string | null;
  reload: () => void;
};

/**
 * Loads a single product with its images for the admin detail screen.
 * Refetches on focus (e.g. back from edit) — silently once loaded, so the
 * fresh data swaps in without a loading flash. `not-found` distinguishes a
 * missing row from a failed request.
 */
export function useProductDetail(productId: string | undefined): UseProductDetail {
  const [product, setProduct] = useState<ProductWithImages | null>(null);
  const [status, setStatus] = useState<ProductDetailStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadedRef = useRef(false);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useFocusEffect(
    useCallback(() => {
      // `attempt` is a re-run trigger bumped by reload(); it is read here so
      // the dependency is intentional, not spurious.
      void attempt;

      if (!productId) {
        setStatus('not-found');
        return;
      }

      let cancelled = false;
      if (!loadedRef.current) setStatus('loading');

      void getProduct(productId).then((result) => {
        if (cancelled) return;
        if (result.ok) {
          loadedRef.current = true;
          setProduct(result.data);
          setStatus('ready');
          setErrorMessage(null);
        } else {
          setProduct(null);
          setStatus(result.notFound ? 'not-found' : 'error');
          setErrorMessage(result.error);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [productId, attempt]),
  );

  return { product, status, errorMessage, reload };
}
