import React, { useState, useMemo, useRef } from 'react';
import {
  Sparkles,
  Plus,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Check,
  X,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Tag,
  Scale,
  RefreshCw,
  Image as ImageIcon,
  Save,
  CheckCircle2,
  Sliders,
  Box,
  CornerDownRight,
  ArrowUpDown,
  MoveUp,
  MoveDown,
  Loader2,
  ArrowLeft,
  Database,
  ChevronsUpDown,
} from 'lucide-react';
import { Product, Specification, Attachment } from '../types';
import {
  getProductImage,
  getFallbackImage,
  getAttachmentDisplayUrl,
  createSpecPlaceholderSvg,
} from '../utils/imageFallback';
import { createAttachmentFromFile } from '../utils/imageCompressor';
import { FullscreenImageViewer } from './fullscreen-image-viewer';
import { TagFilterBar } from './TagFilterBar';

interface SmartAddProductProps {
  allProducts: Product[];
  specifications: Specification[];
  onSaveProduct: (productData: {
    name: string;
    brand: string;
    tags: string[];
    overview: string;
    pictures: Attachment[];
    specs: { name: string; details: string; unit?: string; order?: number }[];
  }) => Promise<Product>;
  onUpdateProduct: (productId: string, data: Partial<Product>) => Promise<void>;
  onAddSpecification: (specData: {
    productId: string;
    specName: string;
    details: string;
    unit?: string;
    order?: number;
    pictures?: Attachment[];
  }) => Promise<Specification>;
  onUpdateSpecification: (specId: string, data: Partial<Specification>) => Promise<void>;
  onDeleteSpecification: (specId: string) => Promise<void>;
  onReorderSpecifications: (reorders: { id: string; order: number }[]) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onNavigateToCompare?: () => void;
  onNavigateToCatalog?: () => void;
  onSyncCloud?: () => void;
  preselectedProductIds?: string[];
  onOpenProductWorkspace?: (product: Product) => void;
  onOpenAddSpec?: (product: Product, specName?: string) => void;
  onOpenEditSpec?: (spec: Specification) => void;
}

const DEFAULT_EMPTY_STRING_ARRAY: string[] = [];

