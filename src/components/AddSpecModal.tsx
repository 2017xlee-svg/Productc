import React, { useState, useRef } from 'react';
import { X, Layers, Plus, Check, Upload, Image as ImageIcon, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { Product, Attachment } from '../types';
import { createAttachmentFromFile, createAttachmentFromUrl } from '../utils/imageCompressor';
import { getAttachmentDisplayUrl, createSpecPlaceholderSvg } from '../utils/imageFallback';

interface AddSpecModalProps {
  product: Product | null;
  allProducts: Product[];
  onClose: () => void;
  onSubmit: (specData: {
    productId: string;
    specName: string;
    details: string;
    unit?: string;
    order: number;
    pictures: Attachment[];
  }) => Promise<void>;
}

const SPEC_SUGGESTIONS = [
  'Display / Screen',
  'Processor / Chipset',
  'RAM & Storage',
  'Battery & Charging',
  'Main Camera',
  'Weight',
  'Dimensions',
  'Warranty',
  'Operating System',
  'Water Resistance / IP Rating',
  'Connectivity & Ports',
  'MSRP Price',
];

const UNIT_PRESETS = ['g', 'kg', 'inch', 'cm', 'mm', 'year', 'month', 'mAh', 'Hz', '$', 'GB'];

export const AddSpecModal: React.FC<AddSpecModalProps> = ({
  product,
  allProducts,
  onClose,
  onSubmit,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    product ? product.id : allProducts[0]?.id || ''
  );
  const [specName, setSpecName] = useState('');
  const [unit, setUnit] = useState('');
  const [details, setDetails] = useState('');
  const [order, setOrder] = useState<number>(1);
  const [pictures, setPictures] = useState<Attachment[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setIsUploading(true);
    try {
      for (const file of fileArray) {
        const att = await createAttachmentFromFile(file);
        setPictures((prev) => [...prev, att]);
      }
    } catch (err) {
      console.error('Failed to upload spec image:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddUrl = () => {
    if (!imageUrl.trim()) return;
    const att = createAttachmentFromUrl(imageUrl.trim(), 'Spec_Image.jpg');
    setPictures((prev) => [...prev, att]);
    setImageUrl('');
  };

  const handleSubmit = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault();
    if (!specName.trim()) {
      setError('Specification name is required.');
      return;
    }
    if (!selectedProductId) {
      setError('Please select a product.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      let finalPictures = [...pictures];
      if (imageUrl.trim()) {
        finalPictures.push(createAttachmentFromUrl(imageUrl.trim(), 'Spec_Image.jpg'));
      }

      await onSubmit({
        productId: selectedProductId,
        specName: specName.trim(),
        details: details.trim(),
        unit: unit.trim(),
        order: Number(order) || 1,
        pictures: finalPictures,
      });

      if (addAnother) {
        setSpecName('');
        setUnit('');
        setDetails('');
        setImageUrl('');
        setPictures([]);
        setOrder((prev) => prev + 1);
        setSuccessNotice(true);
        setTimeout(() => setSuccessNotice(false), 2500);
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add specification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="add-spec-modal-screen"
      className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden w-full h-full max-w-full"
    >
      {/* 1. Fullscreen Native App Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors text-xs font-semibold cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back</span>
          </button>
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
              Add Specification
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
              Attach technical attribute to product comparison sheet
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={isSubmitting}
            className="hidden sm:inline-flex px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-indigo-200 disabled:opacity-50 cursor-pointer"
          >
            Save & Add Another
          </button>
          <button
            id="add-spec-submit-top-btn"
            type="button"
            onClick={(e) => handleSubmit(e, false)}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Adding...' : 'Add Spec'}</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={(e) => handleSubmit(e, false)} className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>Specification added! You can add another below.</span>
            </div>
          )}

          {/* Product target */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Product *
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
              required
            >
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.brand})
                </option>
              ))}
            </select>
          </div>

          {/* Spec Name & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Specification Name *
              </label>
              <input
                type="text"
                value={specName}
                onChange={(e) => setSpecName(e.target.value)}
                placeholder="e.g. Weight, Battery Life, Screen Size..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit (optional)
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. g, inch, cm, year"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none font-mono"
              />
            </div>
          </div>

          {/* Quick chips for Spec Names */}
          <div>
            <div className="flex flex-wrap gap-1.5">
              {SPEC_SUGGESTIONS.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => setSpecName(suggestion)}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors border border-slate-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Quick unit chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Quick unit:</span>
            {UNIT_PRESETS.map((u) => (
              <button
                type="button"
                key={u}
                onClick={() => setUnit(u)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md transition-colors ${
                  unit.toLowerCase() === u.toLowerCase()
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          {/* Details / Value */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Specification Value / Details *
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g. 7.6-inch Dynamic AMOLED 2X, 120Hz refresh rate, HDR10+ certified"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none leading-relaxed resize-y"
              required
            />
          </div>

          {/* Row Order */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Display Order #
            </label>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(parseInt(e.target.value) || 1)}
              min={1}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
            />
          </div>

          {/* Specification Picture Attachment (Upload or URL) */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-slate-700">
              Specification Picture (Optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 rounded-lg text-xs font-semibold transition-colors shrink-0"
              >
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 text-slate-800 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                )}
                <span>{isUploading ? 'Uploading...' : 'Upload photo'}</span>
              </button>
              <div className="flex-1 flex items-center gap-1.5">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Or paste image URL..."
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none"
                />
                {imageUrl.trim() && (
                  <button
                    type="button"
                    onClick={handleAddUrl}
                    className="px-2.5 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
                  >
                    Add
                  </button>
                )}
              </div>
            </div>

            {/* Pictures preview */}
            {pictures.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {pictures.map((pic) => (
                  <div key={pic.id} className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group">
                    <img
                      src={getAttachmentDisplayUrl(pic, specName)}
                      alt="Spec"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(pic.name || 'Spec', specName);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setPictures((prev) => prev.filter((p) => p.id !== pic.id))}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 hover:bg-black text-white rounded-full transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={isSubmitting}
              className="px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-indigo-200 disabled:opacity-50"
            >
              Save & Add Another
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Adding...' : 'Add Spec'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
