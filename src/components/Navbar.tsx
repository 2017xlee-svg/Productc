import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  RefreshCw,
  Scale,
  MessageSquare,
  Database,
  Plus,
  ChevronDown,
  Check,
  Menu,
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  Sparkles,
  Maximize2,
  HardDrive,
} from 'lucide-react';
import { AppUser, ViewMode, SyncProgress } from '../types';

interface NavbarProps {
  currentView: ViewMode | 'reviews' | 'database';
  setCurrentView: (view: ViewMode | 'reviews' | 'database') => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  comparedCount: number;
  lastSynced: string;
  lastPushed?: string;
  isSyncing: boolean;
  isSyncingFrom?: boolean;
  isSyncingTo?: boolean;
  currentProgress?: SyncProgress | null;
  onSync?: () => void;
  onSyncToCloud?: () => void;
  onPullFromCloud?: () => void;
  currentUser: AppUser | null;
  allUsers: AppUser[];
  onSelectUser: (user: AppUser) => void;
  onOpenSyncModal: () => void;
  onOpenAddProduct?: () => void;
  onOpenFullscreenStudio?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  searchQuery = '',
  setSearchQuery,
  comparedCount,
  lastSynced,
  lastPushed,
  isSyncing,
  isSyncingFrom = false,
  isSyncingTo = false,
  currentProgress = null,
  onSync,
  onSyncToCloud,
  onPullFromCloud,
  currentUser,
  allUsers,
  onSelectUser,
  onOpenSyncModal,
  onOpenAddProduct,
  onOpenFullscreenStudio,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const formattedSyncTime = React.useMemo(() => {
    try {
      const date = new Date(lastSynced);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Just now';
    }
  }, [lastSynced]);

  const activeViewLabel = React.useMemo(() => {
    switch (currentView) {
      case 'compare':
        return `Compare ${comparedCount > 0 ? `(${comparedCount})` : ''}`;
      case 'smart-add':
        return 'Smart Add';
      case 'reviews':
        return 'Reviews';
      case 'database':
        return 'Cloud Sync';
      case 'table':
        return 'Catalog (Table)';
      case 'grid':
      default:
        return 'Catalog';
    }
  }, [currentView, comparedCount]);

