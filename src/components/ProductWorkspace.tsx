import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Box,
  Tag,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  Image as ImageIcon,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Send,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link as LinkIcon,
  Scale,
  Layers,
  X,
  Maximize2,
  Edit3,
  Loader2,
  Search,
  ChevronLeft,
} from 'lucide-react';
import { Attachment } from '../types';
import { FullscreenImageViewer } from './fullscreen-image-viewer';
import { createAttachmentFromFile, createAttachmentFromUrl, getCachedObjectUrl } from '../utils/imageCompressor';
import {
  isExpiredOrDeadUrl,
  createProductPlaceholderSvg,
  createSpecPlaceholderSvg,
  getAttachmentDisplayUrl,
  GENERIC_SPEC_PLACEHOLDER,
} from '../utils/imageFallback';

interface ProductSpecItem {
  id: string;
  name: string;
  details: string;
  unit?: string;
  order: number;
  pictures?: Attachment[];
}

interface ProductWorkspaceProps {
  onClose: () => void;
  onNavigateToCompare?: () => void;
  onNavigateToManage?: () => void;
  allExistingTags?: string[];
  onAddNewTag?: (tag: string) => void;
  allExistingBrands?: string[];
  onAddNewBrand?: (brand: string) => void;
  isEditMode?: boolean;
  productId?: string;
  initialData?: {
    name?: string;
    brand?: string;
    tags?: string[];
    overview?: string;
    pictures?: Attachment[];
    specs?: { id?: string; name: string; details: string; unit?: string; order?: number; pictures?: Attachment[] }[];
  };
  onSaveProduct: (productData: {
    name: string;
    brand: string;
    tags: string[];
    overview: string;
    pictures: Attachment[];
    specs: { id?: string; name: string; details: string; unit?: string; order?: number; pictures?: Attachment[] }[];
  }) => Promise<void>;
  onDeleteProduct?: (productId: string) => Promise<void>;
}

const DEFAULT_PRESET_TAGS = [
  'viture',
  'Smartphone',
  'IT product',
  'Shoe',
  'TV',
  'Audio',
  'Wearable',
  'Home appliance',
  'Puma',
  'Adidas',
  'Plaud',
  'Ai voice recorder',
  'Boya',
  'Test2',
  'vivo',
  'Smart wear',
  'dress',
];

const DEFAULT_PRESET_BRANDS = [
  'Apple',
  'Samsung',
  'Sony',
  'vivo',
  'Asus',
  'Xiaomi',
  'Huawei',
  'Google',
  'LG',
  'OnePlus',
  'Oppo',
  'Lenovo',
  'Dell',
  'HP',
  'Acer',
  'Bose',
  'JBL',
  'Sennheiser',
  'Nike',
  'Adidas',
  'Puma',
  'Under Armour',
  'Viture',
  'Plaud',
  'Boya',
  'Dyson',
  'Philips',
  'Anker',
];

const getStoredCustomTags = (): string[] => {
  try {
    const raw = localStorage.getItem('comparison_custom_tags');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore localStorage errors
  }
  return [];
};

const getStoredCustomBrands = (): string[] => {
  try {
    const raw = localStorage.getItem('comparison_custom_brands');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore localStorage errors
  }
  return [];
};

const DEFAULT_EMPTY_STRING_ARRAY: string[] = [];

