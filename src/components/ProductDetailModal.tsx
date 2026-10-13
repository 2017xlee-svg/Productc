import React, { useState, useEffect } from 'react';
import {
  X,
  Scale,
  Check,
  Plus,
  MessageSquare,
  Tag,
  Info,
  Layers,
  Calendar,
  ExternalLink,
  Edit3,
  Eye,
  Trash2,
  Maximize2,
  Minimize2,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Attachment, Product, Specification, UserReview } from '../types';
import { stripHtmlAndMarkdownToText } from '../utils/upnoteParser';
import {
  getProductImage,
  getFallbackImage,
  getAttachmentDisplayUrl,
  createSpecPlaceholderSvg,
  GENERIC_SPEC_PLACEHOLDER,
  GENERIC_PRODUCT_PLACEHOLDER,
  normalizeMediaUrl,
} from '../utils/imageFallback';
import { getCachedObjectUrl, registerActiveObjectUrl } from '../utils/imageCompressor';
import { getMediaBlob } from '../lib/indexedDbMedia';
import { FullscreenImageViewer } from './fullscreen-image-viewer';

const ProductReviewPic: React.FC<{ pic: Attachment }> = ({ pic }) => {
  const [src, setSrc] = useState<string>(() => {
    if (pic.id) {
      const cached = getCachedObjectUrl(pic.id);
      if (cached) return cached;
    }
    const display = getAttachmentDisplayUrl(pic, pic.name);
    if (display && !display.startsWith('data:image/svg+xml')) return display;
    return '';
  });

  useEffect(() => {
    let isMounted = true;
    if (pic.id) {
      const cached = getCachedObjectUrl(pic.id);
      if (cached) {
        setSrc(cached);
        return;
      }
      getMediaBlob(pic.id)
        .then((blob) => {
          if (blob && isMounted) {
            const objUrl = URL.createObjectURL(blob);
            registerActiveObjectUrl(pic.id, objUrl);
            setSrc(objUrl);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [pic.id]);

  const displaySrc = src || getAttachmentDisplayUrl(pic, pic.name);

  return (
    <img
      src={displaySrc}
      alt={pic.name || 'Review picture'}
      className="w-16 h-16 object-cover rounded-lg border border-slate-200"
      referrerPolicy="no-referrer"
      onError={(e) => {
        (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(pic.name || 'Review picture');
      }}
    />
  );
};

interface ProductDetailModalProps {
  product: Product | null;
  specifications: Specification[];
  reviews: UserReview[];
  isCompared: boolean;
  onToggleCompare: (product: Product) => void;
  onClose: () => void;
  onOpenAddReview: (product: Product) => void;
  onOpenViewReview: (review: UserReview) => void;
  onOpenEditReview: (review: UserReview) => void;
  onOpenAddSpec?: (product: Product) => void;
  onOpenEditSpec: (spec: Specification) => void;
  onOpenEditProduct: (product: Product) => void;
  onDeleteProduct?: (productId: string) => Promise<void>;
  onDeleteSpec?: (specId: string) => Promise<void>;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  specifications,
  reviews,
  isCompared,
  onToggleCompare,
  onClose,
  onOpenAddReview,
  onOpenViewReview,
  onOpenEditReview,
  onOpenEditSpec,
  onOpenEditProduct,
  onDeleteProduct,
  onDeleteSpec,
}) => {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [showDeleteProductConfirm, setShowDeleteProductConfirm] = useState(false);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [specToDelete, setSpecToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingSpec, setIsDeletingSpec] = useState(false);
  const [fullscreenImages, setFullscreenImages] = useState<Attachment[]>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isModalFullscreen, setIsModalFullscreen] = useState(true);

  // Lock body scrolling when modal is open and default to fullscreen
  useEffect(() => {
    if (product) {
      document.body.style.overflow = 'hidden';
      setIsModalFullscreen(true);
      setSelectedImageIdx(0);
      setImgError(false);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [product?.id]);

  if (!product) return null;

  const safeSpecs = Array.isArray(specifications) ? specifications : [];
  const safeReviews = Array.isArray(reviews) ? reviews : [];

  // Product specific specs
  const productSpecs = safeSpecs
    .filter((s) => s.productId === product.id || (s.productTitle && product.name && s.productTitle === product.name))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Product specific reviews
  const productReviews = safeReviews.filter(
    (r) =>
      (Array.isArray(r.productIds) && r.productIds.includes(product.id)) ||
      (Array.isArray(r.productTitles) && r.productTitles.some((t) => t && product.name && t.toLowerCase() === product.name.toLowerCase()))
  );

  const fallback = getFallbackImage(product);
  const mainImage = imgError ? fallback : getProductImage(product, selectedImageIdx);

  const handleDeleteProduct = async () => {
    if (!onDeleteProduct) return;
    setIsDeletingProduct(true);
    try {
      await onDeleteProduct(product.id);
      setShowDeleteProductConfirm(false);
      onClose();
    } catch (err) {
      console.error('Failed to delete product:', err);
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const handleConfirmDeleteSpec = async () => {
    if (!specToDelete || !onDeleteSpec) return;
    setIsDeletingSpec(true);
    try {
      await onDeleteSpec(specToDelete.id);
      setSpecToDelete(null);
    } catch (err) {
      console.error('Failed to delete spec:', err);
    } finally {
      setIsDeletingSpec(false);
    }
  };

  return (
    <div
      id="product-detail-screen"
      className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden w-full h-full max-w-full"
    >
      <div
        id="product-detail-dialog"
        className="w-full h-full flex flex-col overflow-hidden bg-white"
      >
        {/* Fullscreen Native App Header */}
        <header className="px-3.5 sm:px-6 py-2.5 pt-safe border-b border-slate-200 bg-white shrink-0 flex items-center justify-between gap-2 shadow-2xs">
          {/* Back Action, Product Name & Brand */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              id="close-modal-back-btn"
              onClick={onClose}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors text-xs font-semibold cursor-pointer shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Back</span>
            </button>
            <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {product.name}
            </span>
            <span className="hidden xs:inline-flex text-[11px] px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-600 shrink-0 border border-slate-200/60">
              {product.brand}
            </span>
          </div>

          {/* Top Action Buttons: Mobile & Tablet First */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Write a Review Button */}
            <button
              id="modal-header-write-review-btn"
              onClick={() => onOpenAddReview(product)}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer shrink-0"
              title="Write a review for this product"
            >
              <MessageSquare className="w-3 h-3" />
              <span className="hidden xs:inline">Write Review</span>
              <span className="xs:hidden">Review</span>
            </button>

            {/* Edit Product Button */}
            <button
              id="modal-header-edit-product-btn"
              onClick={() => onOpenEditProduct(product)}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-900 hover:bg-black active:bg-slate-800 text-white shadow-2xs transition-colors cursor-pointer shrink-0"
              title="Edit product details, overview, and specifications"
            >
              <Edit3 className="w-3 h-3 text-amber-400" />
              <span>Edit</span>
            </button>

            {/* Compare Toggle Button */}
            <button
              id="modal-toggle-compare-btn"
              onClick={() => onToggleCompare(product)}
              className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer shrink-0 ${
                isCompared
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
              title={isCompared ? 'Remove from comparison' : 'Add to comparison'}
            >
              {isCompared ? (
                <>
                  <Check className="w-3 h-3 text-indigo-600" />
                  <span className="hidden sm:inline">Compared</span>
                </>
              ) : (
                <>
                  <Scale className="w-3 h-3" />
                  <span className="hidden sm:inline">Compare</span>
                </>
              )}
            </button>

            {/* Delete Product Button */}
            {onDeleteProduct && (
              <button
                id="modal-header-delete-product-btn"
                onClick={() => setShowDeleteProductConfirm(true)}
                className="p-1 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                title="Delete this product"
                aria-label="Delete product"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Close Button */}
            <button
              id="close-modal-btn"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-0.5"
              aria-label="Close product view"
              title="Close"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 flex flex-col max-w-full pb-safe">
          <div className={`p-3.5 sm:p-6 lg:p-8 flex-1 flex flex-col space-y-5 sm:space-y-6 ${isModalFullscreen ? 'w-full max-w-7xl mx-auto' : 'w-full'}`}>
            {/* Top Section: Photo & Product Information */}
            <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            {/* Gallery */}
            <div className="space-y-3">
              <div
                onClick={() => {
                  const imgs = (product.pictures && product.pictures.length > 0)
                    ? product.pictures
                    : [{
                        id: 'placeholder',
                        name: product.name,
                        url: GENERIC_PRODUCT_PLACEHOLDER,
                        smUrl: GENERIC_PRODUCT_PLACEHOLDER,
                        lgUrl: GENERIC_PRODUCT_PLACEHOLDER,
                        size: 0,
                        mimetype: 'image/svg+xml',
                      }];
                  setFullscreenImages(imgs);
                  setFullscreenIndex(selectedImageIdx < imgs.length ? selectedImageIdx : 0);
                  setIsFullscreenOpen(true);
                }}
                className="aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 relative group cursor-pointer"
                title="Click for full screen view"
              >
                <img
                  src={mainImage}
                  alt={product.name}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 flex items-center justify-center transition-colors">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-xs">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Click to view full screen</span>
                  </div>
                </div>
              </div>

              {/* Thumbnails if multiple pictures */}
              {product.pictures && product.pictures.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {product.pictures.map((pic, idx) => (
                    <button
                      key={pic.id || idx}
                      onClick={() => setSelectedImageIdx(idx)}
                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 shrink-0 ${
                        selectedImageIdx === idx ? 'border-indigo-600' : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={getProductImage(product, idx)}
                        alt={pic.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = fallback;
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Information Section with Header like Product Overview */}
            <div className="flex flex-col justify-between">
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Product Information</span>
                </h2>

                <div className="p-3.5 sm:p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                  {/* Product Name */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Product Name
                    </span>
                    <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      {product.name}
                    </h1>
                  </div>

                  {/* Brand & Tags */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-200/70">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Brand
                      </span>
                      <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-md uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {product.brand || 'Unbranded'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Tags
                      </span>
                      {product.tags && product.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {product.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No tags</span>
                      )}
                    </div>
                  </div>

                  {/* Highlights Summary */}
                  <div className="pt-2.5 border-t border-slate-200/70 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span className="font-medium">Total Specifications:</span>
                      <span className="font-bold text-slate-900">{productSpecs.length} attributes</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span className="font-medium">Community Reviews:</span>
                      <span className="font-bold text-slate-900">{productReviews.length} reviews</span>
                    </div>
                    {product.createdTime && (
                      <div className="flex justify-between text-slate-600">
                        <span className="font-medium">Record Created:</span>
                        <span className="text-slate-500">
                          {new Date(product.createdTime).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Overview Markdown Section */}
          {product.overview && (
            <div className="border-t border-slate-200 pt-5 sm:pt-6">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-600" />
                <span>Product Overview</span>
              </h2>
              <div className="p-3.5 sm:p-4 bg-slate-50/60 rounded-xl border border-slate-200/80 text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2 overflow-hidden">
                <Markdown>{product.overview}</Markdown>
              </div>
            </div>
          )}

          {/* Specifications Table */}
          <div className="border-t border-slate-200 pt-5 sm:pt-6">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>Full Specifications Sheet ({productSpecs.length})</span>
              </h2>
            </div>

            {productSpecs.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3 w-40 sm:w-48">Specification</th>
                        <th className="p-3">Details / Value</th>
                        <th className="p-3 w-20 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productSpecs.map((spec) => (
                        <tr key={spec.id} className="hover:bg-slate-50/50 group">
                          <td className="p-3 text-center text-slate-400 font-mono text-[10px]">
                            {spec.order}
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{spec.specName}</span>
                              {spec.unit && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-medium border border-slate-200">
                                  {spec.unit}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-slate-700 font-medium">
                            <div>{spec.details || '—'}</div>
                            {spec.pictures && spec.pictures.length > 0 && (
                              <div className="mt-2.5 flex gap-2.5 flex-wrap items-center">
                                {spec.pictures.map((pic, pIdx) => {
                                  const picSrc = getAttachmentDisplayUrl(pic, spec.specName, product.name);
                                  return (
                                    <button
                                      key={pic.id || pIdx}
                                      type="button"
                                      onClick={() => {
                                        setFullscreenImages(spec.pictures || []);
                                        setFullscreenIndex(pIdx);
                                        setIsFullscreenOpen(true);
                                      }}
                                      className="group relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-500 shadow-2xs hover:shadow-md transition-all bg-slate-100 cursor-pointer shrink-0 text-left focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                      title={`${pic.name || 'Specification picture'} (Click for full screen, drag & zoom)`}
                                    >
                                      <img
                                        src={picSrc}
                                        alt={pic.name || 'Spec image'}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(
                                            pic.name || spec.specName,
                                            product.name
                                          );
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 flex items-center justify-center transition-colors">
                                        <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                      </div>
                                      {pic.name && (
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 py-0.5 truncate group-hover:opacity-0 transition-opacity">
                                          {pic.name}
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                  <Maximize2 className="w-3 h-3 text-indigo-500" />
                                  <span>1-click full screen • Drag left/right • Pinch zoom</span>
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => onOpenEditSpec(spec)}
                                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="Edit this specification"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {onDeleteSpec && (
                                <button
                                  onClick={() => setSpecToDelete({ id: spec.id, name: spec.specName })}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Delete this specification"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center gap-2">
                <span>No detailed specifications mapped for this item.</span>
                <button
                  onClick={() => onOpenEditProduct(product)}
                  className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Product & Add Specifications</span>
                </button>
              </div>
            )}
          </div>

          {/* User Reviews Section */}
          <div className="border-t border-slate-200 pt-6 mt-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>Customer Reviews ({productReviews.length})</span>
              </h2>

              <button
                id="add-review-link-btn"
                onClick={() => onOpenAddReview(product)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Review</span>
              </button>
            </div>

            {productReviews.length > 0 ? (
              <div className="space-y-3">
                {productReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="font-semibold text-slate-800">
                        {rev.authorName || `Verified Reviewer #${rev.reviewNumber}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px]">Review #{rev.reviewNumber}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenViewReview(rev)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-200/70 cursor-pointer transition-colors"
                            title="View full review"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenEditReview(rev)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-200/70 cursor-pointer transition-colors"
                            title="Edit review"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">
                      {stripHtmlAndMarkdownToText(rev.body, 200) || 'No review content'}
                    </p>

                    {rev.pictures && rev.pictures.length > 0 && (
                      <div className="pt-2 flex gap-2 flex-wrap">
                        {rev.pictures.map((pic, idx) => (
                          <ProductReviewPic key={idx} pic={pic} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-100">
                No user reviews yet for this product. Be the first to add one!
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Delete Product Confirmation Dialog */}
      {showDeleteProductConfirm && (
        <div
          id="delete-product-modal-backdrop"
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowDeleteProductConfirm(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Delete Product</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-slate-900">"{product.name}"</span>?
                This will permanently remove the product and all its associated specifications.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteProductConfirm(false)}
                className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-product-modal-btn"
                type="button"
                disabled={isDeletingProduct}
                onClick={handleDeleteProduct}
                className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingProduct ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Specification Confirmation Dialog */}
      {specToDelete && (
        <div
          id="delete-spec-modal-backdrop"
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSpecToDelete(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Delete Specification</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-slate-900">"{specToDelete.name}"</span>?
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSpecToDelete(null)}
                className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-spec-modal-btn"
                type="button"
                disabled={isDeletingSpec}
                onClick={handleConfirmDeleteSpec}
                className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeletingSpec ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fullscreen High-Res Image Viewer with Drag, Pan & Pinch-to-Zoom */}
      <FullscreenImageViewer
        images={fullscreenImages}
        initialIndex={fullscreenIndex}
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
      />
    </div>
  );
};
