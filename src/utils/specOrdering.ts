import { Product, Specification } from '../types';

/**
 * Computes the unified specification order across products according to slot hierarchy:
 * 1. Product in Slot 1: takes all specifications in Product 1's defined order (1 to end).
 * 2. Product in Slot 2: appends any remaining specifications not already present in (1),
 *    in Product 2's defined order (1 to end).
 * 3. Product in Slot 3, etc.: appends any specifications not yet present, in Product 3's order.
 *
 * Example:
 * Product 1: A (order 1), C (order 2)
 * Product 2: D (order 1), A (order 2)
 * Product 3: B (order 1), E (order 2), A (order 3), D (order 4)
 * -> Result: A (1), C (2), D (3), B (4), E (5)
 */
export function computeHierarchicalSpecOrder(
  orderedProducts: (Product | null | undefined)[],
  allSpecifications: Specification[]
): string[] {
  const result: string[] = [];
  const seenLower = new Set<string>();

  orderedProducts.forEach((prod) => {
    if (!prod) return;

    // Filter specifications for this product
    const pSpecs = allSpecifications
      .filter(
        (s) =>
          (s.productId && s.productId === prod.id) ||
          (s.productTitle && s.productTitle.trim().toLowerCase() === prod.name.trim().toLowerCase())
      )
      .slice()
      .sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : 9999;
        const orderB = typeof b.order === 'number' ? b.order : 9999;
        return orderA - orderB;
      });

    pSpecs.forEach((s) => {
      const trimmed = s.specName?.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        result.push(trimmed);
      }
    });
  });

  return result;
}

/**
 * Builds an array of blank specifications for creating a new Smart Product,
 * assigning sequential order numbers (1 to N) following the hierarchical slot sequence,
 * and inheriting any unit or isNumeric configuration from existing specifications.
 */
export function buildInheritedBlankSpecs(
  orderedSpecNames: string[],
  allSpecifications: Specification[]
): Array<{
  name: string;
  details: string;
  unit: string;
  isNumeric?: boolean;
  order: number;
}> {
  return orderedSpecNames.map((specName, index) => {
    // Find first existing spec for this attribute to inherit unit and isNumeric settings
    const existingRef = allSpecifications.find(
      (s) =>
        s.specName?.trim().toLowerCase() === specName.trim().toLowerCase() &&
        (s.unit?.trim() || s.isNumeric !== undefined)
    );

    return {
      name: specName,
      details: '',
      unit: existingRef?.unit?.trim() || '',
      isNumeric: existingRef?.isNumeric,
      order: index + 1,
    };
  });
}
