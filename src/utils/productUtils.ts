import { Product } from '../types';

/**
 * Returns a clean, non-duplicated product display name.
 * Prevents repeating the brand if the product name already contains or starts with the brand.
 * Example:
 *   brand: "Sony", name: "Sony bravo" -> "Sony bravo" (NOT "Sony Sony bravo")
 *   brand: "Iphone", name: "Iphone 18 pro" -> "Iphone 18 pro" (NOT "Iphone Iphone 18 pro")
 *   brand: "viture", name: "Viture luma ultra" -> "Viture luma ultra" (NOT "viture Viture luma ultra")
 *   brand: "Apple", name: "AirPods Pro" -> "Apple AirPods Pro"
 */
export function getCleanProductDisplayName(product?: { brand?: string; name: string } | null): string {
  if (!product) return '';
  const brand = (product.brand || '').trim();
  const name = (product.name || '').trim();

  if (!brand) return name;
  if (!name) return brand;

  const brandLower = brand.toLowerCase();
  const nameLower = name.toLowerCase();

  // If the product name already starts with the brand name (case-insensitive)
  if (nameLower.startsWith(brandLower)) {
    // Check if followed by space, punctuation, or end of string
    const remainder = name.slice(brand.length);
    if (!remainder || remainder.startsWith(' ') || remainder.startsWith('-') || remainder.startsWith('/')) {
      return name;
    }
  }

  // If the brand already contains the product name
  if (brandLower.startsWith(nameLower)) {
    return brand;
  }

  return `${brand} ${name}`;
}

/**
 * Sorts an array of products alphabetically from A to Z by their clean display name.
 */
export function sortProductsByName<T extends { brand?: string; name: string }>(products: T[]): T[] {
  if (!Array.isArray(products)) return [];
  return [...products].sort((a, b) => {
    const nameA = getCleanProductDisplayName(a);
    const nameB = getCleanProductDisplayName(b);
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
  });
}
