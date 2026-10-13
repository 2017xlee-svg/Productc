import React, { useState, useMemo, useRef } from 'react';
import { Tag, Search, ChevronLeft, ChevronRight, Layers, Building2, Package, Sparkles } from 'lucide-react';

export type FilterScope = 'all' | 'tag' | 'brand' | 'product';

export interface FilterItem {
  label: string;
  type: 'tag' | 'brand' | 'product';
}

export interface TagFilterBarProps {
  /** Label shown next to the icon (defaults to 'Filter products by tag / brand / product') */
  label?: string;
  /** List of tag strings (categories/features) */
  tags?: string[];
  /** List of brand strings */
  brands?: string[];
  /** List of product names */
  products?: string[];
  /** Optional custom typed items list */
  items?: FilterItem[];
  /** Currently selected filter string ('All' or specific tag/brand/product) */
  selectedTag: string;
  /** Callback when user selects a filter */
  onSelectTag: (item: string) => void;
  /** Optional search placeholder */
  searchPlaceholder?: string;
  /** Optional ID prefix for test/automation */
  idPrefix?: string;
  /** Optional custom container class */
  className?: string;
}

export const TagFilterBar: React.FC<TagFilterBarProps> = ({
  label = 'Filter products by tag / brand / product',
  tags = [],
  brands = [],
  products = [],
  items,
  selectedTag = 'All',
  onSelectTag,
  searchPlaceholder = 'Search tags, brands, or products...',
  idPrefix = 'tag-filter',
  className = '',
}) => {
  const [activeScope, setActiveScope] = useState<FilterScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Normalize all items into typed FilterItem objects
  const { allItems, tagList, brandList, productList } = useMemo(() => {
    const tagSet = new Set<string>();
    const brandSet = new Set<string>();
    const prodSet = new Set<string>();

    if (items && items.length > 0) {
      items.forEach((item) => {
        const clean = (item.label || '').trim();
        if (!clean || clean.toLowerCase() === 'all') return;
        if (item.type === 'tag') tagSet.add(clean);
        else if (item.type === 'brand') brandSet.add(clean);
        else if (item.type === 'product') prodSet.add(clean);
      });
    } else {
      tags.forEach((t) => {
        const clean = (t || '').trim();
        if (clean && clean.toLowerCase() !== 'all') tagSet.add(clean);
      });
      brands.forEach((b) => {
        const clean = (b || '').trim();
        if (clean && clean.toLowerCase() !== 'all') brandSet.add(clean);
      });
      products.forEach((p) => {
        const clean = (p || '').trim();
        if (clean && clean.toLowerCase() !== 'all') prodSet.add(clean);
      });
    }

    const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    const sortedTags = Array.from(tagSet).sort(sortFn);
    const sortedBrands = Array.from(brandSet).sort(sortFn);
    const sortedProducts = Array.from(prodSet).sort(sortFn);

    const unified: FilterItem[] = [
      ...sortedTags.map((label): FilterItem => ({ label, type: 'tag' })),
      ...sortedBrands.map((label): FilterItem => ({ label, type: 'brand' })),
      ...sortedProducts.map((label): FilterItem => ({ label, type: 'product' })),
    ];

    return {
      allItems: unified,
      tagList: sortedTags,
      brandList: sortedBrands,
      productList: sortedProducts,
    };
  }, [tags, brands, products, items]);

  // Filter items based on activeScope and searchQuery
  const visibleItems = useMemo(() => {
    let list = allItems;
    if (activeScope === 'tag') {
      list = allItems.filter((i) => i.type === 'tag');
    } else if (activeScope === 'brand') {
      list = allItems.filter((i) => i.type === 'brand');
    } else if (activeScope === 'product') {
      list = allItems.filter((i) => i.type === 'product');
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter((i) => i.label.toLowerCase().includes(q));
  }, [allItems, activeScope, searchQuery]);

  // Scroll controls for laptop & desktop
  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -240 : 240;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  const handlePillClick = (label: string) => {
    if (selectedTag.toLowerCase() === label.toLowerCase() && label.toLowerCase() !== 'all') {
      // Toggle off to 'All'
      onSelectTag('All');
    } else {
      onSelectTag(label);
    }
  };

  const isAllActive = selectedTag.toLowerCase() === 'all';

  return (
    <div
      className={`space-y-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs w-full max-w-full overflow-hidden ${className}`}
    >
      {/* Row 1: Header Label, Options count & Inline Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800">{label}</span>
          <span className="text-[11px] font-semibold text-slate-400">
            ({allItems.length} total options)
          </span>
        </div>

        {/* Inline Search across tags, brands, and products */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-7 py-1 text-xs bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-900 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer rounded-full"
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Option 1 Scope Selector Tabs: [All] [🏷️ Tags] [🏢 Brands] [📦 Products] */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {/* Tab: All */}
          <button
            type="button"
            onClick={() => setActiveScope('all')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeScope === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>All</span>
            <span className="text-[10px] opacity-75 font-normal">({allItems.length})</span>
          </button>

          {/* Tab: Tags */}
          <button
            type="button"
            onClick={() => setActiveScope('tag')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeScope === 'tag'
                ? 'bg-indigo-600 text-white shadow-2xs ring-1 ring-indigo-300'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag className="w-3 h-3 text-indigo-400" />
            <span>Tags</span>
            <span className="text-[10px] opacity-75 font-normal">({tagList.length})</span>
          </button>

          {/* Tab: Brands */}
          <button
            type="button"
            onClick={() => setActiveScope('brand')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeScope === 'brand'
                ? 'bg-amber-600 text-white shadow-2xs ring-1 ring-amber-300'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3 h-3 text-amber-300" />
            <span>Brands</span>
            <span className="text-[10px] opacity-75 font-normal">({brandList.length})</span>
          </button>

          {/* Tab: Products */}
          <button
            type="button"
            onClick={() => setActiveScope('product')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeScope === 'product'
                ? 'bg-emerald-600 text-white shadow-2xs ring-1 ring-emerald-300'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3 h-3 text-emerald-300" />
            <span>Products</span>
            <span className="text-[10px] opacity-75 font-normal">({productList.length})</span>
          </button>
        </div>

        {/* Active Filter Pill badge if a filter is active */}
        {!isAllActive && (
          <div className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-100">
            <span className="text-[11px] text-slate-500">Filtered:</span>
            <strong className="font-semibold truncate max-w-[140px] sm:max-w-xs">{selectedTag}</strong>
            <button
              type="button"
              onClick={() => onSelectTag('All')}
              className="text-[11px] hover:text-rose-600 ml-1 font-bold cursor-pointer"
              title="Reset to All"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Row 3: Scrollable Pills Strip with Laptop/Trackpad Left-Right Navigation */}
      <div className="relative flex items-center group/scroll">
        {/* Scroll Left Button */}
        <button
          type="button"
          onClick={() => handleScroll('left')}
          className="hidden sm:flex absolute left-0 z-10 w-7 h-7 -ml-1 rounded-full bg-white/95 hover:bg-white text-slate-700 border border-slate-200 shadow-md items-center justify-center transition-all cursor-pointer opacity-85 hover:opacity-100 hover:scale-105 active:scale-95"
          title="Scroll left"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Scrollable Container */}
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 scroll-smooth w-full select-none sm:px-6 scrollbar-thin"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
          }}
        >
          {/* Always have 'All' pill at the start */}
          <button
            type="button"
            id={`${idPrefix}-all`}
            onClick={() => onSelectTag('All')}
            className={`px-3 py-1 text-xs rounded-lg transition-all font-medium flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer shadow-2xs ${
              isAllActive
                ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-300'
                : 'bg-slate-100 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900'
            }`}
          >
            {isAllActive && <span className="text-[10px]">✓</span>}
            <span>All</span>
          </button>

          {visibleItems.length === 0 ? (
            <div className="text-xs text-slate-400 italic py-1 px-2">
              No matching {activeScope === 'all' ? 'items' : `${activeScope}s`} for &quot;{searchQuery}&quot;
            </div>
          ) : (
            visibleItems.map((item) => {
              const isSelected = selectedTag.toLowerCase() === item.label.toLowerCase();
              return (
                <button
                  key={`${item.type}-${item.label}`}
                  id={`${idPrefix}-${item.label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                  onClick={() => handlePillClick(item.label)}
                  className={`px-3 py-1 text-xs rounded-lg transition-all font-medium flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer shadow-2xs ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-300'
                      : 'bg-slate-100 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {isSelected && <span className="text-[10px]">✓</span>}
                  {item.type === 'tag' && <Tag className="w-2.5 h-2.5 text-indigo-500 opacity-70 shrink-0" />}
                  {item.type === 'brand' && <Building2 className="w-2.5 h-2.5 text-amber-500 opacity-80 shrink-0" />}
                  {item.type === 'product' && <Package className="w-2.5 h-2.5 text-emerald-600 opacity-80 shrink-0" />}
                  <span>{item.label}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Scroll Right Button */}
        <button
          type="button"
          onClick={() => handleScroll('right')}
          className="hidden sm:flex absolute right-0 z-10 w-7 h-7 -mr-1 rounded-full bg-white/95 hover:bg-white text-slate-700 border border-slate-200 shadow-md items-center justify-center transition-all cursor-pointer opacity-85 hover:opacity-100 hover:scale-105 active:scale-95"
          title="Scroll right"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
