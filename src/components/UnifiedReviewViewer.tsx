import React, { useState } from 'react';
import {
  ArrowLeft,
  MessageSquare,
  Edit3,
  Trash2,
  Star,
  ExternalLink,
  Scale,
  Calendar,
  Check,
  Share2,
} from 'lucide-react';
import { UserReview, Product, Attachment } from '../types';
import { FormattedReviewContent } from './FormattedReviewContent';
import { getProductImage, getFallbackImage } from '../utils/imageFallback';

interface UnifiedReviewViewerProps {
  review: UserReview | null;
  products: Product[];
  onClose: () => void;
  onEditReview: (review: UserReview) => void;
  onDeleteReview: (reviewId: string) => Promise<void>;
  onViewProduct?: (product: Product) => void;
  onToggleCompare?: (product: Product) => void;
  comparedProductIds?: string[];
}

export const UnifiedReviewViewer: React.FC<UnifiedReviewViewerProps> = ({
  review,
  products,
  onClose,
  onEditReview,
  onDeleteReview,
  onViewProduct,
  onToggleCompare,
  comparedProductIds = [],
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!review) return null;

  // Find linked product
  const safeProducts = Array.isArray(products) ? products : [];
  const linkedProduct = safeProducts.find(
    (p) =>
      (Array.isArray(review.productIds) && review.productIds.includes(p.id)) ||
      (Array.isArray(review.productTitles) &&
        review.productTitles.some((t) => t && p?.name && t.toLowerCase() === p.name.toLowerCase()))
  );

  const isCompared = linkedProduct ? comparedProductIds.includes(linkedProduct.id) : false;

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await onDeleteReview(review.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete review:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      id="unified-review-viewer-screen"
      className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden w-full h-full max-w-full"
    >
      {/* 1. App Bar Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-2.5 pt-safe flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <button
            id="viewer-back-btn"
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors text-xs font-semibold cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {review.title ? review.title : (linkedProduct ? `${linkedProduct.name} Review` : 'Review Report')}
            </h1>
            <p className="text-[11px] text-slate-500 truncate">
              Review #{review.reviewNumber || '1'} • {linkedProduct ? linkedProduct.name : (review.productTitles?.[0] || 'Community Review')}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {linkedProduct && onToggleCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(linkedProduct)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isCompared
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isCompared ? <Check className="w-3.5 h-3.5 text-indigo-600" /> : <Scale className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isCompared ? 'Compared' : 'Compare'}</span>
            </button>
          )}

          <button
            id="edit-review-from-viewer-btn"
            type="button"
            onClick={() => onEditReview(review)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          <button
            id="delete-review-from-viewer-btn"
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
              confirmDelete
                ? 'bg-rose-600 text-white font-bold text-xs px-2.5'
                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
            }`}
            title={confirmDelete ? 'Click to confirm delete' : 'Delete review'}
          >
            {confirmDelete ? 'Confirm' : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 2. Scrollable Body */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 pb-safe space-y-6 max-w-4xl mx-auto w-full min-w-0">
        {/* Single Unified Review & Product Meta Card (No double cards) */}
        <div className="p-4 sm:p-6 bg-slate-50/90 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
          {/* Top Row: Title, Review # and Rating */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 mb-1 flex items-center gap-2">
                <span>Review #{review.reviewNumber || '1'}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight break-words">
                {review.title || (linkedProduct ? `${linkedProduct.name} Review` : 'Review Report')}
              </h2>
            </div>

            {/* Rating Stars */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs self-start shrink-0">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= (review.rating || 5)
                      ? 'text-amber-500 fill-amber-500'
                      : 'text-slate-200'
                  }`}
                />
              ))}
              <span className="text-xs font-bold text-slate-800 ml-1">
                {review.rating || 5}.0
              </span>
            </div>
          </div>

          {/* Bottom Row: Product Info & Author Info in One Seamless Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
            {/* Product info with thumbnail */}
            <div className="flex items-center gap-3 min-w-0">
              {linkedProduct && (
                <img
                  src={getProductImage(linkedProduct)}
                  alt={linkedProduct.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getFallbackImage(linkedProduct);
                  }}
                  className="w-10 h-10 rounded-xl object-cover border border-slate-200 bg-white shrink-0 shadow-2xs"
                />
              )}
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-slate-400">Product</div>
                <div className="font-bold text-slate-900 text-sm truncate">
                  {linkedProduct ? `${linkedProduct.brand ? `${linkedProduct.brand} ` : ''}${linkedProduct.name}` : (review.productTitles?.[0] || 'General Review')}
                </div>
              </div>

              {linkedProduct && onViewProduct && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewProduct(linkedProduct);
                  }}
                  className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer shrink-0"
                  title={`View ${linkedProduct.name} specifications`}
                >
                  <span>View Product</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>

            {/* Author info */}
            <div className="flex items-center gap-2 text-xs text-slate-600 shrink-0">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-[10px] flex items-center justify-center">
                {(review.authorName || 'V').charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-slate-800">{review.authorName || 'Verified Reviewer'}</span>
              {review.createdTime && (
                <span className="text-slate-400">
                  • {new Date(review.createdTime).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3. Rendered Markdown Document */}
        <div className="bg-white p-2 sm:p-4 min-w-0 max-w-full overflow-x-auto">
          <FormattedReviewContent content={review.body} pictures={review.pictures || []} />
        </div>
      </div>
    </div>
  );
};
