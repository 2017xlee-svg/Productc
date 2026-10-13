import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Download,
  Move,
  Maximize,
  Minimize,
} from 'lucide-react';
import { Attachment } from '../types';
import { getCachedObjectUrl, registerActiveObjectUrl } from '../utils/imageCompressor';
import { getMediaBlob } from '../lib/indexedDbMedia';
import {
  isExpiredOrDeadUrl,
  getAttachmentDisplayUrl,
  createSpecPlaceholderSvg,
} from '../utils/imageFallback';

interface FullscreenImageViewerProps {
  images: Attachment[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const FullscreenImageViewer: React.FC<FullscreenImageViewerProps> = ({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const safeImages = Array.isArray(images) ? images : [];
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0);
  const [asyncBlobUrl, setAsyncBlobUrl] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string>('');

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchInitialScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);

  const currentImg = safeImages[currentIndex];

  // Rehydrate blob from IndexedDB if not yet in memory cache
  useEffect(() => {
    let isMounted = true;
    setAsyncBlobUrl(null);
    if (currentImg?.id && !getCachedObjectUrl(currentImg.id) && !currentImg.url?.startsWith('data:')) {
      getMediaBlob(currentImg.id)
        .then((blob) => {
          if (blob && isMounted) {
            const objUrl = URL.createObjectURL(blob);
            registerActiveObjectUrl(currentImg.id, objUrl);
            setAsyncBlobUrl(objUrl);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [currentImg?.id]);

  // Robust URL resolver prioritizing highest fidelity real image
  const resolvedDisplayUrl = useMemo(() => {
    if (asyncBlobUrl) return asyncBlobUrl;
    if (currentImg?.id) {
      const cached = getCachedObjectUrl(currentImg.id);
      if (cached) return cached;
    }
    // Direct Data URL or Blob URL
    if (currentImg?.dataUrl && (currentImg.dataUrl.startsWith('data:') || currentImg.dataUrl.startsWith('blob:'))) {
      return currentImg.dataUrl;
    }
    if (currentImg?.url && (currentImg.url.startsWith('blob:') || currentImg.url.startsWith('data:'))) {
      return currentImg.url;
    }
    if (currentImg?.lgUrl && (currentImg.lgUrl.startsWith('blob:') || currentImg.lgUrl.startsWith('data:'))) {
      return currentImg.lgUrl;
    }
    // Google Drive direct link
    const gDriveMatch = (currentImg?.url || '').match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (gDriveMatch && gDriveMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${gDriveMatch[1]}`;
    }
    // Any valid URL (https, http, relative) that is not expired
    const candidate = currentImg?.url || currentImg?.lgUrl || currentImg?.smUrl;
    if (candidate && typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (
        (trimmed.startsWith('https://') ||
          trimmed.startsWith('http://') ||
          trimmed.startsWith('blob:') ||
          trimmed.startsWith('data:') ||
          trimmed.startsWith('/') ||
          trimmed.startsWith('./')) &&
        !isExpiredOrDeadUrl(trimmed)
      ) {
        return trimmed;
      }
    }
    return getAttachmentDisplayUrl(currentImg, currentImg?.name || 'Specification Image');
  }, [currentImg, asyncBlobUrl]);

  // Sync image source whenever resolved URL updates
  useEffect(() => {
    setImageSrc(resolvedDisplayUrl);
  }, [resolvedDisplayUrl]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setSlideOffset(0);
  }, [initialIndex, isOpen]);

  // Monitor browser fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (scale > 1) {
          setScale(1);
          setPosition({ x: 0, y: 0 });
        } else {
          onClose();
        }
      }
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetZoom();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, safeImages.length, scale]);

  if (!isOpen || safeImages.length === 0) return null;

  const handlePrev = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : safeImages.length - 1));
  };

  const handleNext = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setCurrentIndex((prev) => (prev < safeImages.length - 1 ? prev + 1 : 0));
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.5, 4));
  const zoomOut = () => {
    setScale((s) => {
      const next = Math.max(s - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };
  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const toggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleDownload = () => {
    if (!imageSrc) return;
    const a = document.createElement('a');
    a.href = imageSrc;
    a.download = currentImg?.name || 'original_image.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Graceful multi-tier error fallback handler
  const handleImageError = () => {
    // Try thumbnail / smUrl first if not tried
    if (currentImg?.smUrl && imageSrc !== currentImg.smUrl) {
      setImageSrc(currentImg.smUrl);
      return;
    }
    // Try dataUrl if present
    if (currentImg?.dataUrl && imageSrc !== currentImg.dataUrl) {
      setImageSrc(currentImg.dataUrl);
      return;
    }
    // Fall back to clean SVG spec placeholder
    setImageSrc(
      createSpecPlaceholderSvg(
        currentImg?.name || 'Image Preview',
        'Image preview unavailable'
      )
    );
  };

  // Mouse Drag / Pan / Slide
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { ...position };
    setSlideOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (scale > 1) {
      setPosition({
        x: posStartRef.current.x + dx,
        y: posStartRef.current.y + dy,
      });
    } else {
      setSlideOffset(dx);
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (scale === 1) {
      if (slideOffset > 50 && safeImages.length > 1) {
        handlePrev();
      } else if (slideOffset < -50 && safeImages.length > 1) {
        handleNext();
      }
      setSlideOffset(0);
    }
  };

  // Touch handlers for mobile (Pinch-to-zoom + Drag-to-pan/swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 2 fingers -> Pinch to zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchDistanceRef.current = dist;
      pinchInitialScaleRef.current = scale;
      setIsDragging(false);
    } else if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      posStartRef.current = { ...position };
      setIsDragging(true);
      setSlideOffset(0);

      // Double-tap to quick toggle zoom
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        if (scale > 1) {
          setScale(1);
          setPosition({ x: 0, y: 0 });
        } else {
          setScale(2.5);
        }
      }
      lastTapRef.current = now;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDistanceRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / pinchDistanceRef.current;
      const nextScale = Math.min(Math.max(pinchInitialScaleRef.current * ratio, 1), 5);
      setScale(nextScale);
      if (nextScale === 1) {
        setPosition({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;

      if (scale > 1) {
        setPosition({
          x: posStartRef.current.x + dx,
          y: posStartRef.current.y + dy,
        });
      } else {
        setSlideOffset(dx);
      }
    }
  };

  const handleTouchEnd = () => {
    pinchDistanceRef.current = null;
    if (!isDragging) return;
    setIsDragging(false);

    if (scale === 1) {
      if (slideOffset > 50 && safeImages.length > 1) {
        handlePrev();
      } else if (slideOffset < -50 && safeImages.length > 1) {
        handleNext();
      }
      setSlideOffset(0);
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      setScale((s) => Math.min(s + 0.25, 5));
    } else {
      setScale((s) => {
        const next = Math.max(s - 0.25, 1);
        if (next === 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    }
  };

  // Double click to zoom toggle
  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  // Format file size
  const formattedSize = currentImg?.size
    ? currentImg.size > 1024 * 1024
      ? `${(currentImg.size / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.round(currentImg.size / 1024)} KB`
    : null;

  const viewerContent = (
    <div
      id="fullscreen-image-viewer-root"
      className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-150"
    >
      {/* Top Controls Bar with iOS safe area padding */}
      <div
        className="pt-safe px-3 sm:px-6 py-3 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent z-30 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 max-w-[50%] sm:max-w-[60%]">
          <span className="font-semibold text-xs sm:text-sm text-white truncate">
            {currentImg?.name || 'Picture Viewer'}
          </span>
          {safeImages.length > 1 && (
            <span className="text-[11px] sm:text-xs text-white/80 bg-white/15 px-2 py-0.5 rounded-full font-mono shrink-0">
              {currentIndex + 1} / {safeImages.length}
            </span>
          )}

          {formattedSize && (
            <span className="hidden md:inline-block text-[11px] text-white/60 font-mono">
              {formattedSize}
              {currentImg?.width && currentImg?.height ? ` • ${currentImg.width}×${currentImg.height}px` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Zoom Controls */}
          <button
            id="viewer-zoom-out-btn"
            onClick={zoomOut}
            disabled={scale <= 1}
            className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 transition-colors cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            id="viewer-reset-zoom-btn"
            onClick={resetZoom}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors text-[11px] sm:text-xs font-mono cursor-pointer"
            title="Reset Zoom (0)"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            id="viewer-zoom-in-btn"
            onClick={zoomIn}
            disabled={scale >= 4}
            className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40 transition-colors cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            id="viewer-fullscreen-toggle-btn"
            onClick={toggleBrowserFullscreen}
            className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Full'}</span>
          </button>

          {/* Download Original File */}
          <button
            id="viewer-download-btn"
            onClick={handleDownload}
            className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer flex items-center gap-1 text-xs"
            title="Download Original File"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Save</span>
          </button>

          {/* Top Bar Close (X) Button */}
          <button
            id="viewer-close-btn"
            onClick={onClose}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-lg flex items-center justify-center transition-all ml-1 cursor-pointer shrink-0 z-50 border-2 border-white/30"
            title="Close Viewer (Esc)"
            aria-label="Close image viewer"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Floating Always-Visible Close Button for safety with safe-area spacing */}
      <button
        id="viewer-floating-close-btn"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          top: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
          right: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
        }}
        className="fixed z-[100000] w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xl flex items-center justify-center cursor-pointer border-2 border-white/60 transition-transform active:scale-95"
        title="Close Viewer (Esc)"
        aria-label="Close image viewer"
      >
        <X className="w-5 h-5 stroke-[3]" />
      </button>

      {/* Main Image Stage with Drag & Pan */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4 relative overflow-hidden touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : (safeImages.length > 1 ? 'grab' : 'default') }}
      >
        {/* Navigation Left Arrow */}
        {safeImages.length > 1 && (
          <button
            id="viewer-prev-arrow-btn"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 p-2 sm:p-3.5 rounded-full bg-black/60 hover:bg-white/25 text-white transition-all z-20 shadow-lg backdrop-blur-xs active:scale-95 cursor-pointer"
            title="Previous picture (Left Arrow or Drag Right)"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Current Image */}
        <div
          className="transition-transform duration-75 flex items-center justify-center max-w-full max-h-full"
          style={{
            transform: `translate(${position.x + (scale === 1 ? slideOffset : 0)}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <img
            src={imageSrc}
            alt={currentImg?.name || 'Preview'}
            className="max-h-[76vh] max-w-[95vw] w-auto h-auto object-contain rounded-xl shadow-2xl pointer-events-none select-none transition-opacity"
            referrerPolicy="no-referrer"
            onError={handleImageError}
          />
        </div>

        {/* Navigation Right Arrow */}
        {safeImages.length > 1 && (
          <button
            id="viewer-next-arrow-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 p-2 sm:p-3.5 rounded-full bg-black/60 hover:bg-white/25 text-white transition-all z-20 shadow-lg backdrop-blur-xs active:scale-95 cursor-pointer"
            title="Next picture (Right Arrow or Drag Left)"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip with safe area padding */}
      {safeImages.length > 1 && (
        <div
          className="pb-safe px-3 sm:px-6 py-2.5 flex items-center justify-center gap-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent overflow-x-auto z-30 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {safeImages.map((img, idx) => (
            <button
              key={img.id || idx}
              id={`viewer-thumb-${idx}`}
              onClick={() => {
                setScale(1);
                setPosition({ x: 0, y: 0 });
                setCurrentIndex(idx);
              }}
              className={`w-11 h-11 sm:w-14 sm:h-14 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                idx === currentIndex
                  ? 'border-indigo-400 scale-105 shadow-lg'
                  : 'border-white/20 opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={img.smUrl || img.url || img.dataUrl || createSpecPlaceholderSvg(img.name || `Photo ${idx + 1}`)}
                alt={img.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(viewerContent, document.body);
  }

  return viewerContent;
};
