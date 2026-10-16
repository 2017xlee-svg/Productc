import React, { useState } from 'react';
import { Check, Plus, MessageSquare, ListChecks, ChevronRight, Tag } from 'lucide-react';
import { Product, Specification, UserReview } from '../types';
import { getProductImage, getFallbackImage } from '../utils/imageFallback';

interface ProductCardProps {
  product: Product;
  specifications: Specification[];
  reviews: UserReview[];
  isCompared: boolean;
  onToggleCompare: (product: Product) => void;
  onViewDetails: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  specifications,
  reviews,
  isCompared,
  onToggleCompare,
  onViewDetails,
}) => {
  const [imgError, setImgError] = useState(false);

  const safeSpecs = Array.isArray(specifications) ? specifications : [];
  const safeReviews = Array.isArray(reviews) ? reviews : [];

  // Get specs related to this product
  const productSpecs = safeSpecs.filter(
    (s) => s.productId === product.id || (s.productTitle && product.name && s.productTitle === product.name)
  );

  // Filter top 3 meaningful specs for preview (Price, Weight, Screensize, etc.)
  const previewSpecs = productSpecs
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(0, 3);

  // Get reviews for this product
  const productReviews = safeReviews.filter(
    (r) =>
      (Array.isArray(r.productIds) && r.productIds.includes(product.id)) ||
      (Array.isArray(r.productTitles) && r.productTitles.some((t) => t && product.name && t.toLowerCase() === product.name.toLowerCase()))
  );

  const imageUrl = imgError ? getFallbackImage(product) : getProductImage(product);

  return (
    <div
      id={`product-card-${product.id}`}
      className={`group bg-white rounded-xl border transition-all duration-200 flex flex-col overflow-hidden ${
        isCompared
          ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Product Image Area */}
      <div className="relative aspect-4/3 bg-slate-100 overflow-hidden cursor-pointer" onClick={() => onViewDetails(product)}>
        <img
          src={imageUrl}
          alt={product.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />

        {/* Brand Badge */}
        {product.brand && (
          <div className="absolute top-2.5 left-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-semibold tracking-wide px-2.5 py-0.5 rounded-md uppercase">
            {product.brand}
          </div>
        )}

        {/* Compare Toggle Button overlay */}
        <button
          id={`compare-toggle-btn-${product.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare(product);
          }}
          className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold shadow-xs transition-all ${
            isCompared
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 ring-1 ring-white/50'
              : 'bg-white/90 backdrop-blur-xs text-slate-700 hover:bg-white hover:text-slate-900 border border-slate-200'
          }`}
        >
          {isCompared ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Added</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Compare</span>
            </>
          )}
        </button>
      </div>

      {/* Product Details Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Tags */}
          {Array.isArray(product.tags) && product.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {product.tags.slice(0, 3).map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600 border border-slate-200/60"
                >
                  {tag}
                </span>
              ))}
              {product.tags.length > 3 && (
                <span className="text-[10px] text-slate-400 self-center">
                  +{product.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Product Name */}
          <h3
            id={`product-title-${product.id}`}
            onClick={() => onViewDetails(product)}
            className="font-bold text-slate-900 text-base line-clamp-1 hover:text-indigo-600 cursor-pointer transition-colors"
          >
            {product.name}
          </h3>

          {/* Quick Specs Preview */}
          {previewSpecs.length > 0 ? (
            <div className="mt-3 space-y-1.5 text-xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
              {previewSpecs.map((spec) => (
                <div key={spec.id} className="flex items-center justify-between text-slate-600">
                  <span className="font-medium text-slate-500">{spec.specName}</span>
                  <span className="font-semibold text-slate-800 text-right truncate max-w-[140px]">
                    {spec.details || '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-xs text-slate-400 italic py-1">
              Specifications documented in catalog
            </div>
          )}
        </div>

        {/* Footer info & CTA */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="flex items-center gap-1 font-medium text-slate-600">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
              {productReviews.length} {productReviews.length === 1 ? 'review' : 'reviews'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <ListChecks className="w-3.5 h-3.5 text-slate-400" />
              {productSpecs.length} specs
            </span>
          </div>

          <button
            id={`details-btn-${product.id}`}
            onClick={() => onViewDetails(product)}
            className="flex items-center gap-0.5 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
          >
            <span>Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
