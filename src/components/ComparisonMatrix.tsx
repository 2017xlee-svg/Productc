import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  X,
  Search,
  ChevronsUpDown,
  BarChart3,
  ExternalLink,
  MessageSquare,
  Image as ImageIcon,
  CheckCircle2,
  Maximize2,
  FileText,
  Tag,
  Sliders,
  Layers,
  Database,
  ArrowUpDown,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Edit2,
  Trash2,
  Scale,
} from 'lucide-react';
import { Product, Specification, UserReview, Attachment } from '../types';
import {
  getProductImage,
  getFallbackImage,
  getAttachmentDisplayUrl,
  createSpecPlaceholderSvg,
  GENERIC_SPEC_PLACEHOLDER,
  isExpiredOrDeadUrl,
  createProductPlaceholderSvg,
} from '../utils/imageFallback';
import { FullscreenImageViewer } from './fullscreen-image-viewer';
import { TagFilterBar } from './TagFilterBar';

interface ComparisonMatrixProps {
  comparedProducts: Product[];
  allProducts: Product[];
  specifications: Specification[];
  reviews: UserReview[];
  onRemoveProduct: (productId: string) => void;
  onAddProduct: (product: Product) => void;
  onSetComparedIds?: (ids: string[]) => void;
  onViewDetails: (product: Product) => void;
  onSelectPreset: (productIds: string[]) => void;
  onOpenAddSpec?: (product?: Product, specName?: string) => void;
  onOpenEditSpec?: (spec: Specification) => void;
  onNavigateToSmartAdd?: () => void;
  onOpenViewReview?: (review: UserReview) => void;
  onOpenAddReview?: (product: Product) => void;
}

