# Implementation Plan: Full-Size Uncropped Product Pictures

Show the full, complete image for all product photos without cropping, zooming in, or clipping edges, using a clean neutral container with `object-contain`.

---

## Proposed Changes

### 1. Product Catalog Cards (`src/components/ProductCard.tsx`)
- Update the product image container:
  - Replace `object-cover` with `object-contain` so vertical, square, or panoramic photos display entirely without edge cropping.
  - Set a clean neutral background (`bg-slate-50/80` or `bg-slate-100/60`) and gentle padding (`p-1.5` to `p-2`) so the image fits naturally with balanced margins.
  - Keep the standard aspect container (`aspect-4/3`) so card heights remain uniform across grid columns while preventing distortion or zoom-in.
  - Adjust subtle hover effect (`group-hover:scale-[1.02]`) so it doesn't cause cropping on hover.

### 2. Product Detail Modal (`src/components/ProductDetailModal.tsx`)
- Main product preview frame:
  - Change `object-cover` to `object-contain` with `bg-slate-50` and balanced padding.
  - Ensure the full uncropped image is visible immediately upon opening details.
  - Maintain the click-to-fullscreen feature for zooming and inspecting the original high-resolution picture.

### 3. Comparison Matrix (`src/components/ComparisonMatrix.tsx`)
- Pictures comparison field and header slots:
  - Update product pictures in the comparison section to `object-contain` with a clean background.
  - Prevent vertical or wide product images from being sliced or zoomed in when comparing side-by-side.

---

## Verification Plan

### Automated Verification
- Run `npm run lint` (`lint_applet`) to ensure TypeScript and syntax validation passes with zero errors.
- Run `compile_applet` (`npm run build`) to confirm successful Vite production compilation.

### Visual & Functional Checks
- Open the mobile view and desktop grid: confirm product images (including phone, clothing, box images) are fully visible from edge to edge without any cropping.
- Open Product Details modal: verify the main photo shows full height and width without top/bottom cropping.
- Compare products: verify picture rows in comparison view show full uncropped images.
