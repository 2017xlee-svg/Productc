import React from 'react';
import { Scale, X, ArrowRight, Trash2, Sparkles } from 'lucide-react';
import { Product } from '../types';
import { getProductImage, getFallbackImage } from '../utils/imageFallback';

interface ComparisonTrayProps {
  comparedProducts: Product[];
  onRemoveProduct: (productId: string) => void;
  onClearAll: () => void;
  onOpenCompare: () => void;
  onOpenSmartAdd?: () => void;
}

export const ComparisonTray: React.FC<ComparisonTrayProps> = ({
  comparedProducts,
  onRemoveProduct,
  onClearAll,
  onOpenCompare,
  onOpenSmartAdd,
}) => {
  if (comparedProducts.length === 0) return null;

  return (
    <div
      id="floating-comparison-tray"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      className="fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1rem)] max-w-2xl px-1 sm:px-4 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-2.5 sm:p-4 shadow-2xl border border-slate-700/60 flex items-center justify-between gap-2 sm:gap-4 overflow-hidden">
        {/* Left: Selected items list */}
        <div
          className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar scrollbar-none min-w-0 flex-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex items-center gap-1.5 pl-1 pr-2 border-r border-slate-700/80 shrink-0">
            <Scale className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold whitespace-nowrap">
              {comparedProducts.length} Selected
            </span>
          </div>

          {comparedProducts.map((p) => (
            <div
              key={p.id}
              className="group relative flex items-center gap-2 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl px-2 py-1 shrink-0 transition-colors"
            >
              <img
                src={getProductImage(p)}
                alt={p.name}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getFallbackImage(p);
                }}
                className="w-7 h-7 rounded-lg object-cover bg-slate-700"
              />
              <span className="text-xs font-medium text-slate-200 max-w-[90px] sm:max-w-[120px] truncate">
                {p.name}
              </span>
              <button
                id={`tray-remove-${p.id}`}
                onClick={() => onRemoveProduct(p.id)}
                className="text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-700 transition-colors"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="tray-clear-all-btn"
            onClick={onClearAll}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
            title="Clear all selected"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {onOpenSmartAdd && (
            <button
              id="tray-smart-add-btn"
              onClick={onOpenSmartAdd}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold transition-all border border-amber-500/30 cursor-pointer shadow-sm"
              title="Open Smart Add Product with selected items"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Smart Add</span>
            </button>
          )}

          <button
            id="tray-compare-now-btn"
            onClick={onOpenCompare}
            disabled={comparedProducts.length < 2}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-900/40 cursor-pointer"
          >
            <span>Compare Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
