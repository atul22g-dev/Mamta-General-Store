export interface Product {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
}

export interface RecentProduct extends Product {
  lookedUpAt: Date;
}

export interface AdminItem {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'pending' | 'inactive';
}

declare global {
  /**
   * Boot handoff from the pre-hydration shell (src/app/+html.tsx): the
   * shell defines `__signalAppReady` in an inline script; the app calls it
   * on web mount to dismiss the startup splash. Optional-chained so test
   * and SSR environments without the shell still typecheck and run.
   */
  interface Window {
    __signalAppReady?: () => void;
  }
}
