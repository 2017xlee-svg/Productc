# Implementation Plan: Specification Number Toggle, HTML & Newline Rendering, Clean 3-Item Seed Data, and Cloud Storage Guide

This plan addresses all items requested by the user:
1. **"Is Number" Switch for Specifications**: Allow users to toggle whether a specification is treated as a numerical value (with Higher/Lower comparison bars and Best badge) or as descriptive text (preventing false number detection on text like "470 effectively" or "44.1 kHz").
2. **HTML & Newline Real-Time Rendering**: Properly render newlines (`\n`, `<br/>`) and rich text tags (`<b>`, `<strong>`, `<i>`, `<u>`, links) across the Product Detail View, Smart Add, Comparison Matrix, and provide a real-time rendered preview in the editor.
3. **Trim Seed Data**: Reduce the default seed catalog to **exactly 3 products** and **3 reviews** with matching clean specifications.
4. **Cloud Storage & Firestore Guidance**: Clarify how to activate and store reviews and photos in Google Cloud Firestore and Firebase Storage.

---

## 1. Specification Number Toggle ("Is Number" Switch)

### Problem
Currently, any text containing digits (e.g., "sony px470: 470 effectively" vs "Plaud note: 3 meters/", or "44.1 kHz" under battery) is automatically parsed as a number. This causes the Comparison Matrix to display false numerical progress bars and incorrect "Best" badges across mismatched text.

### Proposed Solution
- Add an `isNumeric?: boolean` field to `Specification` in `src/types.ts`.
- In `ProductWorkspace.tsx`, `AddSpecModal.tsx`, `EditSpecModal.tsx`, and `SmartAddProduct.tsx`:
  - Add an intuitive **"Is Number / Metric" switch** with visual indicator (e.g. `[123 Number]` vs `[Aa Text]`).
  - When enabled: The value is treated as a numeric metric, allowing unit specification, Best value ("Higher is better" / "Lower is better"), and visual progress bar comparison.
  - When disabled: The value is treated strictly as descriptive text, preventing false numeric comparisons.
- In `ComparisonMatrix.tsx`:
  - Respect `spec.isNumeric`. If false (or if manually toggled off in the matrix header), render the specification as a clean text comparison card with full multi-line details and rich text instead of a numeric bar.
  - Add a quick toggle button right on the comparison card header (`Number / Text`) so users can switch comparison modes on the fly.

---

## 2. HTML & Newline Real-Time Rendering

### Problem
Specifications with multi-line points (e.g. `-Focus Mode:... -Wide-Stereo Mode:...`) and rich text formatting (bold, italic, links) currently lose their line breaks and HTML tags, displaying as a squished, single-line text block in Product Detail View, Smart Add, and Edit modes.

### Proposed Solution
- Create a shared, safe HTML/Markdown formatter helper `renderFormattedContent(text)`:
  - Preserves explicit newlines (`\n`) by converting them to `<br/>` or wrapping bulleted lines cleanly.
  - Supports inline HTML tags created by the rich text toolbar (`<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<s>`, `<a href>`, `<br/>`).
  - Sanitizes and renders cleanly with `whitespace-pre-line` and readable typographic hierarchy.
- **Product Detail Modal (`ProductDetailModal.tsx`)**:
  - Replace raw plain text `{spec.details}` with rich HTML rendered content that preserves bullet points, bold headers, and line breaks.
- **Smart Add & Inline Spec View (`SmartAddProduct.tsx`)**:
  - Update spec preview to render rich text with `whitespace-pre-line` so users can easily distinguish distinct lines and bold highlights.
- **Product Edit Workspace (`ProductWorkspace.tsx`)**:
  - Add a **Real-Time Render Preview** toggle / tab under the specification details textarea so users immediately see their bold text, links, and line breaks rendered live as they type or click toolbar buttons.

---

## 3. Trim Seed Data to Exactly 3 Products & 3 Reviews

### Problem
`src/data/seedData.ts` currently contains over 1,400 lines of data with 6+ products and 10+ reviews, making testing and initial navigation cluttered.

### Proposed Solution
- Trim `INITIAL_PRODUCTS` to **3 featured benchmark products**:
  1. **Sony ICD-PX470** (Digital Voice Recorder)
  2. **Plaud Note** (AI Voice Recorder)
  3. **Samsung Galaxy Fold 8** (Foldable Smartphone)
- Trim `INITIAL_SPECIFICATIONS` to match these 3 products cleanly, ensuring multi-line specs (like Recording Mode) have clean newlines and correct `isNumeric` settings.
- Trim `INITIAL_REVIEWS` to **3 comprehensive, well-structured reviews** linked to these products.
- Update `localDatabase.ts` normalization and seed resets so users can reset to this clean 3-product dataset with one click.

---

## 4. Google Cloud & Firebase Storage Activation

### Clarification for User
- The application already has Firebase Firestore and Google Cloud Storage wired into the code via `firebase-applet-config.json` (Database ID: `ai-studio-recordcompare-9b5993ac-3307-430e-af50-d0e625993029`, Storage Bucket: `gen-lang-client-0152097172.firebasestorage.app`).
- To store reviews and pictures permanently in the cloud:
  - Users can click **Cloud Sync** / **Data Backup & Cloud Sync** in the navigation bar.
  - Clicking **"Push to Cloud Firestore"** will instantly upload all local products, specifications, reviews, and high-resolution images to Google Cloud Storage.
  - Any user visiting the app can also click **"Pull from Cloud"** to fetch the live cloud dataset across any device.

---

## Verification Plan

### Automated Verification
- Run `lint_applet` (`npm run lint` / `tsc --noEmit`) to verify zero TypeScript errors.
- Run `compile_applet` (`npm run build`) to ensure successful Vite bundling and production packaging.

### Manual Verification
1. **Number Switch**:
   - Verify turning off "Is Number" for a spec (e.g., Audio Pickup Range or Warranty) stops the numeric bar chart and displays it as clean text comparison.
   - Verify turning on "Is Number" enables Higher/Lower logic and progress bar comparison.
2. **HTML & Newline Formatting**:
   - Verify multi-line specs in `ProductDetailModal` show distinct lines for `-Focus Mode` and `-Wide-Stereo Mode` with bold text.
   - Verify typing `<b>bold</b>` or hitting Enter in the spec editor immediately renders in the live preview.
3. **Seed Data**:
   - Verify clicking "Reset to Sample Catalog" loads exactly 3 products and 3 reviews.
