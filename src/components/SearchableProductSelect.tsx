import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Package } from 'lucide-react';
import { Product } from '../types';
import { getProductImage } from '../utils/imageFallback';
import { getCleanProductDisplayName, sortProductsByName } from '../utils/productUtils';

interface SearchableProductSelectProps {
  products: Product[];
  selectedProductId: string;
  onSelectProduct: (productId: string) => void;
  placeholder?: string;
  darkMode?: boolean;
  allowAll?: boolean;
  allLabel?: string;
  allCount?: number;
  productCounts?: Record<string, number>;
  className?: string;
  id?: string;
}

export const SearchableProductSelect: React.FC<SearchableProductSelectProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  placeholder = 'Search & select product...',
  darkMode = false,
  allowAll = false,
  allLabel = 'All Products',
  allCount,
  productCounts,
  className = '',
  id = 'searchable-product-select',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products]);

  // Sort products alphabetically from A to Z by clean display name
  const sortedProducts = useMemo(() => {
    return sortProductsByName(safeProducts);
  }, [safeProducts]);

  // Filter sorted products by search query (matches name or brand)
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return sortedProducts;
    const q = searchQuery.toLowerCase().trim();
    return sortedProducts.filter(
      (p) =>
        (p?.name && p.name.toLowerCase().includes(q)) ||
        (p?.brand && p.brand.toLowerCase().includes(q))
    );
  }, [sortedProducts, searchQuery]);

  // Find currently selected product
  const selectedProduct = useMemo(() => {
    if (allowAll && selectedProductId === 'all') return null;
    return safeProducts.find((p) => p.id === selectedProductId) || null;
  }, [safeProducts, selectedProductId, allowAll]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelect = (productId: string) => {
    onSelectProduct(productId);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`} id={id}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-xl border transition-all cursor-pointer select-none text-left ${
          darkMode
            ? 'bg-slate-900 border-slate-700 text-white hover:border-slate-500 focus:ring-2 focus:ring-indigo-500/50'
            : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500'
        } ${isOpen ? (darkMode ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-indigo-500 ring-2 ring-indigo-100 bg-white') : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {allowAll && selectedProductId === 'all' ? (
            <>
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                  darkMode ? 'bg-indigo-900/60 text-indigo-300' : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                <Package className="w-3 h-3" />
              </div>
              <span className="font-semibold truncate">
                {allLabel} {allCount !== undefined && `(${allCount})`}
              </span>
            </>
          ) : selectedProduct ? (
            <>
              <img
                src={getProductImage(selectedProduct)}
                alt={selectedProduct.name}
                className="w-5 h-5 rounded-md object-cover border border-slate-300/60 shrink-0 bg-slate-100"
              />
              <span className="font-medium truncate">{getCleanProductDisplayName(selectedProduct)}</span>
              {selectedProduct.brand &&
                !selectedProduct.name.toLowerCase().startsWith(selectedProduct.brand.toLowerCase()) && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 font-medium ${
                      darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {selectedProduct.brand}
                  </span>
                )}
              {productCounts && productCounts[selectedProduct.id] !== undefined && (
                <span className="text-[10px] text-slate-400 shrink-0">
                  ({productCounts[selectedProduct.id]})
                </span>
              )}
            </>
          ) : (
            <span className={darkMode ? 'text-slate-400' : 'text-slate-400'}>
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-indigo-500' : darkMode ? 'text-slate-400' : 'text-slate-400'
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl shadow-2xl border overflow-hidden flex flex-col max-h-72 min-w-[260px] animate-in fade-in-50 zoom-in-95 duration-100 ${
            darkMode
              ? 'bg-slate-900 border-slate-700 text-white shadow-black/60'
              : 'bg-white border-slate-200 text-slate-800 shadow-slate-900/15'
          }`}
        >
          {/* Search Box */}
          <div
            className={`p-2 border-b flex items-center gap-2 shrink-0 ${
              darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50/80'
            }`}
          >
            <Search
              className={`w-3.5 h-3.5 shrink-0 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to filter products..."
              className={`w-full text-xs bg-transparent outline-none placeholder:text-slate-400 ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-0.5 rounded-md hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="overflow-y-auto overflow-x-hidden flex-1 p-1 space-y-0.5 max-h-56">
            {/* "All Products" Option if allowed */}
            {allowAll && !searchQuery.trim() && (
              <button
                type="button"
                onClick={() => handleSelect('all')}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs rounded-lg transition-colors text-left cursor-pointer ${
                  selectedProductId === 'all'
                    ? darkMode
                      ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                      : 'bg-indigo-50 text-indigo-700 font-semibold'
                    : darkMode
                    ? 'hover:bg-slate-800 text-slate-200'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                      darkMode ? 'bg-indigo-900/60 text-indigo-300' : 'bg-indigo-100 text-indigo-600'
                    }`}
                  >
                    <Package className="w-3 h-3" />
                  </div>
                  <span className="truncate">
                    {allLabel} {allCount !== undefined && `(${allCount})`}
                  </span>
                </div>
                {selectedProductId === 'all' && (
                  <Check
                    className={`w-3.5 h-3.5 shrink-0 ${
                      darkMode ? 'text-indigo-400' : 'text-indigo-600'
                    }`}
                  />
                )}
              </button>
            )}

            {filteredProducts.length === 0 ? (
              <div className="py-6 px-3 text-center text-xs text-slate-400">
                No matching products found
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = selectedProductId === p.id;
                const count = productCounts ? productCounts[p.id] : undefined;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelect(p.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left cursor-pointer ${
                      isSelected
                        ? darkMode
                          ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                          : 'bg-indigo-50 text-indigo-700 font-semibold'
                        : darkMode
                        ? 'hover:bg-slate-800 text-slate-200'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <img
                        src={getProductImage(p)}
                        alt={p.name}
                        className="w-6 h-6 rounded-md object-cover border border-slate-300/60 shrink-0 bg-slate-100"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{getCleanProductDisplayName(p)}</div>
                        {p.brand && !p.name.toLowerCase().startsWith(p.brand.toLowerCase()) && (
                          <div
                            className={`text-[10px] truncate ${
                              darkMode ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {p.brand}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {count !== undefined && (
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                            isSelected
                              ? darkMode
                                ? 'bg-indigo-900/60 text-indigo-300'
                                : 'bg-indigo-100 text-indigo-700'
                              : darkMode
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-slate-200/60 text-slate-600'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                      {isSelected && (
                        <Check
                          className={`w-3.5 h-3.5 ${
                            darkMode ? 'text-indigo-400' : 'text-indigo-600'
                          }`}
                        />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
