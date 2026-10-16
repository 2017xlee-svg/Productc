import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Filter,
  Search,
  ThumbsUp,
  Calendar,
  ExternalLink,
  Edit3,
  Trash2,
  Eye,
  Star,
  Maximize2,
  Sparkles,
  Package,
  FileCode,
  Upload,
} from 'lucide-react';
import { UserReview, Product, Attachment } from '../types';
import {
  getProductImage,
  getFallbackImage,
  getAttachmentDisplayUrl,
  createSpecPlaceholderSvg,
  normalizeMediaUrl,
  isExpiredOrDeadUrl,
} from '../utils/imageFallback';
import { getCachedObjectUrl, registerActiveObjectUrl } from '../utils/imageCompressor';
import { getMediaBlob } from '../lib/indexedDbMedia';
import { SearchableProductSelect } from './SearchableProductSelect';
import { TagFilterBar } from './TagFilterBar';
import { stripHtmlAndMarkdownToText } from '../utils/upnoteParser';
import { ImportHtmlReviewModal } from './ImportHtmlReviewModal';
import { getCleanProductDisplayName, sortProductsByName } from '../utils/productUtils';

const ReviewThumbnail: React.FC<{
  pic?: Attachment;
  url?: string;
  name?: string;
  onClick?: () => void;
}> = ({ pic, url, name, onClick }) => {
  const [src, setSrc] = useState<string>(() => {
    if (pic?.id) {
      const cached = getCachedObjectUrl(pic.id);
      if (cached) return cached;
    }
    const targetUrl = url || pic?.url;
    if (targetUrl) {
      const normalized = normalizeMediaUrl(targetUrl);
      if (!isExpiredOrDeadUrl(normalized)) return normalized;
    }
    if (pic) {
      const display = getAttachmentDisplayUrl(pic, name);
      if (display && !display.startsWith('data:image/svg+xml')) return display;
    }
    return '';
  });

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (pic?.id) {
        const cached = getCachedObjectUrl(pic.id);
        if (cached) {
          if (isMounted) setSrc(cached);
          return;
        }
        try {
          const blob = await getMediaBlob(pic.id);
          if (blob && isMounted) {
            const objUrl = URL.createObjectURL(blob);
            registerActiveObjectUrl(pic.id, objUrl);
            setSrc(objUrl);
            return;
          }
        } catch {
          // ignore
        }
      }
      const targetUrl = url || pic?.url;
      if (targetUrl) {
        const normalized = normalizeMediaUrl(targetUrl);
        if (normalized && !isExpiredOrDeadUrl(normalized) && isMounted) {
          setSrc(normalized);
          return;
        }
      }
      if (isMounted && (!src || src.startsWith('data:image/svg+xml'))) {
        setSrc(createSpecPlaceholderSvg(name || pic?.name || 'Review photo'));
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [pic?.id, pic?.url, url, name]);

  const displaySrc = src || createSpecPlaceholderSvg(name || pic?.name || 'Review photo');

  return (
    <div
      onClick={onClick}
      className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-100 cursor-pointer hover:opacity-90 transition-opacity"
    >
      <img
        src={displaySrc}
        alt={name || pic?.name || 'Review picture'}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
        onError={(e) => {
          (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(name || pic?.name || 'Review picture');
        }}
      />
    </div>
  );
};

function getReviewPhotoItems(rev: UserReview): Array<{ pic?: Attachment; url?: string; name: string }> {
  const items: Array<{ pic?: Attachment; url?: string; name: string }> = [];
  const seen = new Set<string>();

  // 1. From pictures array
  if (Array.isArray(rev.pictures)) {
    for (const pic of rev.pictures) {
      if (pic && (pic.id || pic.url)) {
        const key = pic.id || pic.url || '';
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ pic, url: pic.url, name: pic.name || 'Photo' });
        }
      }
    }
  }

  // 2. If pictures array was empty, extract from HTML <img> and markdown ![]()
  if (items.length === 0 && rev.body) {
    const imgRegex = /<img[^>]*?src=["']([^"']+)["'][^>]*?>/gi;
    let match;
    while ((match = imgRegex.exec(rev.body)) !== null) {
      const src = match[1];
      if (src && !isExpiredOrDeadUrl(src) && !seen.has(src)) {
        seen.add(src);
        items.push({ url: src, name: 'Review photo' });
      }
      if (items.length >= 6) break;
    }

    if (items.length === 0) {
      const mdImgRegex = /!\[(.*?)\]\((.*?)\)/g;
      let mdMatch;
      while ((mdMatch = mdImgRegex.exec(rev.body)) !== null) {
        const src = mdMatch[2];
        const alt = mdMatch[1] || 'Review photo';
        if (src && !isExpiredOrDeadUrl(src) && !seen.has(src)) {
          seen.add(src);
          items.push({ url: src, name: alt });
        }
        if (items.length >= 6) break;
      }
    }
  }

  return items;
}

