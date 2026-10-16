/**
 * ProductCompare Hub - Interactive Product Comparison Platform
 * Synchronized live with Teable Base: https://app.teable.ai/s/IkafxjMCq
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutGrid,
  List,
  Plus,
  Scale,
  Database,
  ExternalLink,
  Filter,
  Check,
  Eye,
  RefreshCw,
  Sparkles,
  Search,
  X,
  Tag,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
  Download,
  Upload,
  Archive,
  HardDrive,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { INITIAL_DATABASE } from './data/seedData';
import {
  DatabaseState,
  Product,
  AppUser,
  UserReview,
  Specification,
  Attachment,
  ViewMode,
  SyncProgress,
  SyncHistoryLog,
} from './types';

// Original Components
import { Navbar } from './components/Navbar';
import { ProductCard } from './components/ProductCard';
import { TagFilterBar } from './components/TagFilterBar';
import { ComparisonTray } from './components/ComparisonTray';
import { ComparisonMatrix } from './components/ComparisonMatrix';
import { ReviewsSection } from './components/ReviewsSection';
import { ProductDetailModal } from './components/ProductDetailModal';
import { AddProductModal } from './components/AddProductModal';
import { EditProductModal } from './components/EditProductModal';
import { UnifiedReviewEditor } from './components/UnifiedReviewEditor';
import { UnifiedReviewViewer } from './components/UnifiedReviewViewer';
import { AddSpecModal } from './components/AddSpecModal';
import { EditSpecModal } from './components/EditSpecModal';
import { SyncModal } from './components/SyncModal';
import { DataBackupView } from './components/DataBackupView';
import { SmartAddProduct } from './components/SmartAddProduct';
import { getProductImage, getFallbackImage } from './utils/imageFallback';
import { rehydrateMediaFromIndexedDb } from './utils/imageCompressor';
import {
  loadLocalDatabase,
  saveLocalDatabase,
  initDatabaseFromIndexedDB,
  loadSeedCatalog,
  clearLocalDatabase,
  localAddProduct,
  localUpdateProduct,
  localDeleteProduct,
  localAddSpecification,
  localUpdateSpecification,
  localDeleteSpecification,
  localReorderSpecifications,
  localAddReview,
  localAddReviewsBatch,
  localUpdateReview,
  localDeleteReview,
} from './lib/localDatabase';
import { deleteReviewMediaBlobs, cleanupOrphanMediaBlobs } from './utils/mediaStorageCleaner';

export default function App() {
  // Database state initialized from local-first storage
  const [database, setDatabase] = useState<DatabaseState>(() => loadLocalDatabase());
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Active view: 'grid' | 'table' | 'compare' | 'reviews' | 'database'
  const [currentView, setCurrentView] = useState<ViewMode | 'reviews' | 'database'>('grid');

  // Search query (from Navbar)
  const [searchQuery, setSearchQuery] = useState('');

  // Compared product IDs (starts empty by default)
  const [comparedProductIds, setComparedProductIds] = useState<string[]>([]);

  // Current user
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const db = loadLocalDatabase();
    return (db.users || []).find((u) => u.role === 'Admin') || (db.users || [])[0] || null;
  });

  // Modals state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Unified Full-Screen Review state
  const [isReviewEditorOpen, setIsReviewEditorOpen] = useState(false);
  const [reviewToEdit, setReviewToEdit] = useState<UserReview | null>(null);
  const [reviewInitialProductId, setReviewInitialProductId] = useState<string | undefined>(undefined);
  const [selectedReviewForView, setSelectedReviewForView] = useState<UserReview | null>(null);

  // Specification modals
  const [isAddSpecOpen, setIsAddSpecOpen] = useState(false);
  const [specProduct, setSpecProduct] = useState<Product | null>(null);
  const [selectedSpecForEdit, setSelectedSpecForEdit] = useState<Specification | null>(null);

  // Reliable startup hydration: IndexedDB first (durable data), rehydrate binary blobs
  useEffect(() => {
    let isCancelled = false;

    async function initializeDatabaseState() {
      try {
        const idbState = await initDatabaseFromIndexedDB();
        if (idbState && !isCancelled) {
          // Rehydrate binary blobs into active memory object URLs
          await rehydrateMediaFromIndexedDb(idbState);
          if (!isCancelled) {
            setDatabase({ ...idbState });
          }
        }
      } catch (err) {
        console.warn('Initial IndexedDB hydration note:', err);
      }
    }

    initializeDatabaseState();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Handler for restoring full database (ZIP or JSON)
  const handleRestoreDatabase = (restored: DatabaseState) => {
    setDatabase(restored);
    saveLocalDatabase(restored);
    setSyncNotice('Backup restored successfully into local database.');
    setTimeout(() => setSyncNotice(null), 5000);
  };

  // Handler for loading sample catalog (separate manual button)
  const handleLoadSeedData = () => {
    const seed = loadSeedCatalog();
    setDatabase(seed);
    setSyncNotice('Sample benchmark catalog loaded successfully.');
    setTimeout(() => setSyncNotice(null), 5000);
  };

  // Handler for clearing all data (separate manual button)
  const handleClearData = () => {
    const empty = clearLocalDatabase();
    setDatabase(empty);
    setComparedProductIds([]);
    setSyncNotice('Catalog cleared. You now have a clean blank catalog.');
    setTimeout(() => setSyncNotice(null), 5000);
  };

  // Compare toggling
  const handleToggleCompare = (product: Product) => {
    if (comparedProductIds.includes(product.id)) {
      setComparedProductIds(comparedProductIds.filter((id) => id !== product.id));
    } else {
      setComparedProductIds([...comparedProductIds, product.id]);
    }
  };

  const handleRemoveCompared = (productId: string) => {
    setComparedProductIds(comparedProductIds.filter((id) => id !== productId));
  };

  // Products currently marked for comparison (preserves exact selection/slot order)
  const comparedProducts = useMemo(() => {
    const safeProducts = Array.isArray(database?.products) ? database.products : [];
    return comparedProductIds
      .map((id) => safeProducts.find((p) => p.id === id))
      .filter((p): p is Product => p !== undefined);
  }, [database?.products, comparedProductIds]);

  // Tag filter for Catalog
  const [catalogTagFilter, setCatalogTagFilter] = useState<string>('All');

  // Compute all available tags, brands, and product names for catalog
  const { catalogTags, catalogBrands, catalogProductNames } = useMemo(() => {
    const tags = new Set<string>();
    const brands = new Set<string>();
    const prods = new Set<string>();
    const safeProducts = Array.isArray(database?.products) ? database.products : [];
    safeProducts.forEach((p) => {
      if (Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          if (t && t.trim()) tags.add(t.trim());
        });
      }
      if (p.brand && p.brand.trim()) {
        brands.add(p.brand.trim());
      }
      if (p.name && p.name.trim()) {
        prods.add(p.name.trim());
      }
    });
    const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    return {
      catalogTags: Array.from(tags).sort(sortFn),
      catalogBrands: Array.from(brands).sort(sortFn),
      catalogProductNames: Array.from(prods).sort(sortFn),
    };
  }, [database?.products]);

  // Filtered products for catalog
  const filteredProducts = useMemo(() => {
    const safeProducts = Array.isArray(database?.products) ? database.products : [];
    const safeSpecs = Array.isArray(database?.specifications) ? database.specifications : [];

    return safeProducts.filter((product) => {
      const safeTags = Array.isArray(product.tags) ? product.tags : [];

      // Filter by tag, brand, or product pill
      if (catalogTagFilter && catalogTagFilter.toLowerCase() !== 'all') {
        const target = catalogTagFilter.toLowerCase();
        const matchTag = safeTags.some((t) => (t || '').toLowerCase() === target);
        const matchBrand = (product.brand || '').toLowerCase() === target;
        const matchProduct = (product.name || '').toLowerCase() === target;
        if (!matchTag && !matchBrand && !matchProduct) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inName = (product.name || '').toLowerCase().includes(q);
        const inBrand = (product.brand || '').toLowerCase().includes(q);
        const inOverview = (product.overview || '').toLowerCase().includes(q);
        const inTags = safeTags.some((t) => (t || '').toLowerCase().includes(q));
        const inSpecs = safeSpecs
          .filter((s) => s.productId === product.id || s.productTitle === product.name)
          .some((s) => (s.specName || '').toLowerCase().includes(q) || (s.details || '').toLowerCase().includes(q));

        if (!inName && !inBrand && !inOverview && !inTags && !inSpecs) {
          return false;
        }
      }
      return true;
    });
  }, [database?.products, database?.specifications, searchQuery, catalogTagFilter]);

  // Persisted custom tags across products and sessions (e.g. viture)
  const [persistedCustomTags, setPersistedCustomTags] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('comparison_custom_tags');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.from(new Set(['viture', ...parsed]));
    } catch {
      return ['viture'];
    }
  });

  const handleAddNewTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setPersistedCustomTags((prev) => {
      if (prev.includes(trimmed)) return prev;
      const updated = [...prev, trimmed];
      try {
        localStorage.setItem('comparison_custom_tags', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  // Compute all unique tags for autocomplete/discovery (sorted A-Z)
  const allExistingTags = useMemo(() => {
    const tagSet = new Set<string>();
    ['viture', 'Smartphone', 'IT product', 'Shoe', 'TV', 'Audio', 'Wearable', 'Home appliance'].forEach((t) =>
      tagSet.add(t)
    );
    (database?.products || []).forEach((p) => {
      p.tags?.forEach((t) => {
        if (t && t.trim()) tagSet.add(t.trim());
      });
    });
    persistedCustomTags.forEach((t) => {
      if (t && t.trim()) tagSet.add(t.trim());
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [database?.products, persistedCustomTags]);

  // Add Product Handler (Local-First)
  const handleAddProduct = async (productData: {
    name: string;
    brand: string;
    tags: string[];
    overview: string;
    pictures?: Attachment[];
    specs: { name: string; details: string; unit?: string; order?: number; pictures?: Attachment[] }[];
  }): Promise<Product> => {
    if (productData.tags && productData.tags.length > 0) {
      productData.tags.forEach((t) => handleAddNewTag(t));
    }

    const { database: updatedDb, product } = localAddProduct(database, productData);
    setDatabase(updatedDb);
    return product;
  };

  // Update Product Handler (Local-First)
  const handleUpdateProduct = async (productId: string, updates: Partial<Product>) => {
    const updatedDb = localUpdateProduct(database, productId, updates);
    setDatabase(updatedDb);
  };

  // Full Product Edit Handler (Local-First)
  const handleSaveProductEdit = async (
    productId: string,
    productData: {
      name: string;
      brand: string;
      tags: string[];
      overview: string;
      pictures: Attachment[];
      specs: { id?: string; name: string; details: string; unit?: string; order?: number; pictures?: Attachment[] }[];
    }
  ) => {
    if (productData.tags && productData.tags.length > 0) {
      productData.tags.forEach((t) => handleAddNewTag(t));
    }
    const updatedDb = localUpdateProduct(database, productId, productData);
    setDatabase(updatedDb);
    if (selectedProduct?.id === productId) {
      const updated = updatedDb.products.find((p: Product) => p.id === productId);
      if (updated) setSelectedProduct(updated);
    }
  };

  // Delete Product Handler (Local-First)
  const handleDeleteProduct = async (productId: string) => {
    const updatedDb = localDeleteProduct(database, productId);
    setDatabase(updatedDb);
    setComparedProductIds((prev) => prev.filter((id) => id !== productId));
  };

  // Reorder Specifications Handler (Local-First)
  const handleReorderSpecs = async (reorders: { id: string; order: number }[]) => {
    const updatedDb = localReorderSpecifications(database, reorders);
    setDatabase(updatedDb);
  };

  // Open Unified Full-Screen Review Editor
  const handleOpenReviewEditor = (review?: UserReview | null, productId?: string) => {
    setReviewToEdit(review || null);
    setReviewInitialProductId(productId || (review ? review.productIds[0] : undefined));
    setIsReviewEditorOpen(true);
  };

  // Save Review from Unified Review Editor
  const handleSaveReview = async (reviewData: {
    id?: string;
    productId?: string;
    productIds?: string[];
    productTitles?: string[];
    body: string;
    authorName: string;
    rating: number;
    pictures: Attachment[];
    title?: string;
    pros?: string[];
    cons?: string[];
    authorAvatar?: string;
  }) => {
    const targetProductId =
      reviewData.productId || (reviewData.productIds && reviewData.productIds[0]) || '';

    setDatabase((prevDb) => {
      if (reviewData.id) {
        // Update existing review
        const updatedDb = localUpdateReview(prevDb, reviewData.id, {
          title: reviewData.title,
          body: reviewData.body,
          pros: reviewData.pros,
          cons: reviewData.cons,
          authorName: reviewData.authorName || currentUser?.name || 'Verified Reviewer',
          authorAvatar: reviewData.authorAvatar,
          rating: reviewData.rating,
          productId: targetProductId,
          productIds: reviewData.productIds || (targetProductId ? [targetProductId] : []),
          productTitles: reviewData.productTitles,
          pictures: reviewData.pictures,
        });
        if (selectedReviewForView?.id === reviewData.id) {
          const updated = updatedDb.reviews.find((r: UserReview) => r.id === reviewData.id);
          if (updated) setSelectedReviewForView(updated);
        }
        return updatedDb;
      } else {
        // Create new review with all fields including attachments
        const updatedDb = localAddReview(prevDb, {
          productId: targetProductId,
          productIds: reviewData.productIds || (targetProductId ? [targetProductId] : []),
          productTitles: reviewData.productTitles,
          title: reviewData.title,
          body: reviewData.body,
          pros: reviewData.pros,
          cons: reviewData.cons,
          authorName: reviewData.authorName || currentUser?.name || 'Verified Reviewer',
          authorAvatar: reviewData.authorAvatar,
          rating: reviewData.rating,
          pictures: reviewData.pictures,
        });
        return updatedDb;
      }
    });
  };

  // Batch Save Reviews (Atomic addition of multiple imported reviews)
  const handleSaveBatchReviews = async (reviewsDataList: any[]) => {
    if (!Array.isArray(reviewsDataList) || reviewsDataList.length === 0) return;
    setDatabase((prevDb) => {
      const updatedDb = localAddReviewsBatch(prevDb, reviewsDataList);
      return updatedDb;
    });
    setSyncNotice(`Batch imported ${reviewsDataList.length} reviews successfully.`);
    setTimeout(() => setSyncNotice(null), 4000);
  };

  // Delete Review Handler (Local-First + IndexedDB Image Cleanup)
  const handleDeleteReview = async (reviewId: string) => {
    const reviewToDelete = (database?.reviews || []).find((r) => r.id === reviewId);
    const updatedDb = localDeleteReview(database, reviewId);
    setDatabase(updatedDb);

    if (reviewToDelete) {
      // Free up IndexedDB space by deleting its image blobs
      deleteReviewMediaBlobs(reviewToDelete, updatedDb).catch((err) => {
        console.warn('Failed to delete media blobs on review removal:', err);
      });
    }

    if (selectedReviewForView?.id === reviewId) {
      setSelectedReviewForView(null);
    }
  };

  // Add Specification Handler (Local-First)
  const handleAddSpec = async (specData: {
    productId: string;
    specName: string;
    details: string;
    unit?: string;
    order?: number;
    pictures?: Attachment[];
  }): Promise<Specification> => {
    const updatedDb = localAddSpecification(database, specData);
    setDatabase(updatedDb);
    const added = updatedDb.specifications[updatedDb.specifications.length - 1];
    return added;
  };

  // Edit Specification Handler (Local-First)
  const handleUpdateSpec = async (
    specId: string,
    updates: Partial<Specification>
  ) => {
    const updatedDb = localUpdateSpecification(database, specId, updates);
    setDatabase(updatedDb);
  };

  // Delete Specification Handler (Local-First)
  const handleDeleteSpec = async (specId: string) => {
    const updatedDb = localDeleteSpecification(database, specId);
    setDatabase(updatedDb);
    if (selectedSpecForEdit?.id === specId) setSelectedSpecForEdit(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans w-full max-w-full overflow-x-hidden">
      {/* App Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={(view) => setCurrentView(view)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        comparedCount={comparedProductIds.length}
        lastSynced={database.lastSynced}
        lastPushed={database.lastPushed}
        isSyncing={false}
        currentUser={currentUser}
        allUsers={database.users || []}
        onSelectUser={(user) => setCurrentUser(user)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onOpenAddProduct={() => setIsAddProductOpen(true)}
        onOpenFullscreenStudio={() => handleOpenReviewEditor()}
      />

      {/* Sync notice toast */}
      {syncNotice && (
        <div className="bg-indigo-600 text-white text-xs font-semibold py-2 px-4 text-center sticky top-14 sm:top-16 z-30 shadow-xs flex items-center justify-center gap-2">
          <span>{syncNotice}</span>
        </div>
      )}

      {/* Main App Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-6 pb-20 sm:pb-24 pb-safe overflow-x-hidden">
        {/* VIEW 1 & 2: CATALOG (GRID or TABLE) */}
        {(currentView === 'grid' || currentView === 'table') && (
          <div className="space-y-4 sm:space-y-6">
            {/* Tag, Brand & Product Filter Bar with Scope Tabs & Inline Search */}
            <TagFilterBar
              label="Filter products by tag / brand / product"
              tags={catalogTags}
              brands={catalogBrands}
              products={catalogProductNames}
              selectedTag={catalogTagFilter}
              onSelectTag={setCatalogTagFilter}
              idPrefix="catalog-tag-filter"
            />

            {/* Grid Layout */}
            {currentView === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    specifications={database.specifications}
                    reviews={database.reviews}
                    isCompared={comparedProductIds.includes(product.id)}
                    onToggleCompare={handleToggleCompare}
                    onViewDetails={(p) => setSelectedProduct(p)}
                  />
                ))}
              </div>
            )}

            {/* Table Layout */}
            {currentView === 'table' && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 w-12 text-center">Compare</th>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4">Brand</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Overview</th>
                        <th className="py-3 px-4 text-center">Specs</th>
                        <th className="py-3 px-4 text-center">Reviews</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map((p) => {
                        const isCompared = comparedProductIds.includes(p.id);
                        const safeDbSpecs = Array.isArray(database?.specifications) ? database.specifications : [];
                        const safeDbReviews = Array.isArray(database?.reviews) ? database.reviews : [];
                        const specCount = safeDbSpecs.filter(
                          (s) => s.productId === p.id || s.productTitle === p.name
                        ).length;
                        const revCount = safeDbReviews.filter(
                          (r) =>
                            (Array.isArray(r.productIds) && r.productIds.includes(p.id)) ||
                            (Array.isArray(r.productTitles) && r.productTitles.includes(p.name))
                        ).length;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={isCompared}
                                onChange={() => handleToggleCompare(p)}
                                aria-label={`Select ${p.name} for comparison`}
                                className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={getProductImage(p)}
                                  alt={p.name}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = getFallbackImage(p);
                                  }}
                                  className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0"
                                />
                                <div>
                                  <span
                                    onClick={() => setSelectedProduct(p)}
                                    className="font-semibold text-slate-900 hover:text-indigo-600 cursor-pointer"
                                  >
                                    {p.name}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">{p.brand || '—'}</td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1">
                                {p.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-medium"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-4 max-w-xs truncate text-slate-500">
                              {p.overview ? p.overview.replace(/[#*`_]/g, '') : 'No overview provided.'}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-700">
                              {specCount}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-700">
                              {revCount}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => setSelectedProduct(p)}
                                className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredProducts.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-600 text-sm">
                  No products found matching your {catalogTagFilter !== 'All' ? `filter "${catalogTagFilter}"` : ''}{' '}
                  {searchQuery ? `and search "${searchQuery}"` : ''}.
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  {catalogTagFilter !== 'All' && (
                    <button
                      onClick={() => setCatalogTagFilter('All')}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 cursor-pointer"
                    >
                      Reset tag filter
                    </button>
                  )}
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 cursor-pointer"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Floating Comparison Tray (at bottom of screen) */}
            <ComparisonTray
              comparedProducts={comparedProducts}
              onRemoveProduct={handleRemoveCompared}
              onClearAll={() => setComparedProductIds([])}
              onOpenCompare={() => setCurrentView('compare')}
              onOpenSmartAdd={() => setCurrentView('smart-add')}
            />
          </div>
        )}

        {/* VIEW 3: COMPARISON MATRIX */}
        {currentView === 'compare' && (
          <ComparisonMatrix
            comparedProducts={comparedProducts}
            allProducts={database.products}
            specifications={database.specifications}
            reviews={database.reviews}
            onRemoveProduct={handleRemoveCompared}
            onAddProduct={(product) => {
              if (!comparedProductIds.includes(product.id)) {
                setComparedProductIds([...comparedProductIds, product.id]);
              }
            }}
            onSetComparedIds={(ids) => setComparedProductIds(ids)}
            onViewDetails={(product) => setSelectedProduct(product)}
            onSelectPreset={(ids) => setComparedProductIds(ids)}
            onOpenAddSpec={(product) => {
              setSpecProduct(product || database.products[0] || null);
              setIsAddSpecOpen(true);
            }}
            onOpenEditSpec={(spec) => setSelectedSpecForEdit(spec)}
            onOpenViewReview={(review) => setSelectedReviewForView(review)}
            onOpenAddReview={(product) => handleOpenReviewEditor(null, product?.id)}
            onNavigateToSmartAdd={() => setCurrentView('smart-add')}
          />
        )}

        {/* VIEW 3.5: SMART ADD PRODUCT */}
        {currentView === 'smart-add' && (
          <SmartAddProduct
            allProducts={database.products}
            specifications={database.specifications}
            onSaveProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onAddSpecification={handleAddSpec}
            onUpdateSpecification={handleUpdateSpec}
            onDeleteSpecification={handleDeleteSpec}
            onReorderSpecifications={handleReorderSpecs}
            onDeleteProduct={handleDeleteProduct}
            onNavigateToCompare={() => setCurrentView('compare')}
            onNavigateToCatalog={() => setCurrentView('grid')}
            onSyncCloud={() => setIsSyncModalOpen(true)}
            preselectedProductIds={comparedProductIds.length > 0 ? comparedProductIds : undefined}
            onOpenProductWorkspace={(product) => {
              setSelectedProduct(product);
            }}
            onOpenAddSpec={(product) => {
              setSpecProduct(product || database.products[0] || null);
              setIsAddSpecOpen(true);
            }}
            onOpenEditSpec={(spec) => setSelectedSpecForEdit(spec)}
          />
        )}

        {/* VIEW 4: REVIEWS SECTION */}
        {currentView === 'reviews' && (
          <ReviewsSection
            reviews={database.reviews}
            products={database.products}
            onOpenAddReview={(product) => handleOpenReviewEditor(null, product?.id)}
            onOpenViewReview={(review) => setSelectedReviewForView(review)}
            onOpenEditReview={(review) => handleOpenReviewEditor(review)}
            onDeleteReview={handleDeleteReview}
            onViewProduct={(product) => setSelectedProduct(product)}
            onSaveReview={handleSaveReview}
            onSaveBatchReviews={handleSaveBatchReviews}
          />
        )}

        {/* VIEW 5: DATA & BACKUP HUB (Direct full-screen tab view) */}
        {currentView === 'database' && (
          <DataBackupView
            database={database}
            onRestoreDatabase={(restored) => {
              setDatabase(restored);
            }}
            onLoadSeedData={handleLoadSeedData}
            onClearData={handleClearData}
          />
        )}
      </main>

      {/* MODALS */}

      {/* 1. Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          specifications={database.specifications}
          reviews={database.reviews}
          isCompared={comparedProductIds.includes(selectedProduct.id)}
          onToggleCompare={handleToggleCompare}
          onClose={() => setSelectedProduct(null)}
          onOpenAddReview={(product) => handleOpenReviewEditor(null, product.id)}
          onOpenViewReview={(review) => setSelectedReviewForView(review)}
          onOpenEditReview={(review) => handleOpenReviewEditor(review)}
          onOpenAddSpec={(product) => {
            setProductToEdit(product);
          }}
          onOpenEditSpec={(spec) => setSelectedSpecForEdit(spec)}
          onOpenEditProduct={(product) => {
            setProductToEdit(product);
          }}
          onDeleteProduct={async (productId) => {
            await handleDeleteProduct(productId);
            setSelectedProduct(null);
          }}
          onDeleteSpec={async (specId) => {
            await handleDeleteSpec(specId);
          }}
        />
      )}

      {/* 1b. Edit Product Modal (reusing the ProductWorkspace module) */}
      {productToEdit && (
        <EditProductModal
          product={productToEdit}
          specifications={database.specifications}
          onClose={() => setProductToEdit(null)}
          onNavigateToCompare={() => {
            setProductToEdit(null);
            setCurrentView('compare');
          }}
          onNavigateToManage={() => {
            setProductToEdit(null);
            setCurrentView('grid');
          }}
          allExistingTags={allExistingTags}
          onAddNewTag={handleAddNewTag}
          onUpdateProduct={async (data) => {
            await handleSaveProductEdit(productToEdit.id, data);
            setProductToEdit(null);
          }}
          onDeleteProduct={async (productId) => {
            await handleDeleteProduct(productId);
            setProductToEdit(null);
            if (selectedProduct?.id === productId) {
              setSelectedProduct(null);
            }
          }}
        />
      )}

      {/* 2. Add Product Modal */}
      {isAddProductOpen && (
        <AddProductModal
          onClose={() => setIsAddProductOpen(false)}
          onNavigateToCompare={() => {
            setIsAddProductOpen(false);
            setCurrentView('compare');
          }}
          onNavigateToManage={() => {
            setIsAddProductOpen(false);
            setCurrentView('grid');
          }}
          allExistingTags={allExistingTags}
          onAddNewTag={handleAddNewTag}
          onAddProduct={async (data) => {
            await handleAddProduct(data);
          }}
        />
      )}

      {/* 3. Unified Full-Screen Review Reader */}
      {selectedReviewForView && (
        <UnifiedReviewViewer
          review={selectedReviewForView}
          products={database.products}
          onClose={() => setSelectedReviewForView(null)}
          onEditReview={(review) => {
            setSelectedReviewForView(null);
            handleOpenReviewEditor(review);
          }}
          onDeleteReview={handleDeleteReview}
          onViewProduct={(product) => {
            setSelectedReviewForView(null);
            setSelectedProduct(product);
          }}
        />
      )}

      {/* 4. Unified Full-Screen Review Editor */}
      {isReviewEditorOpen && (
        <UnifiedReviewEditor
          key={reviewToEdit?.id || 'new-review-open'}
          isOpen={isReviewEditorOpen}
          onClose={() => {
            setIsReviewEditorOpen(false);
            setReviewToEdit(null);
            setReviewInitialProductId(undefined);
          }}
          products={database.products}
          initialReview={reviewToEdit}
          initialProductId={reviewInitialProductId}
          onSave={handleSaveReview}
          onDelete={handleDeleteReview}
        />
      )}

      {/* 6. Add Spec Modal */}
      {isAddSpecOpen && specProduct && (
        <AddSpecModal
          product={specProduct}
          allProducts={database.products}
          onClose={() => {
            setIsAddSpecOpen(false);
            setSpecProduct(null);
          }}
          onSubmit={async (data) => {
            await handleAddSpec(data);
          }}
        />
      )}

      {/* 7. Edit Spec Modal */}
      {selectedSpecForEdit && (
        <EditSpecModal
          specification={selectedSpecForEdit}
          onClose={() => setSelectedSpecForEdit(null)}
          onSubmit={async (id, data) => {
            await handleUpdateSpec(id, data);
          }}
          onDelete={handleDeleteSpec}
        />
      )}

      {/* 8. Local Data & Backup Hub Modal */}
      {isSyncModalOpen && (
        <SyncModal
          database={database}
          onClose={() => setIsSyncModalOpen(false)}
          onRestoreDatabase={handleRestoreDatabase}
          onLoadSeedData={handleLoadSeedData}
          onClearData={handleClearData}
        />
      )}
    </div>
  );
}
