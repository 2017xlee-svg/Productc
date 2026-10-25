import React, { useState, useEffect, useRef } from 'react';
import { Layers, Save, Trash2, Upload, Loader2, ArrowLeft } from 'lucide-react';
import { Specification, Attachment } from '../types';
import { createAttachmentFromFile, createAttachmentFromUrl } from '../utils/imageCompressor';
import { getAttachmentDisplayUrl, createSpecPlaceholderSvg } from '../utils/imageFallback';
import { HtmlWysiwygEditor } from './HtmlWysiwygEditor';

interface EditSpecModalProps {
  specification: Specification | null;
  onClose: () => void;
  onSubmit: (
    specId: string,
    updates: {
      specName: string;
      details: string;
      unit?: string;
      isNumeric?: boolean;
      order: number;
      pictures: Attachment[];
    }
  ) => Promise<void>;
  onDelete: (specId: string) => Promise<void>;
}

export const EditSpecModal: React.FC<EditSpecModalProps> = ({
  specification,
  onClose,
  onSubmit,
  onDelete,
}) => {
  if (!specification) return null;

  const [specName, setSpecName] = useState(specification.specName);
  const [unit, setUnit] = useState(specification.unit || '');
  const [isNumeric, setIsNumeric] = useState<boolean>(specification.isNumeric !== false);
  const [details, setDetails] = useState(specification.details);
  const [order, setOrder] = useState<number>(specification.order);
  const [pictures, setPictures] = useState<Attachment[]>(specification.pictures || []);
  const [imageUrl, setImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (specification) {
      setSpecName(specification.specName);
      setUnit(specification.unit || '');
      setIsNumeric(specification.isNumeric !== false);
      setDetails(specification.details);
      setOrder(specification.order);
      setPictures(specification.pictures || []);
      setImageUrl('');
    }
  }, [specification]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specName.trim()) {
      setError('Specification name is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      let finalPictures = [...pictures];
      if (imageUrl.trim()) {
        finalPictures.push(createAttachmentFromUrl(imageUrl.trim(), 'Spec_Image.jpg'));
      }

      await onSubmit(specification.id, {
        specName: specName.trim(),
        details: details.trim(),
        unit: unit.trim(),
        isNumeric,
        order: Number(order) || 1,
        pictures: finalPictures,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update specification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(specification.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete specification.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden">
      {/* Top Mobile/Desktop Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back</span>
          </button>
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
              Edit Specification
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
              {specification.productTitle} &bull; {specification.specName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isSubmitting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              confirmDelete
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'text-rose-600 hover:bg-rose-50 border border-rose-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{confirmDelete ? 'Confirm Delete' : 'Delete'}</span>
          </button>
          <button
            id="edit-spec-save-top-btn"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          {/* Product target info banner */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-700">Product: </span>
              <span className="font-bold text-slate-900">{specification.productTitle}</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">ID: {specification.id}</span>
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
                placeholder="e.g. g, inch, cm"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none font-mono"
              />
            </div>
          </div>

          {/* Quick unit chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Quick unit:</span>
            {['g', 'kg', 'inch', 'cm', 'mm', 'year', 'month', 'mAh', 'Hz', '$', 'GB'].map((u) => (
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

          {/* Is Number / Metric Comparison Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                isNumeric ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
              }`}>
                {isNumeric ? '#' : 'Aa'}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>{isNumeric ? 'Numeric Comparison' : 'Text / Descriptive Mode'}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full ${
                    isNumeric ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {isNumeric ? 'Number ON' : 'Number OFF'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {isNumeric
                    ? 'Enables numerical progress bar and Best value comparison'
                    : 'Preserves multi-line text & formatting without false number comparison'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsNumeric(!isNumeric)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                isNumeric ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isNumeric ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Details - Inline WYSIWYG HTML Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Specification Value / Details *
              </label>
              <span className="text-[10px] text-slate-400">WYSIWYG: Bold, underline, list & links</span>
            </div>
            <HtmlWysiwygEditor
              value={details}
              onChange={setDetails}
              placeholder="e.g. 7.6-inch Dynamic AMOLED 2X, or multi-line details with bullet points"
              minHeight="120px"
            />
          </div>

          {/* Display Order */}
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
                    className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
                  >
                    Add
                  </button>
                )}
              </div>
            </div>

            {/* List of current pictures */}
            {pictures.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                {pictures.map((pic, idx) => (
                  <div
                    key={pic.id || idx}
                    className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group flex flex-col"
                  >
                    <div className="aspect-video relative bg-slate-100 flex items-center justify-center overflow-hidden">
                      <img
                        src={getAttachmentDisplayUrl(pic, specification.specName, specification.productTitle)}
                        alt={pic.name || 'Spec picture'}
                        className="w-full h-full object-contain p-1"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(
                            pic.name,
                            specification.specName
                          );
                        }}
                      />
                    </div>
                    <div className="p-1.5 bg-white flex items-center justify-between text-[11px] text-slate-600">
                      <span className="truncate max-w-[80%] font-mono">
                        {pic.name || 'Attached photo'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPictures((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-500 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Bottom Sticky Action Footer */}
      <footer className="sticky bottom-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          id="edit-spec-save-bottom-btn"
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </footer>
    </div>
  );
};