interface ReviewsSectionProps {
  reviews: UserReview[];
  products: Product[];
  onOpenAddReview: (product?: Product) => void;
  onOpenViewReview: (review: UserReview) => void;
  onOpenEditReview: (review: UserReview) => void;
  onDeleteReview: (reviewId: string) => Promise<void>;
  onViewProduct: (product: Product) => void;
  onSaveReview?: (reviewData: any) => Promise<void>;
  onSaveBatchReviews?: (reviewsDataList: any[]) => Promise<void>;
}

export const ReviewsSection: React.FC<ReviewsSectionProps> = ({
  reviews,
  products,
  onOpenAddReview,
  onOpenViewReview,
  onOpenEditReview,
  onDeleteReview,
  onViewProduct,
  onSaveReview,
  onSaveBatchReviews,
}) => {
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('all');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Safe arrays
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const safeProducts = Array.isArray(products) ? products : [];

  // Available tags, brands, and product names for reviews based on all products
  const { reviewTags, reviewBrands, reviewProductNames } = useMemo(() => {
    const tags = new Set<string>();
    const brands = new Set<string>();
    const prods = new Set<string>();
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
      reviewTags: Array.from(tags).sort(sortFn),
      reviewBrands: Array.from(brands).sort(sortFn),
      reviewProductNames: Array.from(prods).sort(sortFn),
    };
  }, [safeProducts]);

  // Calculate reviews per product count
  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of safeProducts) {
      counts[p.id] = safeReviews.filter(
        (r) =>
          (Array.isArray(r.productIds) && r.productIds.includes(p.id)) ||
          (Array.isArray(r.productTitles) &&
            r.productTitles.some((t) => t && p.name && t.toLowerCase() === p.name.toLowerCase()))
      ).length;
    }
    return counts;
  }, [safeProducts, safeReviews]);

  // Filter reviews
  const filteredReviews = useMemo(() => {
    return safeReviews.filter((rev) => {
      // Find all products linked to this review
      const linkedProds = safeProducts.filter(
        (p) =>
          (Array.isArray(rev.productIds) && rev.productIds.includes(p.id)) ||
          (Array.isArray(p.reviewIds) && p.reviewIds.includes(rev.id)) ||
          (Array.isArray(rev.productTitles) &&
            rev.productTitles.some(
              (t) => t && p.name && t.toLowerCase() === p.name.toLowerCase()
            ))
      );

      // Filter by tag, brand, or product pill
      if (selectedTagFilter && selectedTagFilter.toLowerCase() !== 'all') {
        const target = selectedTagFilter.toLowerCase();
        const hasTagOrBrandOrProd = linkedProds.some((p) => {
          const hasTag = Array.isArray(p.tags) && p.tags.some((t) => (t || '').toLowerCase() === target);
          const hasBrand = (p.brand || '').toLowerCase() === target;
          const hasProd = (p.name || '').toLowerCase() === target;
          return hasTag || hasBrand || hasProd;
        });
        if (!hasTagOrBrandOrProd) return false;
      }

      // Filter by product dropdown
      if (selectedProductFilter !== 'all') {
        const matchId = Array.isArray(rev.productIds) && rev.productIds.includes(selectedProductFilter);
        const targetProd = safeProducts.find((p) => p.id === selectedProductFilter);
        const matchTitle =
          targetProd &&
          Array.isArray(rev.productTitles) &&
          rev.productTitles.some(
            (t) => t && targetProd.name && t.toLowerCase() === targetProd.name.toLowerCase()
          );
        if (!matchId && !matchTitle) return false;
      }

      // Filter by search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const inTitle = (rev.title || '').toLowerCase().includes(query);
        const inBody = (rev.body || '').toLowerCase().includes(query);
        const inTitles =
          Array.isArray(rev.productTitles) &&
          rev.productTitles.some((t) => t && t.toLowerCase().includes(query));
        const inAuthor = (rev.authorName || '').toLowerCase().includes(query);
        const targetProd = safeProducts.find(
          (p) => Array.isArray(rev.productIds) && rev.productIds.includes(p.id)
        );
        const inProdName = targetProd?.name ? targetProd.name.toLowerCase().includes(query) : false;
        const inProdBrand = targetProd ? (targetProd.brand || '').toLowerCase().includes(query) : false;
        if (!inTitle && !inBody && !inTitles && !inAuthor && !inProdName && !inProdBrand) return false;
      }

      return true;
    });
  }, [safeReviews, selectedProductFilter, selectedTagFilter, safeProducts, searchQuery]);

  // Helper to extract a clean review title if rev.title isn't explicitly set
  const getReviewDisplayTitle = (rev: UserReview, fallbackProdName: string) => {
    if (rev.title && rev.title.trim()) return rev.title.trim();
    if (rev.body) {
      const h1Match = rev.body.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
      if (h1Match && h1Match[1]) {
        const clean = h1Match[1].replace(/<[^>]+>/g, '').trim();
        if (clean && clean.length <= 100) return clean;
      }
      const strongMatch = rev.body.match(/<strong>(.*?)<\/strong>/i);
      if (strongMatch && strongMatch[1]) {
        const clean = strongMatch[1].replace(/<[^>]+>/g, '').trim();
        if (clean && clean.length <= 80) return clean;
      }
    }
    return `${fallbackProdName} Review`;
  };

  return (
    <div id="reviews-section-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>Community User Reviews</span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
              {safeReviews.length} Total Reviews
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real feedback and benchmark impressions from reviews catalog
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="import-html-review-btn"
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="Batch import reviews from HTML folders, .zip archive, or HTML notes"
          >
            <FileCode className="w-4 h-4 text-indigo-600" />
            <span>Batch Import HTML / Folder</span>
          </button>

          <button
            id="write-review-top-btn"
            onClick={() => onOpenAddReview()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Write a Review</span>
          </button>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 flex flex-col sm:flex-row gap-3 shadow-xs">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="review-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reviews by keyword or device..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 min-w-[220px] sm:w-72">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <SearchableProductSelect
              id="filter-by-product-select"
              products={safeProducts}
              selectedProductId={selectedProductFilter}
              onSelectProduct={setSelectedProductFilter}
              allowAll={true}
              allLabel="All Products"
              allCount={safeReviews.length}
              productCounts={productCounts}
              placeholder="Filter by product..."
            />
          </div>
        </div>
      </div>

      {/* Tag, Brand & Product Filter Bar with Scope Tabs & Inline Search */}
      <TagFilterBar
        label="Filter reviews by tag / brand / product"
        tags={reviewTags}
        brands={reviewBrands}
        products={reviewProductNames}
        selectedTag={selectedTagFilter}
        onSelectTag={setSelectedTagFilter}
        idPrefix="review-tag-filter"
        className="mb-6"
      />

      {/* Reviews List (Single Column Full Container Width) */}
      <div className="flex flex-col gap-4 w-full">
        {filteredReviews.map((rev) => {
          // Find associated product
          const linkedProduct = safeProducts.find(
            (p) =>
              (Array.isArray(rev.productIds) && rev.productIds.includes(p.id)) ||
              (Array.isArray(p.reviewIds) && p.reviewIds.includes(rev.id)) ||
              (Array.isArray(rev.productTitles) &&
                rev.productTitles.some(
                  (t) =>
                    t &&
                    p.name &&
                    (t.toLowerCase() === p.name.toLowerCase() ||
                      t.toLowerCase().includes(p.name.toLowerCase()) ||
                      p.name.toLowerCase().includes(t.toLowerCase()))
                ))
          );

          const productName =
            (linkedProduct ? getCleanProductDisplayName(linkedProduct) : '') ||
            (Array.isArray(rev.productTitles) && rev.productTitles[0]) ||
            'General Device';

          const reviewDisplayName = getReviewDisplayTitle(rev, productName);

          return (
            <div
              key={rev.id}
              id={`review-card-${rev.id}`}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                {/* 1. Header with Product Badge & Review Number */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold shadow-2xs min-w-0">
                      <Package className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">{productName}</span>
                      {linkedProduct?.brand &&
                        !productName.toLowerCase().includes(linkedProduct.brand.toLowerCase()) && (
                          <span className="text-indigo-400 font-normal hidden sm:inline shrink-0">
                            ({linkedProduct.brand})
                          </span>
                        )}
                    </div>
                    {linkedProduct && (
                      <button
                        id={`review-view-product-${rev.id}`}
                        onClick={() => onViewProduct(linkedProduct)}
                        className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                        title={`View ${linkedProduct.name} specs`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[11px] font-bold shrink-0">
                    #{rev.reviewNumber}
                  </span>
                </div>

                {/* 2. Review Name / Report Title (Prominent) */}
                <div className="mb-2.5">
                  <h3
                    onClick={() => onOpenViewReview(rev)}
                    className="text-base sm:text-lg font-black text-slate-900 tracking-tight hover:text-indigo-600 cursor-pointer transition-colors line-clamp-2"
                    title={reviewDisplayName}
                  >
                    {reviewDisplayName}
                  </h3>
                </div>

                {/* 3. Reviewer, Rating stars & Actions bar */}
                <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                      {(rev.authorName || 'V').charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-slate-700 truncate max-w-[140px] sm:max-w-xs">
                      {rev.authorName || `Verified Reviewer`}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0 ml-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= (rev.rating || 5)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      ))}
                      <span className="text-[11px] font-bold text-amber-700 ml-1">
                        {rev.rating || 5}.0
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-slate-400 shrink-0">
                    <button
                      onClick={() => onOpenViewReview(rev)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-indigo-50 hover:text-indigo-600 text-xs font-semibold transition-colors"
                      title="View full review"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => onOpenEditReview(rev)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-indigo-50 hover:text-indigo-600 text-xs font-semibold transition-colors"
                      title="Edit review"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete review #${rev.reviewNumber}?`)) {
                          onDeleteReview(rev.id);
                        }
                      }}
                      className="p-1 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Delete review"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Review Body */}
                <p
                  onClick={() => onOpenViewReview(rev)}
                  className="text-xs text-slate-700 leading-relaxed line-clamp-4 bg-slate-50/60 hover:bg-slate-100/70 cursor-pointer p-3.5 rounded-lg border border-slate-100 mb-3 transition-colors"
                  title="Click to view full review details"
                >
                  {stripHtmlAndMarkdownToText(rev.body, 280) || 'No review content'}
                </p>

                {/* Review Photos if any */}
                {(() => {
                  const photoItems = getReviewPhotoItems(rev);
                  if (photoItems.length === 0) return null;
                  return (
                    <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
                      {photoItems.map((item, idx) => (
                        <ReviewThumbnail
                          key={idx}
                          pic={item.pic}
                          url={item.url}
                          name={item.name}
                          onClick={() => onOpenViewReview(rev)}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Verified Community Review</span>
                <span className="font-medium text-slate-500">
                  {linkedProduct ? `Linked to ${linkedProduct.brand}` : 'General feedback'}
                </span>
              </div>
            </div>
          );
        })}

        {filteredReviews.length === 0 && (
          <div className="w-full py-12 text-center bg-white rounded-xl border border-slate-200">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-sm font-semibold text-slate-700">No reviews found</div>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search query, product selection, or tag filter.
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              {selectedTagFilter !== 'All' && (
                <button
                  onClick={() => setSelectedTagFilter('All')}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 cursor-pointer"
                >
                  Reset tag filter ({selectedTagFilter})
                </button>
              )}
              {selectedProductFilter !== 'all' && (
                <button
                  onClick={() => setSelectedProductFilter('all')}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 cursor-pointer"
                >
                  Reset product filter
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
      </div>

      {/* Import HTML Review Modal */}
      {isImportModalOpen && (
        <ImportHtmlReviewModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          products={safeProducts}
          onSaveReview={async (data) => {
            if (onSaveReview) {
              await onSaveReview(data);
            }
          }}
          onSaveBatchReviews={onSaveBatchReviews}
          onOpenInEditor={(reviewData) => {
            onOpenEditReview(reviewData as UserReview);
          }}
        />
      )}
    </div>
  );
};
