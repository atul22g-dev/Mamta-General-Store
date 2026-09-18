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
