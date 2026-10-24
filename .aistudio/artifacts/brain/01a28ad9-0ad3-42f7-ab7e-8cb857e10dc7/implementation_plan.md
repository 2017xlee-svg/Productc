# Unified Inline WYSIWYG HTML Editing Architecture

Replace all raw Markdown/HTML textareas and split real-time preview boxes across the application with unified, inline WYSIWYG rich-text editors. Users directly see formatted bold, italic, underline, bullet lists, and clickable app links as they type, eliminating separate preview panels.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during the interactive interview:
> - **Unified WYSIWYG Scope**: Upgraded across all specification and overview inputs (Product Overview, Edit Specification Modal, Add Specification Modal, Product Workspace Inline Specs, and Smart Add Product).
> - **Zero Split Previews**: Completely removed the redundant "Real-Time Preview" boxes below textareas. The input canvas itself is what-you-see-is-what-you-get.
> - **Eliminate Markdown**: Standardized all rich fields on clean HTML (`<b>`, `<i>`, `<u>`, `<a>`, `<ul>/<li>`). Migrated legacy markdown (`**text**`, `[label](url)`) to native HTML on load.
> - **Compact Toolbar**: Standardized on a compact, responsive toolbar featuring **Bold**, *Italic*, <u>Underline</u>, 🔗 **Link** (supporting `upnote://`, `marginnote4app://`, `http(s)://`), and • **Bullet List**.

---

### 1. Overview & Core Concept

- **What It Delivers**: A unified, reusable `HtmlWysiwygEditor` component that replaces raw multi-line `<textarea>` inputs. Users format text inline and immediately see styled typography, lists, and active blue links without seeing syntax tags (`**`, `<b>`) or squinting at a second preview box.
- **Target Audience**: Catalog managers, reviewers, and product researchers taking notes, adding specs, and linking external knowledge bases (UpNote, MarginNote) across mobile and desktop devices.
- **Key Value**: Streamlines specification and overview entry by eliminating dual-box visual friction, prevents markdown-HTML dialect mismatches, and guarantees that app links (`upnote://`, `marginnote4app://`) are formatted and clickable everywhere.

---

### 2. User Experience & Visual Design

- **Unified What-You-See-Is-What-You-Get Canvas**:
  - The single input box displays the formatted document in real-time. Typing bold text immediately displays bold letters; pasting or inserting links displays standard blue underlined text links.
  - The redundant "REAL-TIME PREVIEW" / "Real-time Formatted Preview" box below the input is deleted across all modals and workspace sections.
- **Compact Toolbar Design**:
  - Pinned directly above the contentEditable area with a subtle bottom hairline border (`border-b border-slate-200/90`).
  - Formatting buttons:
    - **B** (`Bold` - Lucide `Bold` icon or bold letter)
    - *I* (`Italic` - Lucide `Italic` icon)
    - <u>U</u> (`Underline` - Lucide `Underline` icon)
    - 🔗 `Add link` (Interactive popover/modal supporting both standard URLs and native app schemes `upnote://`, `marginnote4app://`)
    - • `Bullet list` (Toggles unordered list format)
    - 🧹 `Clear format` (Removes inline styling)
- **Active State & Mobile Ergonomics**:
  - Focused border: `border-slate-800 ring-1 ring-slate-800` (neutral, non-distracting).
  - Touch targets $\ge 40\text{px}$ on mobile for toolbar buttons.
  - Native app links remain blue, underlined, and tap-safe.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Native contentEditable vs. External Heavy Libraries (Quill/TinyMCE)**
  - *Chosen Approach*: Lightweight, custom `HtmlWysiwygEditor` powered by browser `document.execCommand` / DOM selection API (the exact reliable pattern already used by `UnifiedReviewEditor`).
  - *Why*: Adds 0kB of external dependency weight, prevents package installation failures or iframe conflicts, boots instantly on mobile Safari, and natively preserves custom app schemes (`upnote://`, `marginnote://`).
  - *Alternatives Considered*: Heavy npm rich-text packages (Slate, Tiptap, Quill), which introduce complex schemas and frequently block custom URL protocols.
- **Decision 2: Backward Compatibility for Existing Markdown Data**
  - *Chosen Approach*: On initial mount, `HtmlWysiwygEditor` automatically detects and converts legacy markdown (`**bold**`, `*italic*`, `[label](url)`) into native HTML (`<strong>`, `<em>`, `<a>`).
  - *Why*: Ensures existing products (e.g., Plaud Note's `**Ultra**-slim` overview) automatically render as bold text upon opening the editor without user re-typing.
- **Decision 3: Complete Removal of Separate Preview Panels**
  - *Chosen Approach*: Eliminate the preview accordion/card beneath the textarea in `EditSpecModal`, `AddSpecModal`, `ProductWorkspace`, and `SmartAddProduct`.
  - *Why*: Redundant once the canvas itself is WYSIWYG, saving precious vertical screen real estate on mobile devices.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HtmlWysiwygEditor.tsx                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Compact Toolbar: [ B ] [ I ] [ U ] [ • List ] [ 🔗 Link ] [ 🧹 ] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ contentEditable Canvas                                           │  │
│  │  • Automatic legacy markdown -> HTML normalization on mount     │  │
│  │  • Real-time HTML output via onChange(html)                     │  │
│  │  • Blue underlined app links (upnote://, marginnote4app://)     │  │
│  │  • Full mobile Safari / Android touch gesture support           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
       Replaces textareas & redundant preview cards in 5 views:
  ┌───────────────────────┬────────────────────────┬─────────────────────┐
  │  ProductWorkspace     │   EditSpecModal        │   SmartAddProduct   │
  │  • Product Overview   │   • Value / Details    │   • Inline Spec     │
  │  • Inline Spec Details│   (Preview removed)    │     Details         │
  ├───────────────────────┴────────────────────────┴─────────────────────┤
  │  AddSpecModal                                                        │
  │  • Value / Details (Preview removed)                                 │
  └──────────────────────────────────────────────────────────────────────┘
```

- **State & Data Lifecycle**:
  - `initialValue`: Accepts existing HTML or legacy markdown; converts to rich HTML for `contentEditable.innerHTML`.
  - `onChange(html)`: Emits clean HTML string to parent state on input or blur.
  - `onSave`: Parent components persist the HTML string directly to database / Firestore.
- **Protocol & Link Handling**:
  - Built-in URL prompt dialog validates and auto-prefixes web links with `https://` while leaving native schemes (`upnote://`, `marginnote4app://`, `obsidian://`) untouched with `target="_top"`.