export const SmartAddProduct: React.FC<SmartAddProductProps> = ({
  allProducts,
  specifications,
  onSaveProduct,
  onUpdateProduct,
  onAddSpecification,
  onUpdateSpecification,
  onDeleteSpecification,
  onReorderSpecifications,
  onDeleteProduct,
  onNavigateToCompare,
  onNavigateToCatalog,
  onSyncCloud,
  preselectedProductIds = DEFAULT_EMPTY_STRING_ARRAY,
  onOpenProductWorkspace,
  onOpenAddSpec,
  onOpenEditSpec,
}) => {
  // Safe arrays
  const safeAllProducts = Array.isArray(allProducts) ? allProducts : [];
  const safeSpecs = Array.isArray(specifications) ? specifications : [];
  const safePreselected = Array.isArray(preselectedProductIds) ? preselectedProductIds : [];

  // Slots for active products being compared and managed (default to preselected, otherwise empty slots)
  const [recordSlots, setRecordSlots] = useState<(Product | null)[]>(() => {
    if (safePreselected.length > 0) {
      const matched = safePreselected
        .map((id) => safeAllProducts.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p));
      if (matched.length >= 2) return matched;
      if (matched.length === 1) return [matched[0], null];
    }
    return [null, null];
  });

  const [activeSlotDropdown, setActiveSlotDropdown] = useState<number | null>(null);
  const [slotSearchQuery, setSlotSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync if preselectedProductIds prop changes externally (using primitive string key)
  const preselectedKey = safePreselected.join(',');
  React.useEffect(() => {
    if (safePreselected.length > 0) {
      const matched = safePreselected
        .map((id) => safeAllProducts.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p));
      if (matched.length > 0) {
        setRecordSlots((prev) => {
          const currentValid = prev.filter((p): p is Product => p !== null);
          const isSame =
            currentValid.length === matched.length &&
            currentValid.every((p, idx) => p.id === matched[idx]?.id);
          if (isSame) return prev;
          return matched.length === 1 ? [matched[0], null] : matched;
        });
      }
    }
  }, [preselectedKey]);

  // Close dropdown on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSlotDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selected non-null products (in current slot order)
  const selectedProducts = useMemo(() => {
    return recordSlots.filter((p): p is Product => p !== null);
  }, [recordSlots]);

  // Selected product IDs in comparison matrix
  const selectedProductIds = useMemo(() => {
    return selectedProducts.map((p) => p.id);
  }, [selectedProducts]);

  const handleAddSlot = () => {
    setRecordSlots((prev) => [...prev, null]);
  };

  const handleRemoveLastSlot = () => {
    if (recordSlots.length > 2) {
      setRecordSlots((prev) => prev.slice(0, -1));
    }
  };

  const handleClearSlot = (index: number) => {
    if (recordSlots.length > 2) {
      setRecordSlots((prev) => prev.filter((_, i) => i !== index));
    } else {
      setRecordSlots((prev) => {
        const next = [...prev];
        next[index] = null;
        return next;
      });
    }
  };

  const handleSelectProductForSlot = (index: number, product: Product) => {
    setRecordSlots((prev) => {
      const next = [...prev];
      next[index] = product;
      return next;
    });
    setActiveSlotDropdown(null);
    setSlotSearchQuery('');
  };

  // Fullscreen preview image viewer
  const [fullscreenImages, setFullscreenImages] = useState<Attachment[] | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  // Track newly created smart products so we can show [New] badge
  const [newlyCreatedProductIds, setNewlyCreatedProductIds] = useState<Set<string>>(new Set());

  // Filter in Catalog Top
  const [selectedTag, setSelectedTag] = useState<string>('All');

  // New Smart Product Creator state
  const [newProductName, setNewProductName] = useState('');
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  // Direct Add Specification to specific Product state
  const [targetProductId, setTargetProductId] = useState<string>('');
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecDetails, setNewSpecDetails] = useState('');
  const [isAddingSpec, setIsAddingSpec] = useState(false);

  // Product Name Inline Editing
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [tempProductName, setTempProductName] = useState('');

  // Inline Spec Editing / Adding Data state
  // Key format: `${productId}__${specName}`
  const [inlineEditKey, setInlineEditKey] = useState<string | null>(null);
  const [inlineSpecName, setInlineSpecName] = useState('');
  const [inlineDetails, setInlineDetails] = useState('');
  const [inlinePictures, setInlinePictures] = useState<Attachment[]>([]);
  const [isUploadingInline, setIsUploadingInline] = useState(false);
  const [isSavingInline, setIsSavingInline] = useState(false);

  // Brand Inline Edit
  const [editingBrandProductId, setEditingBrandProductId] = useState<string | null>(null);
  const [tempBrandValue, setTempBrandValue] = useState('');

  // Manage Spec Order Modal state (matches sample added spec at each product.PNG)
  const [orderModalProduct, setOrderModalProduct] = useState<Product | null>(null);
  const [modalSpecs, setModalSpecs] = useState<Specification[]>([]);
  const [selectedModalSpecId, setSelectedModalSpecId] = useState<string | null>(null);

  // Ref to scroll down to matrix
  const matrixSectionRef = useRef<HTMLDivElement>(null);

  // Set default target product for the add spec dropdown if empty
  const selectedProductIdsKey = selectedProductIds.join(',');
  React.useEffect(() => {
    if (selectedProductIds.length > 0) {
      setTargetProductId((prev) => {
        if (!prev || !selectedProductIds.includes(prev)) {
          return selectedProductIds[0];
        }
        return prev;
      });
    } else {
      setTargetProductId((prev) => (prev ? '' : prev));
    }
  }, [selectedProductIdsKey]);

  // Extract all unique tags, brands, and product names for filter
  const { tagList, brandList, productList } = useMemo(() => {
    const tags = new Set<string>();
    const brands = new Set<string>();
    const prods = new Set<string>();
    safeAllProducts.forEach((p) => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach((t) => {
          if (t && typeof t === 'string' && t.trim()) tags.add(t.trim());
        });
      }
      if (p.brand && typeof p.brand === 'string' && p.brand.trim()) {
        brands.add(p.brand.trim());
      }
      if (p.name && typeof p.name === 'string' && p.name.trim()) {
        prods.add(p.name.trim());
      }
    });
    const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    return {
      tagList: Array.from(tags).sort(sortFn),
      brandList: Array.from(brands).sort(sortFn),
      productList: Array.from(prods).sort(sortFn),
    };
  }, [safeAllProducts]);

  // Filtered candidate products for the slot dropdown picker
  const candidateProducts = useMemo(() => {
    const pickedIds = new Set(selectedProducts.map((p) => p.id));
    return safeAllProducts.filter((p) => {
      // Exclude already picked products in active slots
      if (pickedIds.has(p.id)) return false;

      // Filter by tag/brand/product if selected
      if (selectedTag !== 'All') {
        const target = selectedTag.toLowerCase();
        const hasTag = Array.isArray(p.tags) && p.tags.some((t) => (t || '').toLowerCase() === target);
        const hasBrand = (p.brand || '').toLowerCase() === target;
        const hasProduct = (p.name || '').toLowerCase() === target;
        if (!hasTag && !hasBrand && !hasProduct) return false;
      }

      // Filter by slot search query
      if (slotSearchQuery.trim()) {
        const q = slotSearchQuery.toLowerCase().trim();
        const inName = (p.name || '').toLowerCase().includes(q);
        const inBrand = (p.brand || '').toLowerCase().includes(q);
        const inOverview = (p.overview || '').toLowerCase().includes(q);
        const inTags = Array.isArray(p.tags) && p.tags.some((t) => (t || '').toLowerCase() === q || (t || '').toLowerCase().includes(q));
        const inSpecs = safeSpecs
          .filter((s) => s.productId === p.id || s.productTitle === p.name)
          .some((s) => (s.specName || '').toLowerCase().includes(q) || (s.details || '').toLowerCase().includes(q));
        if (!inName && !inBrand && !inOverview && !inTags && !inSpecs) return false;
      }

      return true;
    });
  }, [safeAllProducts, selectedProducts, selectedTag, slotSearchQuery, safeSpecs]);

  // Extract all unique custom specification names across the selected products
  const uniqueSpecNames = useMemo(() => {
    const namesSet = new Set<string>();
    selectedProducts.forEach((prod) => {
      const pSpecs = specifications.filter((s) => s.productId === prod.id || s.productTitle === prod.name);
      pSpecs.forEach((s) => {
        if (s.specName && s.specName.trim()) {
          namesSet.add(s.specName.trim());
        }
      });
    });
    return Array.from(namesSet);
  }, [selectedProducts, specifications]);

  // Calculate difference count across all fields (Brand, Tags, and Specs)
  const differenceStats = useMemo(() => {
    let diffCount = 0;
    if (selectedProducts.length <= 1) {
      return { diffCount: 0, totalFields: uniqueSpecNames.length + 2 };
    }

    // 1. Check Brand
    const brands = selectedProducts.map((p) => (p.brand || '').trim().toLowerCase());
    const brandDiff = new Set(brands).size > 1;
    if (brandDiff) diffCount++;

    // 2. Check Tags
    const tagStrings = selectedProducts.map((p) => (p.tags || []).slice().sort().join(','));
    const tagsDiff = new Set(tagStrings).size > 1;
    if (tagsDiff) diffCount++;

    // 3. Check each Specification
    uniqueSpecNames.forEach((specName) => {
      const values = selectedProducts.map((prod) => {
        const s = specifications.find(
          (sp) =>
            (sp.productId === prod.id || sp.productTitle === prod.name) &&
            sp.specName.trim().toLowerCase() === specName.trim().toLowerCase()
        );
        return (s?.details || '').trim();
      });
      const isDiff = new Set(values).size > 1 || values.some((v) => !v);
      if (isDiff) diffCount++;
    });

    return {
      diffCount,
      totalFields: uniqueSpecNames.length + 2,
    };
  }, [selectedProducts, uniqueSpecNames, specifications]);

  // Toggle or remove a product from comparison slots
  const handleToggleSelectProduct = (productId: string) => {
    setRecordSlots((prev) => {
      if (prev.some((p) => p?.id === productId)) {
        if (prev.length > 2) {
          return prev.filter((p) => p?.id !== productId);
        } else {
          return prev.map((p) => (p?.id === productId ? null : p));
        }
      } else {
        const prod = safeAllProducts.find((p) => p.id === productId);
        if (!prod) return prev;
        const emptyIdx = prev.findIndex((p) => p === null);
        if (emptyIdx !== -1) {
          const next = [...prev];
          next[emptyIdx] = prod;
          return next;
        }
        return [...prev, prod];
      }
    });
  };

  // Clear all selections (reset slots to empty)
  const handleClearSelected = () => {
    setRecordSlots([null, null]);
  };

  // Move product slot position
  const handleMoveProductOrder = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= recordSlots.length) return;
    const next = [...recordSlots];
    const temp = next[index];
    next[index] = next[newIdx];
    next[newIdx] = temp;
    setRecordSlots(next);
  };

  // Create new Smart Product from the selected specifications
  const handleCreateSmartProduct = async () => {
    const nameToUse = newProductName.trim() || `Smart Product ${allProducts.length + 1}`;
    setIsCreatingProduct(true);
    try {
      // Build blank specs array matching all unique specs from selected products
      const blankSpecs = uniqueSpecNames.map((name, idx) => ({
        name,
        details: '',
        unit: '',
        order: idx + 1,
      }));

      const created = await onSaveProduct({
        name: nameToUse,
        brand: 'Generic',
        tags: ['Smart Add'],
        overview: `Created with ${blankSpecs.length} specifications extracted from comparison matrix.`,
        pictures: [],
        specs: blankSpecs,
      });

      // Mark as newly created
      setNewlyCreatedProductIds((prev) => new Set([...prev, created.id]));

      // Put into first empty slot or append new slot
      setRecordSlots((prev) => {
        const emptyIdx = prev.findIndex((s) => s === null);
        if (emptyIdx !== -1) {
          const next = [...prev];
          next[emptyIdx] = created;
          return next;
        }
        return [...prev, created];
      });
      setNewProductName('');

      // Set as target for adding new specs
      setTargetProductId(created.id);

      // Scroll to matrix
      if (matrixSectionRef.current) {
        matrixSectionRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err: any) {
      console.error('Failed to create smart product:', err);
    } finally {
      setIsCreatingProduct(false);
    }
  };

  // Add Specification to a specific selected product
  const handleAddSpecToProduct = async () => {
    if (!targetProductId || !newSpecName.trim()) return;
    setIsAddingSpec(true);
    try {
      const prodSpecs = specifications.filter((s) => s.productId === targetProductId);
      await onAddSpecification({
        productId: targetProductId,
        specName: newSpecName.trim(),
        details: newSpecDetails.trim(),
        order: prodSpecs.length + 1,
      });
      setNewSpecName('');
      setNewSpecDetails('');
    } catch (err: any) {
      console.error('Failed to add specification:', err);
    } finally {
      setIsAddingSpec(false);
    }
  };

  // Open inline edit for a product's spec (or "Add data")
  const handleStartInlineEdit = (product: Product, specName: string) => {
    const existingSpec = specifications.find(
      (s) =>
        (s.productId === product.id || s.productTitle === product.name) &&
        s.specName.trim().toLowerCase() === specName.trim().toLowerCase()
    );

    setInlineEditKey(`${product.id}__${specName}`);
    setInlineSpecName(existingSpec ? existingSpec.specName : specName);
    setInlineDetails(existingSpec ? existingSpec.details : '');
    setInlinePictures(existingSpec?.pictures || []);
  };

  // Save inline edited/added specification
  const handleSaveInlineSpec = async (product: Product, specName: string) => {
    setIsSavingInline(true);
    try {
      const existingSpec = specifications.find(
        (s) =>
          (s.productId === product.id || s.productTitle === product.name) &&
          s.specName.trim().toLowerCase() === specName.trim().toLowerCase()
      );

      if (existingSpec) {
        // Update existing spec
        await onUpdateSpecification(existingSpec.id, {
          specName: inlineSpecName.trim() || specName,
          details: inlineDetails.trim(),
          pictures: inlinePictures,
        });
      } else {
        // Create new spec for this product
        const prodSpecs = specifications.filter((s) => s.productId === product.id);
        await onAddSpecification({
          productId: product.id,
          specName: inlineSpecName.trim() || specName,
          details: inlineDetails.trim(),
          pictures: inlinePictures,
          order: prodSpecs.length + 1,
        });
      }
      setInlineEditKey(null);
    } catch (err: any) {
      console.error('Failed to save specification:', err);
    } finally {
      setIsSavingInline(false);
    }
  };

  // Move specification order up/down within a product
  const handleMoveSpecWithinProduct = async (product: Product, specName: string, direction: 'up' | 'down') => {
    const prodSpecs = specifications
      .filter((s) => s.productId === product.id || s.productTitle === product.name)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const currentIndex = prodSpecs.findIndex((s) => s.specName.trim().toLowerCase() === specName.trim().toLowerCase());
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= prodSpecs.length) return;

    // Swap their orders
    const currentSpec = prodSpecs[currentIndex];
    const targetSpec = prodSpecs[targetIndex];

    const currentOrder = currentSpec.order || currentIndex + 1;
    const targetOrder = targetSpec.order || targetIndex + 1;

    try {
      await onReorderSpecifications([
        { id: currentSpec.id, order: targetOrder },
        { id: targetSpec.id, order: currentOrder },
      ]);
    } catch (err: any) {
      console.error('Failed to reorder specs:', err);
    }
  };

  // Handle product rename inline
  const handleSaveProductName = async (productId: string) => {
    if (!tempProductName.trim()) {
      setEditingProductId(null);
      return;
    }
    try {
      await onUpdateProduct(productId, { name: tempProductName.trim() });
      setEditingProductId(null);
    } catch (err: any) {
      console.error('Failed to update product name:', err);
    }
  };

  // Handle Brand edit
  const handleSaveBrand = async (productId: string) => {
    try {
      await onUpdateProduct(productId, { brand: tempBrandValue.trim() });
      setEditingBrandProductId(null);
    } catch (err: any) {
      console.error('Failed to update brand:', err);
    }
  };

  // Open Manage Spec Order Modal for a product (matches sample added spec at each product.PNG)
  const handleOpenOrderModal = (product: Product) => {
    const prodSpecs = specifications
      .filter((s) => s.productId === product.id || s.productTitle === product.name)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    setOrderModalProduct(product);
    setModalSpecs(prodSpecs);
    setSelectedModalSpecId(prodSpecs[0]?.id || null);
  };

  // Move spec in modal
  const handleMoveModalSpec = (direction: 'up' | 'down') => {
    if (!selectedModalSpecId) return;
    const idx = modalSpecs.findIndex((s) => s.id === selectedModalSpecId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= modalSpecs.length) return;

    const next = [...modalSpecs];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;

    // Recalculate orders
    const updated = next.map((s, i) => ({ ...s, order: i + 1 }));
    setModalSpecs(updated);
  };

  // Sort modal specs alphabetically
  const handleSortModalSpecs = (order: 'asc' | 'desc') => {
    const sorted = [...modalSpecs].sort((a, b) => {
      const cmp = a.specName.localeCompare(b.specName);
      return order === 'asc' ? cmp : -cmp;
    });
    const updated = sorted.map((s, i) => ({ ...s, order: i + 1 }));
    setModalSpecs(updated);
  };

  // Save modal spec reorders
  const handleSaveModalReorders = async () => {
    if (!orderModalProduct) return;
    try {
      const reorders = modalSpecs.map((s, i) => ({ id: s.id, order: i + 1 }));
      await onReorderSpecifications(reorders);
      setOrderModalProduct(null);
    } catch (err: any) {
      console.error('Failed to save spec orders:', err);
    }
  };

  // Handle picture upload in inline editor (direct Firebase Cloud Storage upload)
  const handleInlinePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setIsUploadingInline(true);
    try {
      for (const file of fileArray) {
        const newAtt = await createAttachmentFromFile(file);
        setInlinePictures((prev) => [...prev, newAtt]);
      }
    } catch (err) {
      console.error('Failed to upload inline spec image:', err);
    } finally {
      setIsUploadingInline(false);
      e.target.value = '';
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* 2. Record Slots Workspace (Matching Compare Workspace div:nth-of-type(3) - scales effortlessly to 1,000+ products) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              SMART ADD & SPECIFICATION WORKSPACE
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              Choose products to compare & manage specs
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Pick records into slots using the fast search selector. Zero lag even with 1,000+ products.
            </p>
          </div>

          {/* Action Row: [+ Add product slot] and [✕ Remove last] */}
          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
            {recordSlots.length > 2 && (
              <button
                id="smart-add-remove-last-slot-btn"
                onClick={handleRemoveLastSlot}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl transition-all shadow-2xs cursor-pointer"
                title="Remove last slot"
              >
                <X className="w-3.5 h-3.5" />
                <span>Remove last</span>
              </button>
            )}

            <button
              id="smart-add-record-slot-btn"
              onClick={handleAddSlot}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add product slot</span>
            </button>
          </div>
        </div>

        {/* Tag, Brand & Product Filter Bar with Scope Tabs & Inline Search */}
        <TagFilterBar
          label="Filter products by tag / brand / product"
          tags={tagList}
          brands={brandList}
          products={productList}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          idPrefix="smart-add-tag-filter"
        />

        {/* Record Slots List (Matching Compare Workspace div:nth-of-type(3)) */}
        <div className="space-y-4 pt-1">
          {recordSlots.map((product, slotIndex) => {
            const isSlotOpen = activeSlotDropdown === slotIndex;
            const pSpecs = product
              ? safeSpecs.filter((s) => s.productId === product.id || s.productTitle === product.name)
              : [];

            return (
              <div
                key={slotIndex}
                id={`smart-add-slot-${slotIndex + 1}`}
                className="relative bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2.5 transition-all"
              >
                {/* Slot Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      Product slot {slotIndex + 1}
                    </span>
                    {product ? (
                      <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                        <span>✓</span>
                        <span className="truncate max-w-[120px] sm:max-w-xs">{product.name}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        Empty slot
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {product && (
                      <>
                        <button
                          onClick={() => {
                            setActiveSlotDropdown(isSlotOpen ? null : slotIndex);
                            setSlotSearchQuery('');
                          }}
                          className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Change
                        </button>

                        <button
                          onClick={() => handleClearSlot(slotIndex)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                          title={recordSlots.length > 2 ? 'Remove slot' : 'Clear slot'}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {!product && recordSlots.length > 2 && (
                      <button
                        onClick={() => handleClearSlot(slotIndex)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
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
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img
                        src={getProductImage(product)}
                        alt={product.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = getFallbackImage(product);
                        }}
                        className="w-12 h-12 rounded-lg object-cover bg-white border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm sm:text-base truncate group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                          <span>{product.name}</span>
                          {newlyCreatedProductIds.has(product.id) && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              New
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                            ✓ Active
                          </span>
                          <span>•</span>
                          <span className="font-medium text-slate-700">{product.brand || 'No brand'}</span>
                          <span>•</span>
                          <span className="font-semibold text-slate-700">{pSpecs.length} specifications</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenProductWorkspace) {
                            onOpenProductWorkspace(product);
                          } else {
                            handleOpenOrderModal(product);
                          }
                        }}
                        className="p-1.5 hover:bg-slate-200/80 text-slate-500 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                        title="Edit product specifications"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronsUpDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                    </div>
                  </div>
                ) : (
                  <button
                    id={`smart-add-slot-select-btn-${slotIndex + 1}`}
                    onClick={() => {
                      setActiveSlotDropdown(isSlotOpen ? null : slotIndex);
                      setSlotSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/30 transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-200 group-hover:bg-indigo-100 text-slate-500 group-hover:text-indigo-600 flex items-center justify-center transition-colors">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                          Search and select a product
                        </div>
                        <div className="text-xs text-slate-400">
                          Tap to search and pick from your catalog (1,000+ records supported)
                        </div>
                      </div>
                    </div>

                    <ChevronsUpDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                  </button>
                )}

                {/* Dropdown Picker Popover (Matches Screenshot IMG_9162 & Compare div:nth-of-type(3)) */}
                {isSlotOpen && (
                  <div
                    ref={dropdownRef}
                    id={`smart-add-slot-dropdown-${slotIndex + 1}`}
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
                          placeholder="Search product name, brand, tags, or specs..."
                          autoFocus
                          className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-900 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                        />
                        {slotSearchQuery && (
                          <button
                            onClick={() => setSlotSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 px-1">
                        Instant lookup across all {safeAllProducts.length} products
                      </p>
                    </div>

                    {/* Active Filter Indicator */}
                    {selectedTag !== 'All' && (
                      <div className="flex items-center justify-between text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100">
                        <span>
                          Filtered by: <strong>{selectedTag}</strong>
                        </span>
                        <button
                          onClick={() => setSelectedTag('All')}
                          className="hover:underline font-semibold cursor-pointer"
                        >
                          Show all
                        </button>
                      </div>
                    )}

                    {/* Filtered Candidate Products List */}
                    <div className="max-h-64 overflow-y-auto space-y-1 divide-y divide-slate-100">
                      {candidateProducts.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500">
                          No products found matching this search/filter.
                        </div>
                      ) : (
                        candidateProducts.map((cand) => {
                          const candSpecs = safeSpecs.filter(
                            (s) => s.productId === cand.id || s.productTitle === cand.name
                          );

                          return (
                            <button
                              key={cand.id}
                              id={`smart-add-pick-product-${cand.id}`}
                              onClick={() => handleSelectProductForSlot(slotIndex, cand)}
                              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer"
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
                                    {cand.brand || 'No brand'} • {candSpecs.length} specs
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

        {/* Selected Products summary line & Quick scroll */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              {selectedProducts.length} of {recordSlots.length} slots filled
            </span>
            <span>•</span>
            <span>{differenceStats.diffCount} differences detected</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClearSelected}
              className="text-slate-500 hover:text-rose-600 font-medium cursor-pointer transition-colors"
            >
              Reset slots
            </button>
            <button
              onClick={() => {
                if (matrixSectionRef.current) {
                  matrixSectionRef.current.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 shadow-2xs cursor-pointer"
            >
              <span>⇋ Go to specification matrix</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. SELECTED PRODUCTS COMPARISON & SMART MATRIX SECTION */}
      <div ref={matrixSectionRef} className="space-y-6 pt-2">
        {/* Section Header with Difference Counter (matches 9:09 & 9:12 screenshots) */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            SELECTED PRODUCTS
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            All details and specifications
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {differenceStats.totalFields} fields shown across {selectedProducts.length} products
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-900 text-white">
              {selectedProducts.length} selected
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
              {differenceStats.diffCount} differences
            </span>
          </div>
        </div>

        {/* Section A: Create New Smart Product ("Create and compare") */}
        {/* Matches screenshot "user can add new product also, it will list as last compare item.PNG" */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1.5">
              New product name
            </label>
            <input
              type="text"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Enter product name"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 rounded-xl border border-slate-200 focus:border-slate-400 outline-none transition-all"
            />
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <span>📄</span>
              <span>{uniqueSpecNames.length} blank specifications</span>
            </span>
          </div>

          <button
            id="create-and-compare-btn"
            onClick={handleCreateSmartProduct}
            disabled={isCreatingProduct}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{isCreatingProduct ? 'Creating product...' : 'Create and compare'}</span>
          </button>
        </div>

        {/* Section B: Add Specification to a Specific Product */}
        {/* Matches screenshot "drop drop list select which product, can add new spec for the product also directly.PNG" */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1.5">Product</label>
            {selectedProducts.length > 0 ? (
              <select
                value={targetProductId}
                onChange={(e) => setTargetProductId(e.target.value)}
                className="w-full sm:w-72 px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 rounded-xl border border-slate-200 focus:border-slate-400 outline-none transition-all cursor-pointer"
              >
                {selectedProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {newlyCreatedProductIds.has(p.id) ? '(New)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-slate-400 italic py-1">
                Select one or more products above first to add specifications directly.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1.5">New specification</label>
            <input
              type="text"
              value={newSpecName}
              onChange={(e) => setNewSpecName(e.target.value)}
              placeholder="Specification name"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 rounded-xl border border-slate-200 focus:border-slate-400 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1.5">Details</label>
            <input
              type="text"
              value={newSpecDetails}
              onChange={(e) => setNewSpecDetails(e.target.value)}
              placeholder="Optional value"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 rounded-xl border border-slate-200 focus:border-slate-400 outline-none transition-all"
            />
          </div>

          <button
            id="add-spec-btn"
            onClick={handleAddSpecToProduct}
            disabled={isAddingSpec || !newSpecName.trim() || selectedProducts.length === 0}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>{isAddingSpec ? 'Adding...' : 'Add specification'}</span>
          </button>
        </div>

        {/* Section C: Selected products order & management cards */}
        {/* Matches screenshot "the app will list all the spec of the selected item .PNG" */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Selected products</h3>

          <div className="space-y-2.5">
            {selectedProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No products selected yet. Tick products from the catalog above to view, edit, and compare.
              </div>
            ) : (
              selectedProducts.map((product, idx) => (
              <div
                key={product.id}
                className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors bg-white"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={getProductImage(product)}
                    alt={product.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getFallbackImage(product);
                    }}
                    className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200/60 shrink-0"
                  />
                  <div className="min-w-0">
                    {editingProductId === product.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={tempProductName}
                          onChange={(e) => setTempProductName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveProductName(product.id);
                            if (e.key === 'Escape') setEditingProductId(null);
                          }}
                          className="px-2 py-1 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-md outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveProductName(product.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingProductId(null)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 truncate">{product.name}</span>
                        {newlyCreatedProductIds.has(product.id) && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            New
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setEditingProductId(product.id);
                            setTempProductName(product.name);
                          }}
                          className="text-slate-400 hover:text-slate-700 p-0.5"
                          title="Rename product"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 truncate">{product.brand || 'No brand'}</p>
                  </div>
                </div>

                {/* Reordering and remove buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleMoveProductOrder(idx, 'down')}
                    disabled={idx === selectedProducts.length - 1}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg disabled:opacity-30 transition-colors"
                    title="Move down in comparison"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveProductOrder(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg disabled:opacity-30 transition-colors"
                    title="Move up in comparison"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleOpenOrderModal(product)}
                    className="px-2 py-1 hover:bg-slate-100 text-slate-600 text-[11px] font-medium rounded-lg transition-colors ml-1 hidden sm:inline-flex items-center gap-1"
                    title="Manage product's specifications order"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Specs</span>
                  </button>
                  <button
                    onClick={() => handleToggleSelectProduct(product.id)}
                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors ml-1"
                    title="Remove from comparison"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
          </div>
        </div>

        {/* Section D: Direct Read & Edit of all Selected Items' Fields (Cards by Field) */}
        {/* Matches sample direct edit.PNG & sample direct edit 2.PNG */}
        {selectedProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-2">
            <Layers className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-bold text-slate-700">No products selected</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Tick one or more products from the catalog above to view, compare, and edit their specifications.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
          {/* 1. Core Field: BRAND */}
          <div className="bg-white rounded-2xl border border-sky-200 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-5 py-3.5 bg-sky-50/50 border-b border-sky-100">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-sky-600" />
                <span className="text-sm font-bold text-slate-900">Brand</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500 text-white shadow-2xs">
                {new Set(selectedProducts.map((p) => p.brand || '')).size > 1 ? 'Different' : 'Same'}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {selectedProducts.map((product) => (
                <div key={product.id} className="p-4 sm:p-5 space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                    {product.name}
                  </span>

                  {editingBrandProductId === product.id ? (
                    <div className="space-y-2 mt-1">
                      <input
                        type="text"
                        value={tempBrandValue}
                        onChange={(e) => setTempBrandValue(e.target.value)}
                        placeholder="Brand"
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveBrand(product.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold"
                        >
                          <Save className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                        <button
                          onClick={() => setEditingBrandProductId(null)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">{product.brand || 'No brand'}</span>
                      <button
                        onClick={() => {
                          setEditingBrandProductId(product.id);
                          setTempBrandValue(product.brand || '');
                        }}
                        className="text-slate-400 hover:text-slate-700 p-0.5"
                        title="Edit brand"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {product.brand && (
                        <button
                          onClick={() => onUpdateProduct(product.id, { brand: '' })}
                          className="text-slate-400 hover:text-rose-600 p-0.5"
                          title="Clear brand"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2. Core Field: TAGS */}
          <div className="bg-white rounded-2xl border border-sky-200 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-5 py-3.5 bg-sky-50/50 border-b border-sky-100">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-600" />
                <span className="text-sm font-bold text-slate-900">Tags</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500 text-white shadow-2xs">
                Different
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {selectedProducts.map((product) => (
                <div key={product.id} className="p-4 sm:p-5 space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                    {product.name}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {product.tags && product.tags.length > 0 ? (
                      product.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700"
                        >
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No tags</span>
                    )}

                    <button
                      onClick={() => {
                        const newTag = window.prompt(`Add tag to ${product.name}:`);
                        if (newTag && newTag.trim()) {
                          const updated = Array.from(new Set([...(product.tags || []), newTag.trim()]));
                          onUpdateProduct(product.id, { tags: updated });
                        }
                      }}
                      className="px-2 py-1 rounded-md text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors inline-flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Choose tags</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. All Specifications Cards (e.g. Size, Weight, Screensize, etc.) */}
          {uniqueSpecNames.map((specName) => {
            // Check difference across selected products
            const specValues = selectedProducts.map((prod) => {
              const s = specifications.find(
                (sp) =>
                  (sp.productId === prod.id || sp.productTitle === prod.name) &&
                  sp.specName.trim().toLowerCase() === specName.trim().toLowerCase()
              );
              return (s?.details || '').trim();
            });
            const isDifferent = new Set(specValues).size > 1 || specValues.some((v) => !v);

            return (
              <div
                key={specName}
                className="bg-white rounded-2xl border border-sky-200 overflow-hidden shadow-xs"
              >
                {/* Field Header with Different/Same Badge */}
                <div className="flex items-center justify-between px-5 py-3.5 bg-sky-50/50 border-b border-sky-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sky-600 font-bold">📄</span>
                    <span className="text-sm font-bold text-slate-900">{specName}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-2xs ${
                      isDifferent ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isDifferent ? 'Different' : 'Same'}
                  </span>
                </div>

                {/* Rows for each selected product */}
                <div className="divide-y divide-slate-100">
                  {selectedProducts.map((product) => {
                    const existingSpec = specifications.find(
                      (s) =>
                        (s.productId === product.id || s.productTitle === product.name) &&
                        s.specName.trim().toLowerCase() === specName.trim().toLowerCase()
                    );
                    const isInlineEditing = inlineEditKey === `${product.id}__${specName}`;

                    return (
                      <div key={product.id} className="p-4 sm:p-5 space-y-2">
                        {/* Product Title */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                            {product.name}
                          </span>
                        </div>

                        {/* CASE 1: Inline Editing Form is open (Matches sample direct edit 2.PNG) */}
                        {isInlineEditing ? (
                          <div className="bg-sky-50/40 border border-sky-300 rounded-xl p-4 space-y-3.5 mt-1 animate-in fade-in duration-200">
                            <div>
                              <label className="block text-xs font-bold text-slate-900 mb-1">
                                Specification
                              </label>
                              <input
                                type="text"
                                value={inlineSpecName}
                                onChange={(e) => setInlineSpecName(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl outline-none focus:border-sky-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-900 mb-1">
                                Details
                              </label>
                              <textarea
                                value={inlineDetails}
                                onChange={(e) => setInlineDetails(e.target.value)}
                                placeholder="Leave blank if not known yet"
                                rows={3}
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl outline-none focus:border-sky-500 resize-y"
                              />
                            </div>

                            {/* Specification Pictures */}
                            <div>
                              <label className="block text-xs font-bold text-slate-900 mb-1.5">
                                Specification pictures
                              </label>
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs">
                                {isUploadingInline ? (
                                  <Loader2 className="w-3.5 h-3.5 text-slate-800 animate-spin" />
                                ) : (
                                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                                )}
                                <span>{isUploadingInline ? 'Uploading...' : 'Choose pictures'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  disabled={isUploadingInline}
                                  onChange={handleInlinePictureUpload}
                                  className="hidden"
                                />
                              </label>

                              {inlinePictures.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {inlinePictures.map((pic, pIdx) => (
                                    <div key={pic.id} className="relative group">
                                      <img
                                        src={getAttachmentDisplayUrl(pic, 'Uploaded spec photo')}
                                        alt={pic.name}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(
                                            pic.name,
                                            'Uploaded photo'
                                          );
                                        }}
                                        className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer"
                                        onClick={() => {
                                          setFullscreenImages(inlinePictures);
                                          setFullscreenIndex(pIdx);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setInlinePictures((prev) => prev.filter((p) => p.id !== pic.id))
                                        }
                                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 text-xs shadow-xs hover:bg-rose-600 cursor-pointer"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons: Save & Cancel */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => handleSaveInlineSpec(product, specName)}
                                disabled={isSavingInline}
                                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>{isSavingInline ? 'Saving...' : 'Save'}</span>
                              </button>
                              <button
                                onClick={() => setInlineEditKey(null)}
                                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          </div>
                        ) : existingSpec && existingSpec.details ? (
                          /* CASE 2: Product has this specification data */
                          <div className="space-y-2">
                            <p className="text-sm text-slate-800 leading-relaxed font-normal">
                              {existingSpec.details}
                            </p>

                            {/* Pictures thumbnails if any */}
                            {existingSpec.pictures && existingSpec.pictures.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {existingSpec.pictures.map((pic, pIdx) => (
                                  <button
                                    key={pic.id || pIdx}
                                    type="button"
                                    onClick={() => {
                                      setFullscreenImages(existingSpec.pictures || []);
                                      setFullscreenIndex(pIdx);
                                    }}
                                    className="group relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-500 shadow-2xs transition-all bg-slate-100 cursor-pointer shrink-0 text-left"
                                    title={`${pic.name || 'Specification picture'} (Click for full screen)`}
                                  >
                                    <img
                                      src={getAttachmentDisplayUrl(pic, existingSpec.specName, product.name)}
                                      alt={pic.name || 'Spec picture'}
                                      className="w-full h-full object-contain p-0.5 bg-slate-50 group-hover:scale-105 transition-transform duration-200"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(
                                          pic.name || existingSpec.specName,
                                          product.name
                                        );
                                      }}
                                    />
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Actions bar: Move Up, Move Down, Edit, Delete */}
                            <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
                              <button
                                onClick={() => handleMoveSpecWithinProduct(product, specName, 'up')}
                                className="hover:text-slate-900 p-0.5"
                                title="Move specification up in order"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveSpecWithinProduct(product, specName, 'down')}
                                className="hover:text-slate-900 p-0.5"
                                title="Move specification down in order"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleStartInlineEdit(product, specName)}
                                className="flex items-center gap-1 hover:text-slate-900 font-medium"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Delete "${specName}" from ${product.name}?`)) {
                                    await onDeleteSpecification(existingSpec.id);
                                  }
                                }}
                                className="flex items-center gap-1 text-rose-500 hover:text-rose-700 font-medium"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* CASE 3: Product has NO data for this spec */
                          <div className="space-y-2">
                            <div className="text-xs text-slate-400 italic">No data</div>
                            <button
                              onClick={() => handleStartInlineEdit(product, specName)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add data</span>
                            </button>
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
        )}
      </div>

      {/* 4. Manage Specifications Order Screen (100% Full-Screen Native App Screen) */}
      {orderModalProduct && (
        <div
          id="manage-spec-order-screen"
          className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden w-full h-full max-w-full select-none sm:select-auto"
        >
          {/* Top Sticky App Bar */}
          <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setOrderModalProduct(null)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors text-xs font-semibold cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <div className="min-w-0">
                <h1 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                  Specifications Order
                </h1>
                <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                  {orderModalProduct.name} • {modalSpecs.length} attributes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setOrderModalProduct(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalReorders}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black active:bg-slate-800 shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </div>
          </header>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-4">
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                FLEXIBLE DATA ATTRIBUTES
              </span>
              <p className="text-xs text-slate-600 mt-0.5">
                Reorder or add technical specifications for <span className="font-semibold text-slate-900">"{orderModalProduct.name}"</span>.
              </p>
            </div>

            {/* Ordering and action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleMoveModalSpec('up')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                <MoveUp className="w-3.5 h-3.5" />
                <span>Move up</span>
              </button>
              <button
                type="button"
                onClick={() => handleMoveModalSpec('down')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                <MoveDown className="w-3.5 h-3.5" />
                <span>Move down</span>
              </button>
              <button
                type="button"
                onClick={() => handleSortModalSpecs('asc')}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                A-Z
              </button>
              <button
                type="button"
                onClick={() => handleSortModalSpecs('desc')}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                Z-A
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onOpenAddSpec && orderModalProduct) {
                    const prod = orderModalProduct;
                    setOrderModalProduct(null);
                    onOpenAddSpec(prod);
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add specification</span>
              </button>
            </div>

            {/* List of numbered specifications with radio/selection and trash */}
            <div className="space-y-2">
              {modalSpecs.map((spec, i) => (
                <div
                  key={spec.id}
                  onClick={() => setSelectedModalSpecId(spec.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedModalSpecId === spec.id
                      ? 'bg-indigo-50/50 border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      checked={selectedModalSpecId === spec.id}
                      onChange={() => setSelectedModalSpecId(spec.id)}
                      className="w-3.5 h-3.5 text-indigo-600 cursor-pointer"
                    />
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900">{spec.specName}</span>
                  </div>

                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await onDeleteSpecification(spec.id);
                      setModalSpecs((prev) => prev.filter((s) => s.id !== spec.id));
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete specification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Interactive Zoom & Pan Image Viewer */}
      <FullscreenImageViewer
        images={fullscreenImages}
        initialIndex={fullscreenIndex}
        isOpen={fullscreenImages !== null}
        onClose={() => setFullscreenImages(null)}
      />
    </div>
  );
};
