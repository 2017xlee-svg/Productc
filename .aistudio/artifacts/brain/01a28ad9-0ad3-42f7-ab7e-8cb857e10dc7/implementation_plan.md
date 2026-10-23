# Hierarchical Slot-Priority Specification Ordering

Implement slot-priority specification ordering across the Compare Workspace, Smart Add Module, and Smart Product creation so that specifications are ordered by Product 1's specifications (1 to N) first, followed by remaining specifications from Product 2 (1 to M), Product 3, and so on.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed:

- **Slot-Priority Sequence**: Confirmed. Specifications are ordered starting with all specifications of the product in Slot 1 in its defined order (1 to N), then appending any new/unique specifications from Slot 2 in its defined order, then Slot 3, etc. Any duplicate field names are retained in their first encountered slot position.
- **Smart Product Creation Order**: Confirmed. When creating a smart product in Smart Add, its newly created specifications will automatically inherit this exact combined sequence (with assigned `order: 1, 2, 3...`).
- **Dynamic Slot Reordering**: Confirmed. If the user swaps or changes product slots (e.g., changing Slot 1 to a different product or clearing a slot), the specification list dynamically re-computes to prioritize the current Slot 1 product's specs.

---

### 1. Overview & Core Concept

- **Problem**: Previously, specifications in the compare view were sorted either by alphabetical order or by the global minimum `order` number across all products, causing specifications from second or third products with lower order numbers to jump ahead of the first product's key specifications.
- **Solution**: A unified hierarchical slot-priority ordering algorithm (`computeHierarchicalSpecOrder`) that:
  1. Iterates through the active product slots in visual sequence (Slot 1, Slot 2, Slot 3...).
  2. For each product, sorts its specifications by their product-level `order`.
  3. Appends each specification name if it has not yet been included (case-insensitive check).
  4. Feeds this exact sequence to both the Comparison Matrix table and the Smart Add specification editor.
  5. Assigns sequential `order` numbers (1, 2, 3...) when a new smart product is created from these comparison slots.

---

### 2. User Experience & Visual Flow

#### Specification Ordering Example
Given 3 products in slots 1, 2, and 3:

```
┌──────────────────────────────────────────────────────────────┐
│ Slot 1: Product 1           Slot 2: Product 2                │
│ 1. Spec A                   1. Spec D                        │
│ 2. Spec C                   2. Spec A                        │
│                                                              │
│ Slot 3: Product 3                                            │
│ 1. Spec B                                                    │
│ 2. Spec E                                                    │
│ 3. Spec A                                                    │
│ 4. Spec D                                                    │
└──────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Resulting Matrix & Smart Add Specification Order:            │
│ 1. Spec A  (from Product 1, order 1)                         │
│ 2. Spec C  (from Product 1, order 2)                         │
│ 3. Spec D  (from Product 2, order 1 - first seen in Slot 2)  │
│ 4. Spec B  (from Product 3, order 1 - first seen in Slot 3)  │
│ 5. Spec E  (from Product 3, order 2 - first seen in Slot 3)  │
└──────────────────────────────────────────────────────────────┘
```

When creating a new smart product from this comparison:
- New product's specifications are initialized as `Spec A` (`order: 1`), `Spec C` (`order: 2`), `Spec D` (`order: 3`), `Spec B` (`order: 4`), `Spec E` (`order: 5`).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Shared Ordering Helper**:
  - *Approach*: Implement `computeHierarchicalSpecOrder(orderedProducts, allSpecifications)` in a shared utility (or exported in `types.ts` / `specOrdering.ts`) used identically by `ComparisonMatrix.tsx` and `SmartAddProduct.tsx`.
  - *Why*: Eliminates discrepancies between Compare mode and Smart Add mode so the user sees identical specification ordering in both modules.
- **Decision 2: Case-Insensitive Deduplication with Original Casing Preservation**:
  - *Approach*: Check `seen.has(specName.toLowerCase())` while storing and displaying the canonical display name from the first encountering product.
  - *Why*: Prevents duplicate rows if Product 1 has "Weight" and Product 2 has "weight".
- **Decision 3: Smart Product Default Spec Initialization**:
  - *Approach*: In `handleCreateSmartProduct`, map the ordered `uniqueSpecNames` directly into the product's `specs` array with `order: idx + 1` and preserve detected `unit` and `isNumeric` settings.
  - *Why*: Ensures the newly created product immediately matches the matrix layout without requiring manual reordering.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Shared Helper: computeHierarchicalSpecOrder                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Input:                                                                   │
│   orderedProducts: [Product 1 (Slot 1), Product 2 (Slot 2), ...]         │
│   allSpecifications: Specification[]                                     │
│                                                                          │
│ Logic:                                                                   │
│   result = [], seen = Set()                                              │
│   for prod in orderedProducts:                                           │
│     prodSpecs = getSpecs(prod.id).sort((a,b) => a.order - b.order)       │
│     for spec in prodSpecs:                                               │
│       if !seen.has(spec.name.toLowerCase()):                             │
│         seen.add(spec.name.toLowerCase())                                │
│         result.push(spec.name)                                           │
│   return result                                                          │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│     ComparisonMatrix.tsx      │               │      SmartAddProduct.tsx      │
├───────────────────────────────┤               ├───────────────────────────────┤
│ uniqueSpecNames = useMemo(    │               │ uniqueSpecNames = useMemo(    │
│   computeHierarchicalSpecOrder│               │   computeHierarchicalSpecOrder│
│ )                             │               │ )                             │
│ Spec comparison rows render   │               │ 1. Spec cards render in this  │
│ in this exact order           │               │    hierarchical order         │
│                               │               │ 2. handleCreateSmartProduct:  │
│                               │               │    blankSpecs ordered 1..N    │
└───────────────────────────────┘               └───────────────────────────────┘
```

#### Files to Update:
1. `src/utils/specOrdering.ts`: Create shared `computeHierarchicalSpecOrder` helper.
2. `src/components/SmartAddProduct.tsx`: Use `computeHierarchicalSpecOrder` for `uniqueSpecNames` and map to `blankSpecs` when creating smart products.
3. `src/components/ComparisonMatrix.tsx`: Use `computeHierarchicalSpecOrder` for `uniqueSpecNames`.