export const ProductWorkspace: React.FC<ProductWorkspaceProps> = ({
  onClose,
  onNavigateToCompare,
  onNavigateToManage,
  allExistingTags = DEFAULT_EMPTY_STRING_ARRAY,
  onAddNewTag,
  allExistingBrands = DEFAULT_EMPTY_STRING_ARRAY,
  onAddNewBrand,
  isEditMode = false,
  productId,
  initialData,
  onSaveProduct,
  onDeleteProduct,
}) => {
  // Product Identity State
  const [name, setName] = useState(initialData?.name || '');
  const [brand, setBrand] = useState(initialData?.brand || '');

  // Brands list state with persistent storage and inline search filter
  const [availableBrands, setAvailableBrands] = useState<string[]>(() => {
    const custom = getStoredCustomBrands();
    return Array.from(
      new Set([...DEFAULT_PRESET_BRANDS, ...allExistingBrands.filter(Boolean), ...custom])
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  });
  const [brandSearchQuery, setBrandSearchQuery] = useState('');
  const brandScrollRef = useRef<HTMLDivElement>(null);

  // Filtered brands for inline search
  const visibleBrands = React.useMemo(() => {
    if (!brandSearchQuery.trim()) return availableBrands;
    const q = brandSearchQuery.toLowerCase().trim();
    return availableBrands.filter((b) => b.toLowerCase().includes(q));
  }, [availableBrands, brandSearchQuery]);

  const handleSelectBrand = (selectedBrandName: string) => {
    // Toggle: if clicking the currently selected brand, deselect; otherwise select
    if (brand === selectedBrandName) {
      setBrand('');
    } else {
      setBrand(selectedBrandName);
    }
  };

  const handleAddCustomBrand = (newBrandName: string) => {
    const trimmed = newBrandName.trim();
    if (!trimmed) return;
    if (!availableBrands.some((b) => b.toLowerCase() === trimmed.toLowerCase())) {
      setAvailableBrands((prev) =>
        [...prev, trimmed].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      );
    }
    setBrand(trimmed);
    try {
      const stored = getStoredCustomBrands();
      if (!stored.some((b) => b.toLowerCase() === trimmed.toLowerCase())) {
        localStorage.setItem('comparison_custom_brands', JSON.stringify([...stored, trimmed]));
      }
    } catch {
      // ignore
    }
    if (onAddNewBrand) {
      onAddNewBrand(trimmed);
    }
    setBrandSearchQuery('');
  };

  const scrollBrandList = (direction: 'left' | 'right') => {
    if (brandScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      brandScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  
  // Tags State with persistent storage across products (sorted A-Z)
  const [availableTags, setAvailableTags] = useState<string[]>(() => {
    const custom = getStoredCustomTags();
    return Array.from(
      new Set([...DEFAULT_PRESET_TAGS, ...allExistingTags.filter(Boolean), ...custom])
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const tagScrollRef = useRef<HTMLDivElement>(null);

  const visibleTags = React.useMemo(() => {
    if (!tagSearchQuery.trim()) return availableTags;
    const q = tagSearchQuery.toLowerCase().trim();
    return availableTags.filter((t) => t.toLowerCase().includes(q));
  }, [availableTags, tagSearchQuery]);

  const scrollTagList = (direction: 'left' | 'right') => {
    if (tagScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      tagScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Overview State
  const [overview, setOverview] = useState(initialData?.overview || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Pictures State
  const [pictures, setPictures] = useState<Attachment[]>(initialData?.pictures || []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPictures, setIsUploadingPictures] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [uploadingSpecId, setUploadingSpecId] = useState<string | null>(null);

  // Fullscreen Viewer State
  const [fullscreenImages, setFullscreenImages] = useState<Attachment[] | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  // Specifications State
  const [specs, setSpecs] = useState<ProductSpecItem[]>(() => {
    if (Array.isArray(initialData?.specs) && initialData.specs.length > 0) {
      return initialData.specs.map((s, idx) => ({
        id: s.id || `spec_init_${idx}_${Date.now()}`,
        name: s.name,
        details: s.details,
        unit: s.unit || '',
        order: s.order || idx + 1,
        pictures: s.pictures || [],
      }));
    }
    return [
      { id: 'spec_1', name: 'New specification', details: '', unit: '', order: 1, pictures: [] },
    ];
  });

  // Active selected spec for Move Up / Move Down: default to first spec
  const [selectedSpecId, setSelectedSpecId] = useState<string>(specs[0]?.id || '');
  
  // Expanded spec ids for accordion collapse/expand: default open first specification only
  const [expandedSpecIds, setExpandedSpecIds] = useState<string[]>(
    specs[0]?.id ? [specs[0].id] : []
  );

  // Submission / saving state
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavedLocally, setIsSavedLocally] = useState(true);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Delete product modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteProduct = async () => {
    if (!productId || !onDeleteProduct) return;
    setIsDeleting(true);
    try {
      await onDeleteProduct(productId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: any) {
      console.error('Failed to delete product:', err);
      setErrorMessage(err.message || 'Failed to delete product');
    } finally {
      setIsDeleting(false);
    }
  };

  // Prevent background scrolling when mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Update local saved indicator whenever user edits (skip first render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setIsSavedLocally(false);
    const timer = setTimeout(() => {
      setIsSavedLocally(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [name, brand, selectedTags, overview, pictures, specs]);

  // Tag Toggling
  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Add custom tag with persistent storage across sessions/products
  const handleAddCustomTag = (customTag?: string) => {
    const raw = typeof customTag === 'string' ? customTag : tagInput;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!availableTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setAvailableTags((prev) =>
        [...prev, trimmed].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      );
    }
    if (!selectedTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    try {
      const stored = getStoredCustomTags();
      if (!stored.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
        localStorage.setItem('comparison_custom_tags', JSON.stringify([...stored, trimmed]));
      }
    } catch {
      // ignore
    }
    if (onAddNewTag) {
      onAddNewTag(trimmed);
    }
    setTagInput('');
    setTagSearchQuery('');
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomTag();
    }
  };

  // Markdown formatting helper for overview
  const insertFormatting = (prefix: string, suffix = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = overview.substring(start, end);
    const replacement = `${prefix}${selectedText || 'text'}${suffix}`;
    const newText = overview.substring(0, start) + replacement + overview.substring(end);
    setOverview(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 50);
  };

  // Formatting helper for individual specification details (matching IMG_9156.png)
  const insertSpecFormatting = (specId: string, prefix: string, suffix = prefix) => {
    const textarea = document.getElementById(`spec-details-textarea-${specId}`) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const selectedText = currentVal.substring(start, end);
    const replacement = `${prefix}${selectedText || ''}${suffix}`;
    const newText = currentVal.substring(0, start) + replacement + currentVal.substring(end);
    handleUpdateSpecField(specId, 'details', newText);
    setTimeout(() => {
      textarea.focus();
      const cursorTarget = start + prefix.length + (selectedText ? selectedText.length : 0);
      textarea.setSelectionRange(cursorTarget, cursorTarget);
    }, 50);
  };

  // File / Photo upload for product pictures (with automatic direct storage & IndexedDB persistence)
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setIsUploadingPictures(true);
    setUploadProgressText(`Uploading ${fileArray.length} picture${fileArray.length > 1 ? 's' : ''}...`);

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgressText(`Processing ${i + 1}/${fileArray.length}: ${file.name}`);
        const attachment = await createAttachmentFromFile(file);
        setPictures((prev) => [...prev, attachment]);
      }
    } catch (err: any) {
      console.error('Failed to upload product image:', err);
      setErrorMessage(`Failed to add photo: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsUploadingPictures(false);
      setUploadProgressText(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddPictureUrl = (url: string) => {
    if (!url.trim()) return;
    const attachment = createAttachmentFromUrl(url.trim());
    setPictures((prev) => [...prev, attachment]);
  };

  const handleRemovePicture = (pictureId: string) => {
    setPictures((prev) => prev.filter((p) => p.id !== pictureId));
  };

  // File / Photo upload for individual specification pictures
  const handleSpecFileUpload = async (specId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setUploadingSpecId(specId);

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const attachment = await createAttachmentFromFile(file);
        setSpecs((prev) =>
          prev.map((s) =>
            s.id === specId
              ? { ...s, pictures: [...(s.pictures || []), attachment] }
              : s
          )
        );
      }
    } catch (err: any) {
      console.error('Failed to upload specification image:', err);
      setErrorMessage(`Failed to add spec photo: ${err?.message || 'Unknown error'}`);
    } finally {
      setUploadingSpecId(null);
    }
  };

  const handleAddSpecPictureUrl = (specId: string, url: string) => {
    if (!url.trim()) return;
    const attachment = createAttachmentFromUrl(url.trim(), 'Spec_Image.jpg');
    setSpecs((prev) =>
      prev.map((s) =>
        s.id === specId
          ? { ...s, pictures: [...(s.pictures || []), attachment] }
          : s
      )
    );
  };

  // Remove a picture from a specific specification
  const handleRemoveSpecPicture = (specId: string, pictureId: string) => {
    setSpecs((prev) =>
      prev.map((s) =>
        s.id === specId
          ? { ...s, pictures: (s.pictures || []).filter((p) => p.id !== pictureId) }
          : s
      )
    );
  };

  // Specification Accordion Toggle
  const toggleSpecExpanded = (specId: string) => {
    if (expandedSpecIds.includes(specId)) {
      setExpandedSpecIds(expandedSpecIds.filter((id) => id !== specId));
    } else {
      setExpandedSpecIds([...expandedSpecIds, specId]);
    }
  };

  // Specification selection (for Move Up / Move Down)
  const handleSelectSpecRadio = (specId: string) => {
    setSelectedSpecId(specId);
    if (!expandedSpecIds.includes(specId)) {
      setExpandedSpecIds([...expandedSpecIds, specId]);
    }
  };

  // Add Specification
  const handleAddSpecification = () => {
    const newId = `spec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSpec: ProductSpecItem = {
      id: newId,
      name: 'New specification',
      details: '',
      unit: '',
      order: specs.length + 1,
      pictures: [],
    };
    setSpecs([...specs, newSpec]);
    setSelectedSpecId(newId);
    setExpandedSpecIds((prev) => (prev.includes(newId) ? prev : [...prev, newId]));
  };

  // Remove Specification
  const handleRemoveSpec = (specId: string) => {
    const filtered = specs.filter((s) => s.id !== specId);
    const reordered = filtered.map((s, idx) => ({ ...s, order: idx + 1 }));
    setSpecs(reordered);
    if (selectedSpecId === specId) {
      setSelectedSpecId(reordered[0]?.id || '');
    }
  };

  // Update Specification field
  const handleUpdateSpecField = (specId: string, field: 'name' | 'details' | 'unit', val: string) => {
    setSpecs((prev) =>
      prev.map((s) => (s.id === specId ? { ...s, [field]: val } : s))
    );
  };

  // Move Selected Spec UP
  const handleMoveUp = () => {
    if (!selectedSpecId) return;
    const index = specs.findIndex((s) => s.id === selectedSpecId);
    if (index <= 0) return; // already at top
    const newSpecs = [...specs];
    const temp = newSpecs[index - 1];
    newSpecs[index - 1] = newSpecs[index];
    newSpecs[index] = temp;
    // update orders
    setSpecs(newSpecs.map((s, i) => ({ ...s, order: i + 1 })));
  };

  // Move Selected Spec DOWN
  const handleMoveDown = () => {
    if (!selectedSpecId) return;
    const index = specs.findIndex((s) => s.id === selectedSpecId);
    if (index === -1 || index >= specs.length - 1) return; // already at bottom
    const newSpecs = [...specs];
    const temp = newSpecs[index + 1];
    newSpecs[index + 1] = newSpecs[index];
    newSpecs[index] = temp;
    // update orders
    setSpecs(newSpecs.map((s, i) => ({ ...s, order: i + 1 })));
  };

  // Sort A-Z
  const handleSortAZ = () => {
    const sorted = [...specs].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    setSpecs(sorted.map((s, i) => ({ ...s, order: i + 1 })));
  };

  // Sort Z-A
  const handleSortZA = () => {
    const sorted = [...specs].sort((a, b) =>
      b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
    );
    setSpecs(sorted.map((s, i) => ({ ...s, order: i + 1 })));
  };

  // Publish / Save Product
  const handlePublish = async () => {
    if (!name.trim()) {
      setErrorMessage('Please enter a product name before publishing.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrorMessage(null);
    setIsPublishing(true);

    try {
      // Persist all selected tags into local storage for all future products
      try {
        const stored = getStoredCustomTags();
        let changed = false;
        selectedTags.forEach((t) => {
          if (!stored.includes(t)) {
            stored.push(t);
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem('comparison_custom_tags', JSON.stringify(stored));
        }
      } catch {
        // ignore
      }

      await onSaveProduct({
        name: name.trim(),
        brand: brand.trim() || 'Generic',
        tags: selectedTags,
        overview: overview.trim(),
        pictures,
        specs: specs.map((s, idx) => ({
          id: s.id,
          name: s.name.trim() || `Spec ${idx + 1}`,
          details: s.details.trim(),
          unit: s.unit?.trim() || '',
          order: s.order || idx + 1,
          pictures: s.pictures || [],
        })),
      });

      setPublishSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Publish error:', err);
      setErrorMessage(err.message || 'Failed to save product. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      id="product-workspace-screen"
      className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-y-auto overflow-x-hidden w-full h-full max-w-full select-none sm:select-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* 1. TOP MOBILE/FULLSCREEN HEADER WITH BACK BUTTON & INSTANT ACTIONS */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-2xs">
        {/* Left: Back Button & Mode */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            id="workspace-back-btn"
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 active:bg-slate-200 font-semibold text-xs transition-colors shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
              {isEditMode ? (name ? `Edit: ${name}` : 'Edit Product') : 'Add New Product'}
            </h1>
            {isEditMode && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">
                <Edit3 className="w-3 h-3 text-amber-700" />
                <span>Editing</span>
              </span>
            )}
          </div>
        </div>

        {/* Center: Navigation Pills (Tablet/Desktop) */}
        <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold text-slate-600">
          <button
            id="workspace-nav-compare-btn"
            onClick={() => {
              if (onNavigateToCompare) onNavigateToCompare();
              else onClose();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:text-slate-900 transition-colors cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>

          <button
            id="workspace-nav-manage-btn"
            onClick={() => {
              if (onNavigateToManage) onNavigateToManage();
              else onClose();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:text-slate-900 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Catalog</span>
          </button>

          <div
            id="workspace-nav-add-btn"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-slate-900 shadow-2xs font-bold"
          >
            {isEditMode ? (
              <>
                <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                <span>Edit product</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Add product</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Quick Actions (Top Save & Delete & Close) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditMode && onDeleteProduct && (
            <button
              id="workspace-header-delete-btn"
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Delete this product"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            id="workspace-header-save-btn"
            type="button"
            disabled={isPublishing || isDeleting}
            onClick={handlePublish}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-black active:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Send className={`w-3.5 h-3.5 ${isPublishing ? 'animate-pulse' : ''}`} />
            <span>{isPublishing ? 'Saving...' : isEditMode ? 'Save' : 'Publish'}</span>
          </button>

          <button
            id="workspace-close-btn"
            onClick={onClose}
            aria-label="Close workspace"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ERROR / SUCCESS ALERTS */}
      {errorMessage && (
        <div className="max-w-xl mx-auto w-full px-4 pt-3">
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 font-bold ml-2">
              ✕
            </button>
          </div>
        </div>
      )}

      {publishSuccess && (
        <div className="max-w-xl mx-auto w-full px-4 pt-3">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Product saved and published successfully! Returning...</span>
          </div>
        </div>
      )}

      {/* 2. MAIN SCROLLABLE FORM BODY (MOBILE FIRST) */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 pb-28 space-y-6">
        {/* HEADER TITLE SECTION (Screenshot 1) */}
        <div className="pt-2">
          <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
            PRODUCT WORKSPACE
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-1">
            Create a product customers can compare
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
            Use tags for discovery and add only the specifications that make sense for this product.
          </p>
        </div>

        {/* CARD 1: PRODUCT IDENTITY (Screenshot 1 & 2) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
          {/* Card Title */}
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm border-b border-slate-100 pb-3">
            <Box className="w-4 h-4 text-slate-700" />
            <span>Product identity</span>
          </div>

          {/* Product Name Input */}
          <div className="space-y-1.5">
            <label htmlFor="product-name-input" className="block text-xs font-semibold text-slate-700">
              Product name
            </label>
            <input
              id="product-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sony Bravia 8 II"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
            />
          </div>

          {/* Brand Selection with Inline Search & Horizontal Scroll */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="product-brand-input" className="block text-xs font-semibold text-slate-700">
                Brand
              </label>
              {brand && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400">Selected:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-slate-900 text-white text-[11px]">
                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                    <span>{brand}</span>
                    <button
                      type="button"
                      onClick={() => setBrand('')}
                      className="hover:text-rose-300 ml-0.5 text-xs font-bold leading-none cursor-pointer"
                      title="Clear brand"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              )}
            </div>

            {/* Custom Brand / Manual Direct Input */}
            <div className="flex items-center gap-2">
              <input
                id="product-brand-input"
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomBrand(brand);
                  }
                }}
                placeholder="Type brand name or choose below..."
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
              />
              {brand.trim() && !availableBrands.some((b) => b.toLowerCase() === brand.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => handleAddCustomBrand(brand)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-semibold text-xs rounded-xl transition-colors shrink-0 cursor-pointer"
                  title="Save brand to quick list"
                >
                  Save Brand
                </button>
              )}
            </div>

            {/* Inline Search & Scrollable Brand Options Bar */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 space-y-2">
              <div className="flex items-center gap-2">
                {/* Inline Search Input */}
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={brandSearchQuery}
                    onChange={(e) => setBrandSearchQuery(e.target.value)}
                    placeholder="Search brands..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                  />
                  {brandSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setBrandSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Scroll controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => scrollBrandList('left')}
                    aria-label="Scroll brands left"
                    className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 transition-colors shadow-2xs cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollBrandList('right')}
                    aria-label="Scroll brands right"
                    className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 transition-colors shadow-2xs cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Brand Pills Bar */}
              <div
                ref={brandScrollRef}
                onWheel={(e) => {
                  if (e.deltaY !== 0 && brandScrollRef.current) {
                    e.preventDefault();
                    brandScrollRef.current.scrollLeft += e.deltaY;
                  }
                }}
                className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 scroll-smooth"
              >
                {visibleBrands.length > 0 ? (
                  visibleBrands.map((b) => {
                    const isSelected = brand.trim().toLowerCase() === b.toLowerCase();
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleSelectBrand(b)}
                        className={`px-3 py-1 rounded-lg text-xs transition-all whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white font-bold shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 font-medium'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                        <span>{b}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-2 py-0.5 text-xs text-slate-500">
                    <span>No brand matching "{brandSearchQuery}"</span>
                    <button
                      type="button"
                      onClick={() => handleAddCustomBrand(brandSearchQuery)}
                      className="px-2 py-0.5 bg-slate-900 text-white rounded font-medium hover:bg-black transition-colors"
                    >
                      + Add "{brandSearchQuery}"
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Tags Section (with Multi-Select & Brand-style Search/Scroll) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="product-tag-input" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                <span>Product tags</span>
              </label>
              {selectedTags.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400">Selected ({selectedTags.length}):</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Custom Tag Direct Input */}
            <div className="flex items-center gap-2">
              <input
                id="product-tag-input"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                placeholder="Type tag name or choose below..."
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
              />
              {tagInput.trim() && (
                <button
                  id="add-tag-btn"
                  type="button"
                  onClick={() => handleAddCustomTag()}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-semibold text-xs rounded-xl transition-colors shrink-0 cursor-pointer"
                  title="Add tag"
                >
                  Add Tag
                </button>
              )}
            </div>

            {/* Selected Tags Display Chips (if any selected) */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 text-white shadow-2xs"
                  >
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleTag(tag)}
                      className="hover:text-rose-300 ml-1 text-xs font-bold leading-none cursor-pointer"
                      title={`Remove tag ${tag}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Inline Search & Scrollable Tag Options Bar (Matching Brand) */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 space-y-2">
              <div className="flex items-center gap-2">
                {/* Inline Search Input */}
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    placeholder="Search tags..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                  />
                  {tagSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTagSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Scroll controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => scrollTagList('left')}
                    aria-label="Scroll tags left"
                    className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 transition-colors shadow-2xs cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTagList('right')}
                    aria-label="Scroll tags right"
                    className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 transition-colors shadow-2xs cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Tag Pills Bar (Horizontal Single-Line, Multi-Select) */}
              <div
                ref={tagScrollRef}
                onWheel={(e) => {
                  if (e.deltaY !== 0 && tagScrollRef.current) {
                    e.preventDefault();
                    tagScrollRef.current.scrollLeft += e.deltaY;
                  }
                }}
                className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 scroll-smooth"
              >
                {visibleTags.length > 0 ? (
                  visibleTags.map((t) => {
                    const isSelected = selectedTags.includes(t);
                    return (
                      <button
                        key={t}
                        id={`tag-pill-${t}`}
                        type="button"
                        onClick={() => handleToggleTag(t)}
                        className={`px-3 py-1 rounded-lg text-xs transition-all whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white font-bold shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 font-medium'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                        <span>{t}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-2 py-0.5 text-xs text-slate-500">
                    <span>No tag matching "{tagSearchQuery}"</span>
                    <button
                      type="button"
                      onClick={() => handleAddCustomTag(tagSearchQuery)}
                      className="px-2 py-0.5 bg-slate-900 text-white rounded font-medium hover:bg-black transition-colors cursor-pointer"
                    >
                      + Add "{tagSearchQuery}"
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Overview with Rich Formatting Toolbar (Screenshot 2) */}
          <div className="space-y-1.5 pt-2">
            <label htmlFor="product-overview-textarea" className="block text-xs font-semibold text-slate-700">
              Product overview
            </label>
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
              {/* Toolbar */}
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center gap-3 text-slate-700 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => insertFormatting('**', '**')}
                  title="Bold"
                  className="p-1 hover:text-black hover:bg-slate-200 rounded"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('*', '*')}
                  title="Italic"
                  className="p-1 hover:text-black hover:bg-slate-200 rounded"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('<u>', '</u>')}
                  title="Underline"
                  className="p-1 hover:text-black hover:bg-slate-200 rounded"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('~~', '~~')}
                  title="Strikethrough"
                  className="p-1 hover:text-black hover:bg-slate-200 rounded"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <div className="h-3 w-px bg-slate-300" />
                <button
                  type="button"
                  onClick={() => insertFormatting('[', '](https://example.com)')}
                  className="flex items-center gap-1 hover:text-black hover:bg-slate-200 px-1 py-0.5 rounded text-[11px]"
                >
                  <LinkIcon className="w-3 h-3" />
                  <span>Add link</span>
                </button>
              </div>

              {/* Textarea */}
              <textarea
                id="product-overview-textarea"
                ref={textareaRef}
                rows={4}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                placeholder="Summarize what the product is, who it is for, and what makes it notable..."
                className="w-full p-3.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none resize-y leading-relaxed"
              />
            </div>
          </div>

          {/* Product Pictures Upload (Screenshot 2) */}
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-semibold text-slate-700">
              Product pictures
            </label>

            {/* Hidden native input supporting iOS library & camera */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />

            {/* Upload Dashed Container */}
            <div
              onClick={() => !isUploadingPictures && fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!isUploadingPictures) {
                  handleFileUpload(e.dataTransfer.files);
                }
              }}
              className="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
            >
              {isUploadingPictures ? (
                <div className="flex flex-col items-center py-2">
                  <Loader2 className="w-6 h-6 text-slate-800 animate-spin mb-2" />
                  <span className="text-xs font-semibold text-slate-800">
                    {uploadProgressText || 'Uploading pictures...'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Optimizing file & caching locally on device...
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-slate-400 mb-2" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold shadow-2xs hover:bg-slate-50 active:bg-slate-100"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-slate-600" />
                    <span>Choose pictures</span>
                  </button>
                  <span className="text-[11px] text-slate-400 mt-2">
                    Tap to select from photo library or drop files here
                  </span>
                </>
              )}
            </div>

            {/* Uploaded pictures gallery preview */}
            {pictures.length > 0 && (
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                {pictures.map((pic, idx) => {
                  const resolvedSrc = getAttachmentDisplayUrl(pic, name || 'Product', brand);
                  return (
                    <div
                      key={pic.id}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100"
                    >
                      <img
                        src={resolvedSrc}
                        alt={pic.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = createProductPlaceholderSvg(name || 'Product', brand);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFullscreenImages(pictures);
                          setFullscreenIndex(idx);
                        }}
                        className="absolute top-1 left-1 p-1 bg-black/60 hover:bg-black text-white rounded-md transition-colors"
                        title="View full screen"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePicture(pic.id)}
                        className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black text-white rounded-full transition-colors"
                        title="Remove picture"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1.5 py-0.5 truncate">
                        {pic.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* CARD 2: FLEXIBLE DATA - SPECIFICATIONS (Screenshots 2 & 3) */}
        <div className="space-y-4 pt-2">
          {/* Section Heading */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
              FLEXIBLE DATA
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
              Specifications
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Add weight, battery life, material, price, functions, or any specification this product needs.
            </p>
          </div>

          {/* Specifications Control Toolbar (Screenshot 2) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="spec-move-up-btn"
              type="button"
              onClick={handleMoveUp}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Move up</span>
            </button>

            <button
              id="spec-move-down-btn"
              type="button"
              onClick={handleMoveDown}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Move down</span>
            </button>

            <button
              id="spec-sort-az-btn"
              type="button"
              onClick={handleSortAZ}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
            >
              A-Z
            </button>

            <button
              id="spec-sort-za-btn"
              type="button"
              onClick={handleSortZA}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
            >
              Z-A
            </button>
          </div>

          {/* Add Specification Button */}
          <div>
            <button
              id="add-spec-item-btn"
              type="button"
              onClick={handleAddSpecification}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-900 rounded-xl text-xs font-bold shadow-2xs transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add specification</span>
            </button>
          </div>

          {/* Specifications Accordion List (Screenshot 3) */}
          <div className="space-y-2.5">
            {specs.map((spec, index) => {
              const isSelected = selectedSpecId === spec.id;
              const isExpanded = expandedSpecIds.includes(spec.id);

              return (
                <div
                  key={spec.id}
                  id={`spec-item-card-${index}`}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                    isSelected
                      ? 'border-slate-300 shadow-xs'
                      : 'border-slate-200 shadow-2xs'
                  }`}
                >
                  {/* Item Header Row */}
                  <div
                    onClick={() => toggleSpecExpanded(spec.id)}
                    className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none bg-white hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {/* Selection Radio Circle (for Move Up / Move Down) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSpecRadio(spec.id);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 shrink-0"
                        title="Select for Move Up/Down"
                      >
                        {isSelected ? (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-800 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-slate-900" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-300 hover:border-slate-400" />
                        )}
                      </button>

                      {/* Expand/Collapse Chevron */}
                      <div className="text-slate-400 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      {/* Order Number Badge */}
                      <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </div>

                      {/* Specification Name Header */}
                      <div className="font-semibold text-slate-900 text-sm truncate">
                        {spec.name || 'New specification'}
                      </div>
                    </div>

                    {/* Trash / Delete Icon */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSpec(spec.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                      title="Delete specification"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Item Expanded Content (Screenshot 3 & IMG_9156.png) */}
                  {isExpanded && (
                    <div className="p-4 pt-2 border-t border-slate-100 bg-slate-50/40 space-y-4">
                      {/* Specification Name & Unit Input */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Specification name
                          </label>
                          <input
                            type="text"
                            value={spec.name}
                            onChange={(e) =>
                              handleUpdateSpecField(spec.id, 'name', e.target.value)
                            }
                            placeholder="e.g. Weight, Screen size, Warranty, Battery..."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-600 flex items-center justify-between">
                            <span>Unit (optional)</span>
                            <span className="text-[10px] text-slate-400 font-normal">e.g. g, inch, cm</span>
                          </label>
                          <input
                            type="text"
                            value={spec.unit || ''}
                            onChange={(e) =>
                              handleUpdateSpecField(spec.id, 'unit', e.target.value)
                            }
                            placeholder="g, inch, cm, year, mAh..."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-all font-mono"
                          />
                        </div>
                      </div>

                      {/* Quick Unit Presets */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-400 font-medium mr-1">Quick unit:</span>
                        {['g', 'kg', 'inch', 'cm', 'mm', 'year', 'month', 'mAh', 'Hz', '$', 'GB'].map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => handleUpdateSpecField(spec.id, 'unit', u)}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors ${
                              spec.unit?.toLowerCase() === u.toLowerCase()
                                ? 'bg-slate-900 text-white font-semibold'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>

                      {/* Specification Details with Toolbar (IMG_9156.png) */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Specification details
                        </label>
                        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
                          {/* Rich Toolbar: B, I, U, S, |, Add link */}
                          <div className="border-b border-slate-200 px-3 py-2 flex items-center gap-4 text-slate-800 text-sm bg-slate-50/70">
                            <button
                              type="button"
                              onClick={() => insertSpecFormatting(spec.id, '<b>', '</b>')}
                              title="Bold"
                              className="font-bold hover:text-indigo-600 px-1 py-0.5 rounded transition-colors"
                            >
                              B
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSpecFormatting(spec.id, '<i>', '</i>')}
                              title="Italic"
                              className="italic font-serif hover:text-indigo-600 px-1 py-0.5 rounded transition-colors"
                            >
                              I
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSpecFormatting(spec.id, '<u>', '</u>')}
                              title="Underline"
                              className="underline hover:text-indigo-600 px-1 py-0.5 rounded transition-colors font-medium"
                            >
                              U
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSpecFormatting(spec.id, '<s>', '</s>')}
                              title="Strikethrough"
                              className="line-through hover:text-indigo-600 px-1 py-0.5 rounded transition-colors font-medium"
                            >
                              S
                            </button>
                            <div className="h-4 w-px bg-slate-200" />
                            <button
                              type="button"
                              onClick={() => insertSpecFormatting(spec.id, '<a href="', '">Link text</a>')}
                              className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-indigo-600 font-medium px-1 py-0.5 rounded transition-colors"
                            >
                              <LinkIcon className="w-3.5 h-3.5" />
                              <span>Add link</span>
                            </button>
                          </div>
                          <textarea
                            id={`spec-details-textarea-${spec.id}`}
                            rows={3}
                            value={spec.details}
                            onChange={(e) =>
                              handleUpdateSpecField(spec.id, 'details', e.target.value)
                            }
                            placeholder="Battery life, material, details or <u>Ddfkk</u>..."
                            className="w-full p-3.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none resize-y leading-relaxed font-sans"
                          />
                        </div>
                      </div>

                      {/* Specification Pictures Upload (IMG_9156.png) */}
                      <div className="space-y-2 pt-1">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Specification pictures
                        </label>

                        {/* Hidden file input for this spec */}
                        <input
                          id={`spec-file-input-${spec.id}`}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handleSpecFileUpload(spec.id, e.target.files)}
                        />

                        {/* Dashed upload container */}
                        <div
                          onClick={() => uploadingSpecId !== spec.id && document.getElementById(`spec-file-input-${spec.id}`)?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (uploadingSpecId !== spec.id) {
                              handleSpecFileUpload(spec.id, e.dataTransfer.files);
                            }
                          }}
                          className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-white hover:bg-slate-50/50 cursor-pointer transition-colors"
                        >
                          {uploadingSpecId === spec.id ? (
                            <div className="flex flex-col items-center py-1">
                              <Loader2 className="w-5 h-5 text-slate-800 animate-spin mb-1.5" />
                              <span className="text-xs font-semibold text-slate-800">Processing spec photo...</span>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-5 h-5 text-slate-400 mb-2.5" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  document.getElementById(`spec-file-input-${spec.id}`)?.click();
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-800 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                              >
                                <ImageIcon className="w-4 h-4 text-slate-600" />
                                <span>Choose pictures</span>
                              </button>
                            </>
                          )}
                        </div>

                        {/* Preview thumbnails for this spec's pictures */}
                        {spec.pictures && spec.pictures.length > 0 && (
                          <div className="grid grid-cols-3 gap-2.5 pt-1">
                            {spec.pictures.map((pic, idx) => {
                              const specResolvedSrc = getAttachmentDisplayUrl(pic, spec.name, name);
                              return (
                                <div
                                  key={pic.id}
                                  className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100 shadow-2xs"
                                >
                                  <img
                                    src={specResolvedSrc}
                                    alt={pic.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(pic.name, spec.name);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFullscreenImages(spec.pictures || []);
                                      setFullscreenIndex(idx);
                                    }}
                                    className="absolute top-1 left-1 p-1 bg-black/60 hover:bg-black text-white rounded-md transition-colors"
                                    title="View full screen"
                                  >
                                    <Maximize2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSpecPicture(spec.id, pic.id)}
                                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black text-white rounded-full transition-colors"
                                    title="Remove picture"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1.5 py-0.5 truncate">
                                    {pic.name}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Explicit Delete Specification Button */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                          <span className="text-[11px] text-slate-400">Specification #{index + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSpec(spec.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer font-medium"
                            title="Delete this specification"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete specification</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* 3. STICKY BOTTOM BAR (Screenshots 1, 2, 3) */}
      <footer className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 shadow-lg">
        <div className="max-w-xl mx-auto w-full space-y-2.5">
          {/* Product name & sync status row */}
          <div className="flex items-center justify-between text-xs">
            <div className="font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs">
              {name.trim() || 'Untitled product'}
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
              <span>
                {selectedTags.length} tags / {specs.length} specifications
              </span>
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <Check className="w-3 h-3" />
                <span className="hidden xs:inline">
                  {isSavedLocally ? 'Saved on this device' : 'Saving...'}
                </span>
              </span>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-2">
            {isEditMode && onDeleteProduct && (
              <button
                id="workspace-footer-delete-btn"
                type="button"
                disabled={isPublishing || isDeleting}
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-3.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-semibold rounded-xl border border-rose-200 text-xs transition-colors cursor-pointer shrink-0"
                title="Delete this product"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span className="hidden xs:inline">Delete product</span>
              </button>
            )}

            {/* Full-width Publish / Save button */}
            <button
              id="publish-product-btn"
              type="button"
              disabled={isPublishing || isDeleting}
              onClick={handlePublish}
              className="flex-1 bg-slate-900 hover:bg-black active:scale-[0.99] disabled:opacity-50 text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Send className={`w-4 h-4 ${isPublishing ? 'animate-pulse' : ''}`} />
              <span>
                {isPublishing
                  ? isEditMode
                    ? 'Saving changes...'
                    : 'Publishing product...'
                  : isEditMode
                  ? 'Save changes'
                  : 'Publish product'}
              </span>
            </button>
          </div>
        </div>
      </footer>

      {/* Delete Product Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          id="delete-product-confirm-backdrop"
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowDeleteConfirm(false)}
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
                <span className="font-semibold text-slate-900">"{name || 'this product'}"</span>?
                This will permanently delete the product and all of its specifications.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-product-btn"
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteProduct}
                className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
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
