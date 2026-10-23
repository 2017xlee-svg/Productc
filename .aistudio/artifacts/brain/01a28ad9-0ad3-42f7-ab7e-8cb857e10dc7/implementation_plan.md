# Implementation Plan: Unify Smart Add Specification Editor with Product Mode

The goal of this update is to make the specification editing experience in the **Smart Add Product** module completely identical to **Product Mode** (`ProductWorkspace`), ensuring full feature parity, rich formatting controls, and consistent UI/UX.

---

## 1. Feature Parity Breakdown

Currently, Product Mode (`ProductWorkspace.tsx`) offers a rich set of editing controls that the Smart Add inline editor partially lacks:

| Feature | Product Mode (`ProductWorkspace`) | Smart Add Module (Current) | Target (Unified) |
|---|---|---|---|
| **Rich Text Toolbar** | Yes (`B`, `I`, `U`, `S`, `Add link`) | Missing | **Yes: Full formatting toolbar** |
| **Quick Unit Presets** | Yes (`g`, `kg`, `inch`, `cm`, `mm`, `year`, `month`, `mAh`, `Hz`, `$`, `GB`) | Missing | **Yes: 1-click unit preset chips** |
| **"Is Number" Switch** | Yes (`[# Number]` vs `[Aa Text]` with toggle) | Basic toggle | **Yes: Identical styled toggle & labels** |
| **Real-time Live Preview** | Yes (`FormattedSpecHtml` container) | Basic box | **Yes: Live preview with eye icon & card** |
| **Specification Pictures** | Multi-photo upload, thumbnail list, delete & zoom | Single file picker | **Yes: Full gallery, upload & remove** |
| **Modal Edit Option** | Yes (`EditSpecModal`) | Partial | **Yes: Quick button to open full modal** |

---

## 2. Proposed Changes

### Component 1: `src/components/SmartAddProduct.tsx`
- **Add Rich Text Formatting Toolbar**:
  - Insert selection-aware formatting buttons (`B`, `I`, `U`, `S`, `Add link`) directly above the specification details textarea.
  - Implement `insertSpecFormatting(openTag, closeTag)` to wrap highlighted text or append tags at cursor position.
- **Add Quick Unit Preset Chips**:
  - Add quick chips (`g`, `kg`, `inch`, `cm`, `mm`, `year`, `month`, `mAh`, `Hz`, `$`, `GB`) below the Unit input field. Clicking any chip immediately populates or toggles the unit.
- **Unify "Is Number" Switch**:
  - Style the Number switch with the exact same `#` vs `Aa` badge, `Number ON / Number OFF` indicators, and explanatory description found in `ProductWorkspace`.
- **Enhanced Picture Management**:
  - Support multi-file image uploading with progress spinner.
  - Display interactive thumbnail badges with remove (`✕`) and fullscreen zoom.
- **Full Modal Option**:
  - Add an "Open in Modal" button so users can seamlessly switch between inline editing and the full-screen `EditSpecModal`.

### Component 2: `src/components/EditSpecModal.tsx` & `src/components/AddSpecModal.tsx`
- Verify that both modals also include the rich formatting toolbar (`B`, `I`, `U`, `S`, `Link`) and quick unit presets, ensuring complete consistency across all entry points in the app.

---

## 3. Verification Plan

### Automated Verification
- Run `lint_applet` (`npm run lint` / `tsc --noEmit`) to verify zero TypeScript errors.
- Run `compile_applet` (`npm run build`) to verify Vite and server build pass cleanly.

### Manual Verification
1. Navigate to **Smart Add Product** tab.
2. Click any specification on a product card to open inline edit mode.
3. Test the **Rich Text Toolbar**:
   - Highlight text, click `B`, and confirm `<b>` tags are wrapped and bolded in the live preview.
   - Click `I`, `U`, `S`, and `Add link` to confirm tags are applied correctly.
4. Test the **Quick Unit Chips**:
   - Click `Year`, `g`, or `mAh` and verify the unit input updates immediately.
5. Test the **Is Number Switch**:
   - Toggle the switch between Number ON and Number OFF and verify styling matches Product Mode.
6. Test **Specification Pictures**:
   - Upload multiple photos, verify thumbnails render, and delete individual pictures.
7. Save changes and confirm the updated specification reflects across Catalog, Smart Add, and Comparison Matrix.
