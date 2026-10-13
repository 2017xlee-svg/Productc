export interface Attachment {
  id: string;
  name: string;
  url?: string;
  dataUrl?: string;
  storagePath?: string;
  size?: number;
  mimetype?: string;
  width?: number;
  height?: number;
  smUrl?: string;
  lgUrl?: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  tags: string[];
  overview: string;
  pictures: Attachment[];
  specificationIds: string[];
  reviewIds: string[];
  createdTime?: string;
  updatedAt?: string;
}

export interface Specification {
  id: string;
  specName: string;
  details: string;
  unit?: string;
  order: number;
  productId: string;
  productTitle: string;
  pictures: Attachment[];
  updatedAt?: string;
}

export interface UserReview {
  id: string;
  reviewNumber: number;
  title?: string;
  body: string;
  pros?: string[];
  cons?: string[];
  storageUrl?: string;
  storagePath?: string;
  productIds: string[];
  productTitles: string[];
  pictures: Attachment[];
  authorName?: string;
  authorAvatar?: string;
  rating?: number;
  createdTime?: string;
  updatedAt?: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface DatabaseState {
  shareId: string;
  baseId: string;
  lastSynced: string;
  lastPushed?: string;
  sourceUrl: string;
  products: Product[];
  specifications: Specification[];
  reviews: UserReview[];
  users: AppUser[];
}

export interface TeableConfig {
  baseUrl: string;
  shareUrl: string;
  shareId: string;
  baseId: string;
  apiKey: string;
}

export type ViewMode = 'grid' | 'table' | 'compare' | 'smart-add';

export interface SyncProgress {
  action: 'push' | 'pull';
  stage: string;
  stepNumber: number;
  totalSteps: number;
  percent: number;
  detail: string;
  currentCollection?: string;
  itemsProcessed?: number;
  itemsTotal?: number;
  startedAt: string;
  estimatedRemainingSeconds?: number;
}

export interface SyncHistoryLog {
  id: string;
  action: 'push' | 'pull';
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  message: string;
  counts?: {
    products?: number;
    specifications?: number;
    reviews?: number;
    images?: number;
  };
  details?: string[];
  error?: string;
}