  return (
    <header
      id="main-header"
      className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 w-full max-w-full pt-safe"
    >
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Row: Brand, Search (Desktop), Actions */}
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          {/* Logo & App Info */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              id="brand-logo-btn"
              onClick={() => setCurrentView('grid')}
              className="flex items-center gap-2 text-left group cursor-pointer focus:outline-none"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-sm shadow-indigo-200 shrink-0">
                <Scale className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:scale-110" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold text-slate-900 tracking-tight text-sm sm:text-base md:text-lg truncate">
                    ProductCompare
                  </span>
                  <span className="inline-flex text-[10px] sm:text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-1.5 sm:px-2 py-0.5 rounded-full border border-indigo-100 shrink-0">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden md:block truncate">
                  Side-by-side consumer tech benchmark
                </p>
              </div>
            </button>
          </div>

          {/* Navigation and Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Desktop View Switcher Tabs */}
            <div className="hidden lg:flex items-center p-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
              <button
                id="nav-catalog-tab"
                onClick={() => setCurrentView('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  currentView === 'grid' || currentView === 'table'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Catalog</span>
              </button>
              <button
                id="nav-compare-tab"
                onClick={() => setCurrentView('compare')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors relative ${
                  currentView === 'compare'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Compare</span>
                {comparedCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[10px] font-bold">
                    {comparedCount}
                  </span>
                )}
              </button>
              <button
                id="nav-smart-add-tab"
                onClick={() => setCurrentView('smart-add')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  currentView === 'smart-add'
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold'
                }`}
                title="Smart Add Product"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Smart Add Product</span>
              </button>
              <button
                id="nav-reviews-tab"
                onClick={() => setCurrentView('reviews')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  currentView === 'reviews'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Reviews</span>
              </button>
              <button
                id="nav-database-tab"
                onClick={() => setCurrentView('database')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  currentView === 'database'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                <span>Data & Backup</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile View Navigation Bar: Scrollable Bar + Quick Dropdown List */}
        <div className="flex lg:hidden items-center justify-between gap-1.5 py-1.5 border-t border-slate-100 w-full max-w-full relative">
          {/* Horizontally Scrollable Pills (Scrollaber) */}
          <div
            id="mobile-nav-scroll-bar"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth flex-1 min-w-0 py-0.5"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* 1. Catalog */}
            <button
              id="mobile-nav-catalog-tab"
              onClick={() => {
                setCurrentView('grid');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                currentView === 'grid' || currentView === 'table'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Catalog</span>
            </button>

            {/* 2. Compare */}
            <button
              id="mobile-nav-compare-tab"
              onClick={() => {
                setCurrentView('compare');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors relative ${
                currentView === 'compare'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              <Scale className="w-3.5 h-3.5 shrink-0" />
              <span>Compare</span>
              {comparedCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                    currentView === 'compare'
                      ? 'bg-white text-indigo-700'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  {comparedCount}
                </span>
              )}
            </button>

            {/* 2.5. Smart Add Product */}
            <button
              id="mobile-nav-smart-add-tab"
              onClick={() => {
                setCurrentView('smart-add');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                currentView === 'smart-add'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 active:bg-amber-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Smart Add Product</span>
            </button>

            {/* 3. Reviews */}
            <button
              id="mobile-nav-reviews-tab"
              onClick={() => {
                setCurrentView('reviews');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                currentView === 'reviews'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span>Reviews</span>
            </button>

            {/* 5. Data & Backup Full View */}
            <button
              id="mobile-nav-database-tab"
              onClick={() => {
                setCurrentView('database');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                currentView === 'database'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>Data & Backup</span>
            </button>
          </div>

          {/* Quick Dropdown List Button ("drop list") */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              id="mobile-view-droplist-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isMobileMenuOpen
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Open view drop list"
              aria-label="Open view drop list"
            >
              <Menu className="w-3.5 h-3.5" />
              <ChevronDown className={`w-3 h-3 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu Overlay List */}
            {isMobileMenuOpen && (
              <div
                id="mobile-view-droplist-menu"
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-[100] animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                  Switch Section / Tool
                </div>

                <button
                  id="droplist-item-catalog"
                  onClick={() => {
                    setCurrentView('grid');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                    currentView === 'grid' || currentView === 'table'
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Catalog</span>
                  </div>
                  {(currentView === 'grid' || currentView === 'table') && (
                    <Check className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                </button>

                <button
                  id="droplist-item-compare"
                  onClick={() => {
                    setCurrentView('compare');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                    currentView === 'compare'
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    <span>Compare Products</span>
                  </div>
                  {comparedCount > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                      {comparedCount}
                    </span>
                  ) : currentView === 'compare' ? (
                    <Check className="w-3.5 h-3.5 text-indigo-600" />
                  ) : null}
                </button>

                <button
                  id="droplist-item-smart-add"
                  onClick={() => {
                    setCurrentView('smart-add');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                    currentView === 'smart-add'
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Smart Add Product</span>
                  </div>
                  {currentView === 'smart-add' && (
                    <Check className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                </button>

                <button
                  id="droplist-item-reviews"
                  onClick={() => {
                    setCurrentView('reviews');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                    currentView === 'reviews'
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span>Product Reviews</span>
                  </div>
                  {currentView === 'reviews' && (
                    <Check className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                </button>

                <button
                  id="droplist-item-database"
                  onClick={() => {
                    setCurrentView('database');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                    currentView === 'database'
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-600" />
                    <span>Data & Backup</span>
                  </div>
                  {currentView === 'database' && (
                    <Check className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                </button>

                {onOpenAddProduct && (
                  <div className="px-2 pt-1 border-t border-slate-100 mb-1">
                    <button
                      id="droplist-add-product-btn"
                      onClick={() => {
                        onOpenAddProduct();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Product</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

