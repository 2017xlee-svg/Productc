import React, { useState, useEffect, useRef } from 'react';
import { X, Layers, Save, Trash2, Upload, Image as ImageIcon, Loader2, ArrowLeft } from 'lucide-react';
import { Specification, Attachment } from '../types';
import { createAttachmentFromFile, createAttachmentFromUrl } from '../utils/imageCompressor';
import { getAttachmentDisplayUrl, createSpecPlaceholderSvg } from '../utils/imageFallback';

interface EditSpecModalProps {
  specification: Specification | null;
  onClose: () => void;
  onSubmit: (
    specId: string,
    updates: {
      specName: string;
      details: string;
      unit?: string;
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
    <div
      id="edit-spec-modal-screen"
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
              Edit Specification
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
              {specification.productTitle
                ? `Product: ${specification.productTitle}`
                : `ID: ${specification.id}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="edit-spec-save-top-btn"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Saving...' : 'Save'}</span>
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

          {/* Details */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Specification Value / Details *
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800 focus:bg-white focus:border-indigo-500 outline-none leading-relaxed resize-y"
              required
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

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete?'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-xl text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Spec</span>
              </button>
            )}

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
                <Save className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