export const ComparisonMatrix: React.FC<ComparisonMatrixProps> = ({
  comparedProducts,
  allProducts,
  specifications,
  reviews,
  onRemoveProduct,
  onAddProduct,
  onSetComparedIds,
  onViewDetails,
  onSelectPreset,
  onOpenAddSpec,
  onOpenEditSpec,
  onNavigateToSmartAdd,
  onOpenViewReview,
  onOpenAddReview,
}) => {
  // Slots state: starts with 2 empty slots or pre-populated with comparedProducts
  const [recordSlots, setRecordSlots] = useState<(Product | null)[]>(() => {
    if (comparedProducts.length >= 2) {
      return [...comparedProducts];
    } else if (comparedProducts.length === 1) {
      return [comparedProducts[0], null];
    } else {
      return [null, null];
    }
  });

  // Keep recordSlots synced when comparedProducts change externally (e.g. from catalog check or clear)
  const comparedProductsKey = (comparedProducts || []).map((p) => p.id).join(',');
  useEffect(() => {
    setRecordSlots((prev) => {
      // If external products differ from what's currently in slots
      const currentPicked = prev.filter((p): p is Product => p !== null);
      const hasDiff =
        currentPicked.length !== comparedProducts.length ||
        comparedProducts.some((p, i) => currentPicked[i]?.id !== p.id);

      if (hasDiff) {
        if (comparedProducts.length === 0) {
          return [null, null];
        }
        const newSlots = [...comparedProducts];
        while (newSlots.length < 2) {
          newSlots.push(null);
        }
        return newSlots;
      }
      return prev;
    });
  }, [comparedProductsKey]);

  // Which slot dropdown is currently open (by slot index)
  const [activeSlotDropdown, setActiveSlotDropdown] = useState<number | null>(null);
  const [slotSearchQuery, setSlotSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState('All');

  // Per-specification Best value mode: 'higher' | 'lower'
  const [specBestValueModes, setSpecBestValueModes] = useState<Record<string, 'higher' | 'lower'>>({});

  const getSpecBestValueMode = (specName: string, unit?: string): 'higher' | 'lower' => {
    if (specBestValueModes[specName]) {
      return specBestValueModes[specName];
    }
    const lowerName = specName.toLowerCase();
    const lowerUnit = (unit || '').toLowerCase();
    // Default lower for weight, thickness, latency, price/cost
    if (
      lowerName.includes('weight') ||
      lowerName.includes('weigh') ||
      lowerName.includes('gram') ||
      lowerName.includes('price') ||
      lowerName.includes('cost') ||
      lowerName.includes('thickness') ||
      lowerName.includes('latency') ||
      lowerName.includes('delay') ||
      lowerUnit === 'g' ||
      lowerUnit === 'kg' ||
      lowerUnit === '$' ||
      lowerUnit === '€' ||
      lowerUnit === '£'
    ) {
      return 'lower';
    }
    return 'higher';
  };

  const handleToggleSpecMode = (specName: string, mode: 'higher' | 'lower') => {
    setSpecBestValueModes((prev) => ({
      ...prev,
      [specName]: mode,
    }));
  };

  // Fullscreen image viewer state
  const [fullscreenImages, setFullscreenImages] = useState<Attachment[] | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSlotDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update parent when slots change
  const syncSlotsWithParent = (newSlots: (Product | null)[]) => {
    setRecordSlots(newSlots);
    const validIds = newSlots.filter((p): p is Product => p !== null).map((p) => p.id);
    if (onSetComparedIds) {
      onSetComparedIds(validIds);
    }
  };

  // Add new empty slot (compare multiple products, not limited to 4)
  const handleAddSlot = () => {
    syncSlotsWithParent([...recordSlots, null]);
  };

  // Remove the last slot (if > 2 slots)
  const handleRemoveLastSlot = () => {
    if (recordSlots.length > 2) {
      const newSlots = recordSlots.slice(0, -1);
      syncSlotsWithParent(newSlots);
    }
  };

  // Clear or remove a specific slot
  const handleClearSlot = (index: number) => {
    if (recordSlots.length > 2) {
      // Remove slot entirely if more than 2 slots
      const newSlots = recordSlots.filter((_, i) => i !== index);
      syncSlotsWithParent(newSlots);
    } else {
      // Clear slot to null
      const newSlots = [...recordSlots];
      newSlots[index] = null;
      syncSlotsWithParent(newSlots);
    }
  };

  // Select a product for a slot
  const handleSelectProductForSlot = (index: number, product: Product) => {
    const newSlots = [...recordSlots];
    newSlots[index] = product;
    syncSlotsWithParent(newSlots);
    setActiveSlotDropdown(null);
    setSlotSearchQuery('');
  };

  // Unique tags, brands, and products for the top filter list
  const { tagList, brandList, productList } = useMemo(() => {
    const tags = new Set<string>();
    const brands = new Set<string>();
    const prods = new Set<string>();
    allProducts.forEach((p) => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach((t) => t && tags.add(t.trim()));
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
      tagList: Array.from(tags).sort(sortFn),
      brandList: Array.from(brands).sort(sortFn),
      productList: Array.from(prods).sort(sortFn),
    };
  }, [allProducts]);

  // Selected non-null products
  const selectedProducts = useMemo(() => {
    return recordSlots.filter((p): p is Product => p !== null);
  }, [recordSlots]);

  // Candidate products for dropdown picker
  // RULE: The picked product should not appear in list anymore!
  const candidateProducts = useMemo(() => {
    const pickedIds = new Set(selectedProducts.map((p) => p.id));

    return allProducts.filter((p) => {
      // Exclude already picked products
      if (pickedIds.has(p.id)) return false;

      // Filter by tag/brand/product if not 'All'
      if (selectedTagFilter !== 'All') {
        const target = selectedTagFilter.toLowerCase();
        const matchesTag = p.tags?.some((t) => t.toLowerCase() === target);
        const matchesBrand = p.brand?.toLowerCase() === target;
        const matchesProduct = p.name?.toLowerCase() === target;
        if (!matchesTag && !matchesBrand && !matchesProduct) return false;
      }

      // Filter by search query
      if (slotSearchQuery.trim()) {
        const q = slotSearchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesBrand = p.brand.toLowerCase().includes(q);
        const matchesOverview = p.overview?.toLowerCase().includes(q);
        const matchesTags = p.tags?.some((t) => t.toLowerCase().includes(q));

        // Also check if any picture name or spec matches
        const matchesPictures = p.pictures?.some((pic) => pic.name.toLowerCase().includes(q));
        const matchesSpecs = specifications.some(
          (s) =>
            (s.productId === p.id || s.productTitle.toLowerCase() === p.name.toLowerCase()) &&
            (s.specName.toLowerCase().includes(q) || s.details.toLowerCase().includes(q))
        );

        return (
          matchesName || matchesBrand || matchesOverview || matchesTags || matchesPictures || matchesSpecs
        );
      }

      return true;
    });
  }, [allProducts, selectedProducts, selectedTagFilter, slotSearchQuery, specifications]);

  // Product reviews map
  const productReviewsMap = useMemo(() => {
    const map = new Map<string, UserReview[]>();
    allProducts.forEach((p) => {
      const pReviews = reviews.filter(
        (r) => r.productIds?.includes(p.id) || r.productTitles?.includes(p.name)
      );
      map.set(p.id, pReviews);
    });
    return map;
  }, [allProducts, reviews]);

  // Product specifications map
  const productSpecsMap = useMemo(() => {
    const map = new Map<string, Specification[]>();
    allProducts.forEach((p) => {
      const pSpecs = specifications.filter(
        (s) => s.productId === p.id || s.productTitle.toLowerCase() === p.name.toLowerCase()
      );
      map.set(p.id, pSpecs);
    });
    return map;
  }, [allProducts, specifications]);

  // Complete list of custom specification names across selected products
  const uniqueSpecNames = useMemo(() => {
    const specOrderMap = new Map<string, number>();
    selectedProducts.forEach((p) => {
      const pSpecs = productSpecsMap.get(p.id) || [];
      pSpecs.forEach((s) => {
        const existing = specOrderMap.get(s.specName);
        if (existing === undefined || s.order < existing) {
          specOrderMap.set(s.specName, s.order ?? 999);
        }
      });
    });

    return Array.from(specOrderMap.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
  }, [selectedProducts, productSpecsMap]);

  // Helper to extract numeric value & unit from specification details or spec object
  // Supports e.g. "201 g", "20 g", "5000 mAh", "$1,799", "7.6 inches", "5.6 mm", "12 GB", "1 year", "2 years"
  const parseSpecValue = (
    spec?: Specification,
    specNameFallback?: string
  ): { hasNumeric: boolean; val: number; unit: string; displayUnit: string; rawText: string } => {
    if (!spec || !spec.details) {
      return { hasNumeric: false, val: 0, unit: '', displayUnit: '', rawText: '' };
    }

    const clean = spec.details.replace(/<[^>]*>/g, '').trim();
    if (!clean) {
      return { hasNumeric: false, val: 0, unit: '', displayUnit: '', rawText: '' };
    }

    const explicitUnit = spec.unit?.trim();

    // Check currency prefix e.g. $1,799 or €999
    const currMatch = clean.match(/^([$€£¥₹])\s*([0-9,]+(?:\.[0-9]+)?)/);
    if (currMatch) {
      const num = parseFloat(currMatch[2].replace(/,/g, ''));
      if (!isNaN(num)) {
        return {
          hasNumeric: true,
          val: num,
          unit: explicitUnit || currMatch[1],
          displayUnit: explicitUnit || currMatch[1],
          rawText: clean,
        };
      }
    }

    // Match numeric value (float or int) and optional unit
    // E.g. "201 g", "20 gram", "7.6 inch", "7.6\"", "120 Hz", "5000 mAh", "1.2 kg", "2 years"
    const numMatch = clean.match(/([0-9,]+(?:\.[0-9]+)?)\s*([a-zA-Z$€£%°/"″]+)?/);
    if (numMatch) {
      const num = parseFloat(numMatch[1].replace(/,/g, ''));
      if (!isNaN(num)) {
        let unit = explicitUnit || numMatch[2] || '';
        if (!unit && specNameFallback) {
          const inParens = specNameFallback.match(/\(([^)]+)\)/);
          if (inParens) unit = inParens[1];
        }
        unit = unit.trim();

        // Format common display units
        const lowerU = unit.toLowerCase();
        let displayUnit = unit;
        if (lowerU === 'g' || lowerU === 'gram' || lowerU === 'grams') displayUnit = 'g';
        else if (lowerU === 'kg') displayUnit = 'kg';
        else if (lowerU === 'inch' || lowerU === 'inches' || lowerU === '"' || lowerU === '″') displayUnit = 'inch';
        else if (lowerU === 'cm') displayUnit = 'cm';
        else if (lowerU === 'mm') displayUnit = 'mm';
        else if (lowerU === 'year' || lowerU === 'years') displayUnit = 'year';
        else if (lowerU === 'month' || lowerU === 'months') displayUnit = 'month';
        else if (lowerU === 'mah') displayUnit = 'mAh';
        else if (lowerU === 'hz') displayUnit = 'Hz';

        return {
          hasNumeric: true,
          val: num,
          unit: displayUnit,
          displayUnit,
          rawText: clean,
        };
      }
    }

    return {
      hasNumeric: false,
      val: 0,
      unit: explicitUnit || '',
      displayUnit: explicitUnit || '',
      rawText: clean,
    };
  };

  // Check differences helper for standard fields and specs
  const fieldDiffStatus = useMemo(() => {
    if (selectedProducts.length < 2) return { diffCount: 0, diffs: {} };

    const diffs: Record<string, boolean> = {};

    // 1. Brand
    const brands = selectedProducts.map((p) => (p.brand || '').trim().toLowerCase());
    diffs['Brand'] = !brands.every((b) => b === brands[0]);

    // 2. Tags
    const tagsArr = selectedProducts.map((p) => (p.tags || []).slice().sort().join(',').toLowerCase());
    diffs['Tags'] = !tagsArr.every((t) => t === tagsArr[0]);

    // 3. Overview
    const overviews = selectedProducts.map((p) => (p.overview || '').trim().toLowerCase());
    diffs['Overview'] = !overviews.every((o) => o === overviews[0]);

    // 4. Pictures
    const picCounts = selectedProducts.map((p) => p.pictures?.length || 0);
    diffs['Pictures'] = !picCounts.every((c) => c === picCounts[0]);

    // 5. User reviews
    const revCounts = selectedProducts.map(
      (p) => productReviewsMap.get(p.id)?.length || 0
    );
    diffs['User reviews'] = !revCounts.every((c) => c === revCounts[0]);

    // Custom specs diffs
    uniqueSpecNames.forEach((specName) => {
      const vals = selectedProducts.map((p) => {
        const spec = productSpecsMap
          .get(p.id)
          ?.find((s) => s.specName.toLowerCase() === specName.toLowerCase());
        return spec?.details?.trim().toLowerCase() || '—';
      });
      diffs[specName] = !vals.every((v) => v === vals[0]);
    });

    const diffCount = Object.values(diffs).filter(Boolean).length;
    return { diffCount, diffs };
  }, [selectedProducts, uniqueSpecNames, productSpecsMap, productReviewsMap]);

  // Total fields count
  const totalFieldsCount = 6 + uniqueSpecNames.length;

  return (
    <div id="compare-workspace-container" className="w-full max-w-5xl mx-auto px-1 sm:px-4 md:px-6 py-3 sm:py-8 space-y-4 sm:space-y-6 overflow-x-hidden">
      {/* 1. Header Section */}
      <div className="space-y-1 px-1 sm:px-0">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          COMPARE WORKSPACE
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Choose records
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Search all 5 fields, compare pictures, and open multiple reviews.
            </p>
          </div>

          {/* Action Row: [+ Add record] and [✕ Remove last] */}
          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
            {recordSlots.length > 2 && (
              <button
                id="remove-last-slot-btn"
                onClick={handleRemoveLastSlot}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl transition-all shadow-2xs"
                title="Remove last comparison slot"
              >
                <X className="w-3.5 h-3.5" />
                <span>Remove last</span>
              </button>
            )}

            <button
              id="add-record-slot-btn"
              onClick={handleAddSlot}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add record</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Tag, Brand & Product Filter Bar with Scope Tabs & Inline Search */}
      <TagFilterBar
        label="Filter products by tag / brand / product"
        tags={tagList}
        brands={brandList}
        products={productList}
        selectedTag={selectedTagFilter}
        onSelectTag={setSelectedTagFilter}
        idPrefix="compare-tag-filter"
      />

      {/* 3. Record Slots List */}
      <div className="space-y-4">
        {recordSlots.map((product, slotIndex) => {
          const isSlotOpen = activeSlotDropdown === slotIndex;
          const pReviews = product ? productReviewsMap.get(product.id) || [] : [];

          return (
            <div
              key={slotIndex}
              id={`record-slot-${slotIndex + 1}`}
              className="relative bg-white rounded-2xl border border-slate-200 shadow-2xs p-3.5 sm:p-4 transition-all"
            >
              {/* Slot Header */}
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">
                  RECORD {slotIndex + 1}
                </span>

                <div className="flex items-center gap-2">
                  {product && (
                    <>
                      <button
                        onClick={() => onViewDetails(product)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-indigo-50"
                        title="Edit product workspace"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit product</span>
                      </button>

                      <button
                        onClick={() => handleClearSlot(slotIndex)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                        title={recordSlots.length > 2 ? 'Remove slot' : 'Clear slot'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {!product && recordSlots.length > 2 && (
                    <button
                      onClick={() => handleClearSlot(slotIndex)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                      title="Remove slot"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Slot Card */}
              {product ? (
                <div
                  onClick={() => {
                    setActiveSlotDropdown(isSlotOpen ? null : slotIndex);
                    setSlotSearchQuery('');
                  }}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={getProductImage(product)}
                      alt={product.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getFallbackImage(product);
                      }}
                      className="w-12 h-12 rounded-lg object-cover bg-white border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm sm:text-base truncate group-hover:text-indigo-600 transition-colors">
                        {product.name}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                          ✓ Selected
                        </span>
                        <span>/</span>
                        <span className="font-medium text-slate-700">{product.brand}</span>
                        <span>/</span>
                        <span>{pReviews.length} reviews</span>
                      </div>
                    </div>
                  </div>

                  <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                </div>
              ) : (
                <button
                  id={`slot-select-btn-${slotIndex + 1}`}
                  onClick={() => {
                    setActiveSlotDropdown(isSlotOpen ? null : slotIndex);
                    setSlotSearchQuery('');
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/30 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-200 group-hover:bg-indigo-100 text-slate-500 group-hover:text-indigo-600 flex items-center justify-center transition-colors">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                        Search and select a record
                      </div>
                      <div className="text-xs text-slate-400">
                        Tap to filter and choose a product to compare
                      </div>
                    </div>
                  </div>

                  <ChevronsUpDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                </button>
              )}

              {/* Dropdown Picker Popover (Matches Screenshot IMG_9162) */}
              {isSlotOpen && (
                <div
                  ref={dropdownRef}
                  id={`slot-dropdown-${slotIndex + 1}`}
                  className="absolute left-0 right-0 top-full mt-2 z-40 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 sm:p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150"
                >
                  {/* Search input with subtext */}
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={slotSearchQuery}
                        onChange={(e) => setSlotSearchQuery(e.target.value)}
                        placeholder="Search any field..."
                        autoFocus
                        className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-900 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                      />
                      {slotSearchQuery && (
                        <button
                          onClick={() => setSlotSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 px-1">
                      Search product details, picture names, or review text
                    </p>
                  </div>

                  {/* Active Filter Indicator */}
                  {selectedTagFilter !== 'All' && (
                    <div className="flex items-center justify-between text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100">
                      <span>
                        Filtered by: <strong>{selectedTagFilter}</strong>
                      </span>
                      <button
                        onClick={() => setSelectedTagFilter('All')}
                        className="hover:underline font-semibold"
                      >
                        Show all
                      </button>
                    </div>
                  )}

                  {/* Filtered Candidate Products List */}
                  <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-slate-100">
                    {candidateProducts.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No products available matching this search/filter.
                      </div>
                    ) : (
                      candidateProducts.map((cand) => {
                        const candSpecs = productSpecsMap.get(cand.id) || [];
                        const candReviews = productReviewsMap.get(cand.id) || [];

                        return (
                          <button
                            key={cand.id}
                            id={`pick-product-${cand.id}`}
                            onClick={() => handleSelectProductForSlot(slotIndex, cand)}
                            className="w-full text-left p-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={getProductImage(cand)}
                                alt={cand.name}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = getFallbackImage(cand);
                                }}
                                className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                                  {cand.name}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {cand.brand} / {candSpecs.length} specs / {candReviews.length} reviews
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 shrink-0 ml-2" />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Complete Comparison Summary Line (IMG_9163, IMG_9168) */}
      <div className="space-y-1 pt-2">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          SIDE BY SIDE
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Complete comparison
          </h2>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              {selectedProducts.length} selected
            </span>

            {selectedProducts.length >= 2 && fieldDiffStatus.diffCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800">
                {fieldDiffStatus.diffCount} differences
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {selectedProducts.length === 0 && 'Select at least one product to view every field'}
          {selectedProducts.length === 1 && `${totalFieldsCount} fields shown`}
          {selectedProducts.length >= 2 &&
            `${totalFieldsCount} fields shown, ${fieldDiffStatus.diffCount} differ`}
        </p>
      </div>

      {/* Complete Comparison Mobile-First Field Cards */}
      {selectedProducts.length > 0 ? (
        <div className="space-y-4">
          {/* FIELD 1: Brand */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <Tag className="w-4 h-4 text-indigo-600" />
                <span>Brand</span>
              </div>
              {selectedProducts.length >= 2 && fieldDiffStatus.diffs['Brand'] && (
                <span className="px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium">
                  Different
                </span>
              )}
            </div>
            <div className="p-4 space-y-3 divide-y divide-slate-100">
              {selectedProducts.map((p) => (
                <div key={p.id} className="pt-2 first:pt-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {p.name}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{p.brand}</div>
                </div>
              ))}
            </div>
          </div>

          {/* FIELD 2: Tags */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <Tag className="w-4 h-4 text-indigo-600" />
                <span>Tags</span>
              </div>
              {selectedProducts.length >= 2 && fieldDiffStatus.diffs['Tags'] && (
                <span className="px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium">
                  Different
                </span>
              )}
            </div>
            <div className="p-4 space-y-3 divide-y divide-slate-100">
              {selectedProducts.map((p) => (
                <div key={p.id} className="pt-2 first:pt-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {p.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags && p.tags.length > 0 ? (
                      p.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium"
                        >
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No tags</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FIELD 3: Overview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Overview</span>
              </div>
              {selectedProducts.length >= 2 && fieldDiffStatus.diffs['Overview'] && (
                <span className="px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium">
                  Different
                </span>
              )}
            </div>
            <div className="p-4 space-y-3 divide-y divide-slate-100">
              {selectedProducts.map((p) => (
                <div key={p.id} className="pt-2 first:pt-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {p.name}
                  </div>
                  <div className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {p.overview || <span className="text-slate-400 italic">No overview provided.</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FIELD 4: Pictures (IMG_9165) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                <span>Pictures</span>
              </div>
              {selectedProducts.length >= 2 && fieldDiffStatus.diffs['Pictures'] && (
                <span className="px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium">
                  Different
                </span>
              )}
            </div>
            <div className="p-4 space-y-4 divide-y divide-slate-100">
              {selectedProducts.map((p) => {
                const pictures = p.pictures || [];
                return (
                  <div key={p.id} className="pt-3 first:pt-0">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      {p.name}
                    </div>
                    {pictures.length === 0 ? (
                      <div className="text-xs text-slate-400 italic">No pictures attached</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {pictures.map((pic, picIdx) => (
                          <div
                            key={pic.id || picIdx}
                            className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
                          >
                            <img
                              src={getAttachmentDisplayUrl(pic, p.name, p.brand)}
                              alt={pic.name || 'Product picture'}
                              className="w-full h-48 object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = createProductPlaceholderSvg(p.name, p.brand);
                              }}
                            />

                            {/* View Full Screen Button (Overlay) */}
                            <button
                              onClick={() => {
                                setFullscreenImages(pictures);
                                setFullscreenIndex(picIdx);
                              }}
                              className="absolute top-2 right-2 px-2.5 py-1 bg-black/75 hover:bg-black text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-md backdrop-blur-xs transition-all"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span>View full screen</span>
                            </button>

                            {/* Filename banner */}
                            <div className="p-2 bg-white border-t border-slate-200 text-xs text-slate-700 truncate font-mono">
                              {pic.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* FIELD 5: User reviews (IMG_9170) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>User reviews</span>
              </div>
              {selectedProducts.length >= 2 && fieldDiffStatus.diffs['User reviews'] && (
                <span className="px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium">
                  Different
                </span>
              )}
            </div>
            <div className="p-4 space-y-3 divide-y divide-slate-100">
              {selectedProducts.map((p) => {
                const pReviews = productReviewsMap.get(p.id) || [];
                return (
                  <div key={p.id} className="pt-2 first:pt-0 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        {p.name}
                      </div>
                      {pReviews.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">No linked reviews</div>
                      ) : (
                        <div className="text-xs text-slate-600">
                          {pReviews.length} {pReviews.length === 1 ? 'review' : 'reviews'} available
                        </div>
                      )}
                    </div>

                    {pReviews.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const rev = pReviews[0];
                          if (rev && onOpenViewReview) {
                            onOpenViewReview(rev);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-800 hover:text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Read review</span>
                      </button>
                    ) : (
                      onOpenAddReview && (
                        <button
                          type="button"
                          onClick={() => onOpenAddReview(p)}
                          className="px-3 py-1.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Write review</span>
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ALL CUSTOM SPECIFICATIONS (Interleaved text & numeric visual comparison) */}
          {uniqueSpecNames.map((specName) => {
            const isDiff = fieldDiffStatus.diffs[specName];

            // Parse spec details for every selected product
            const parsedItems = selectedProducts.map((p) => {
              const pSpecs = productSpecsMap.get(p.id) || [];
              const spec = pSpecs.find(
                (s) => s.specName.toLowerCase() === specName.toLowerCase()
              );
              const parsed = parseSpecValue(spec, specName);
              return {
                product: p,
                spec,
                parsed,
              };
            });

            // Check if any product has a numeric value for this spec
            const isNumericSpec = parsedItems.some((it) => it.parsed.hasNumeric);

            if (isNumericSpec) {
              // Extract detected unit
              const detectedUnit =
                parsedItems.find((it) => it.parsed.displayUnit)?.parsed.displayUnit ||
                parsedItems.find((it) => it.spec?.unit)?.spec?.unit ||
                '';

              const numericVals = parsedItems
                .filter((it) => it.parsed.hasNumeric)
                .map((it) => it.parsed.val);
              const maxVal = numericVals.length > 0 ? Math.max(...numericVals) : 1;
              const currentMode = getSpecBestValueMode(specName, detectedUnit);
              const bestVal =
                numericVals.length > 0
                  ? currentMode === 'higher'
                    ? Math.max(...numericVals)
                    : Math.min(...numericVals)
                  : 0;

              return (
                <div
                  key={specName}
                  id={`compare-spec-card-${specName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    isDiff
                      ? 'bg-yellow-50/90 border-yellow-400 ring-2 ring-yellow-400/40 shadow-xs'
                      : 'bg-white border-slate-200 shadow-2xs'
                  }`}
                >
                  {/* Header: Title, Unit, Different badge, Per-Spec Higher/Lower Toggle */}
                  <div
                    className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2.5 ${
                      isDiff
                        ? 'bg-yellow-200/90 border-yellow-300 text-yellow-950 font-bold'
                        : 'bg-slate-50/80 border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-sm text-slate-900">{specName}</span>
                      {detectedUnit && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-mono text-[11px] font-semibold">
                          {detectedUnit}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedProducts.length >= 2 && isDiff && (
                        <span className="px-2.5 py-1 rounded-md border border-yellow-500 bg-yellow-300 text-yellow-950 text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                          <span>Different</span>
                        </span>
                      )}

                      {/* Individual Higher/Lower Toggle Button */}
                      <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          id={`spec-mode-higher-${specName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                          onClick={() => handleToggleSpecMode(specName, 'higher')}
                          className={`px-2.5 py-0.5 text-xs font-semibold rounded-md transition-all ${
                            currentMode === 'higher'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Higher
                        </button>
                        <button
                          type="button"
                          id={`spec-mode-lower-${specName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                          onClick={() => handleToggleSpecMode(specName, 'lower')}
                          className={`px-2.5 py-0.5 text-xs font-semibold rounded-md transition-all ${
                            currentMode === 'lower'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Lower
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Visual Progress Bars for ALL products (including products with no data) */}
                  <div className="p-4 space-y-4 divide-y divide-slate-100">
                    {parsedItems.map(({ product: p, spec, parsed }) => {
                      const hasNumeric = parsed.hasNumeric;
                      const isBest = hasNumeric && parsed.val === bestVal && numericVals.length > 1;
                      const widthPct = hasNumeric
                        ? Math.max(8, Math.min(100, Math.round((parsed.val / (maxVal > 0 ? maxVal : 1)) * 100)))
                        : 0;
                      const specPictures = spec?.pictures || [];

                      return (
                        <div key={p.id} className="pt-3 first:pt-0 space-y-1.5">
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="font-semibold text-slate-900 truncate max-w-[55%]">
                              {p.name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isBest && (
                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1">
                                  🏆 Best
                                </span>
                              )}
                              <span
                                className={`font-mono text-xs sm:text-sm ${
                                  isBest ? 'font-bold text-slate-900' : 'text-slate-700'
                                }`}
                              >
                                {hasNumeric ? (
                                  `${parsed.val} ${parsed.displayUnit || detectedUnit}`
                                ) : parsed.rawText ? (
                                  <span className="font-sans font-normal text-slate-600">
                                    {parsed.rawText}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-normal italic">—</span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Horizontal Visual Progress Bar */}
                          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5">
                            {hasNumeric ? (
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isBest ? 'bg-emerald-500 shadow-2xs' : 'bg-slate-500'
                                }`}
                                style={{ width: `${widthPct}%` }}
                              />
                            ) : (
                              <div className="h-full w-0" />
                            )}
                          </div>

                          {/* Spec Pictures (if any) */}
                          {specPictures.length > 0 && (
                            <div className="pt-1.5 flex flex-wrap gap-2">
                              {specPictures.map((pic, picIdx) => (
                                <div
                                  key={pic.id || picIdx}
                                  className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 w-16 h-12"
                                >
                                  <img
                                    src={getAttachmentDisplayUrl(pic, p.name)}
                                    alt={pic.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(pic.name, p.name);
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      setFullscreenImages(specPictures);
                                      setFullscreenIndex(picIdx);
                                    }}
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                                    title="View full screen"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Standard Text Specification Card
            return (
              <div
                key={specName}
                id={`compare-spec-card-${specName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  isDiff
                    ? 'bg-yellow-50/90 border-yellow-400 ring-2 ring-yellow-400/40 shadow-xs'
                    : 'bg-white border-slate-200 shadow-2xs'
                }`}
              >
                {/* Header */}
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between ${
                    isDiff
                      ? 'bg-yellow-200/90 border-yellow-300 text-yellow-950 font-bold'
                      : 'bg-slate-50/80 border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    <span>{specName}</span>
                  </div>

                  {selectedProducts.length >= 2 && isDiff && (
                    <span className="px-2.5 py-1 rounded-md border border-yellow-500 bg-yellow-300 text-yellow-950 text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                      <span>Different</span>
                    </span>
                  )}
                </div>

                {/* Values for each product */}
                <div className="p-4 space-y-4 divide-y divide-slate-100">
                  {selectedProducts.map((p) => {
                    const pSpecs = productSpecsMap.get(p.id) || [];
                    const spec = pSpecs.find(
                      (s) => s.specName.toLowerCase() === specName.toLowerCase()
                    );
                    const specPictures = spec?.pictures || [];

                    return (
                      <div key={p.id} className="pt-3 first:pt-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {p.name}
                          </span>
                        </div>

                        {/* Specification Details (HTML / rich text) */}
                        {spec && spec.details ? (
                          <div
                            className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line"
                            dangerouslySetInnerHTML={{ __html: spec.details }}
                          />
                        ) : (
                          <div className="pt-0.5">
                            <span className="text-xs text-slate-400 italic">No value provided</span>
                          </div>
                        )}

                        {/* Specification Pictures (if any) */}
                        {specPictures.length > 0 && (
                          <div className="pt-2 space-y-2">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Specification Pictures ({specPictures.length})
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {specPictures.map((pic, picIdx) => (
                                <div
                                  key={pic.id || picIdx}
                                  className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-4/3"
                                >
                                  <img
                                    src={getAttachmentDisplayUrl(pic, p.name)}
                                    alt={pic.name || 'Spec picture'}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(pic.name, p.name);
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      setFullscreenImages(specPictures);
                                      setFullscreenIndex(picIdx);
                                    }}
                                    className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-black/75 hover:bg-black text-white text-[10px] font-medium rounded flex items-center gap-1 shadow-md transition-colors"
                                  >
                                    <Maximize2 className="w-3 h-3" />
                                    <span>Full screen</span>
                                  </button>
                                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                                    <span className="text-[9px] text-white truncate block font-mono">
                                      {pic.name}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 sm:p-10 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
            <Scale className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">No products selected for comparison</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Select products in Record 1 and Record 2 above or choose items from the catalog to see side-by-side specs, units, and visual comparisons.
            </p>
          </div>
        </div>
      )}

      {/* Fullscreen Image Viewer Modal */}
      {fullscreenImages && (
        <FullscreenImageViewer
          images={fullscreenImages}
          initialIndex={fullscreenIndex}
          isOpen={true}
          onClose={() => setFullscreenImages(null)}
        />
      )}
    </div>
  );
};
