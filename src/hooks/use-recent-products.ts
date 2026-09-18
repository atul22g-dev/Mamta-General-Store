import { useState, useCallback } from 'react';

import { RecentProduct } from '@/types';

export function useRecentProducts() {
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);

  const addRecentProduct = useCallback((product: Omit<RecentProduct, 'lookedUpAt'>) => {
    setRecentProducts((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [
        { ...product, lookedUpAt: new Date() },
        ...filtered,
      ].slice(0, 10);
    });
  }, []);

  const clearRecentProducts = useCallback(() => {
    setRecentProducts([]);
  }, []);

  return {
    recentProducts,
    addRecentProduct,
    clearRecentProducts,
  };
}
