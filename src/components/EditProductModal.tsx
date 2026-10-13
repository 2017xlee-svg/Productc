import React from 'react';
import { ProductWorkspace } from './ProductWorkspace';
import { Attachment, Product, Specification } from '../types';

interface EditProductModalProps {
  product: Product;
  specifications: Specification[];
  onClose: () => void;
  onNavigateToCompare?: () => void;
  onNavigateToManage?: () => void;
  allExistingTags?: string[];
  onAddNewTag?: (tag: string) => void;
  onUpdateProduct: (productData: {
    name: string;
    brand: string;
    tags: string[];
    overview: string;
    pictures: Attachment[];
    specs: { id?: string; name: string; details: string; unit?: string; order?: number; pictures?: Attachment[] }[];
  }) => Promise<void>;
  onDeleteProduct?: (productId: string) => Promise<void>;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  product,
  specifications,
  onClose,
  onNavigateToCompare,
  onNavigateToManage,
  allExistingTags,
  onAddNewTag,
  onUpdateProduct,
  onDeleteProduct,
}) => {
  // Extract all existing specs for this product
  const productSpecs = specifications
    .filter((s) => s.productId === product.id || s.productTitle === product.name)
    .sort((a, b) => a.order - b.order)
    .map((s, idx) => ({
      id: s.id,
      name: s.specName,
      details: s.details,
      unit: s.unit || '',
      order: typeof s.order === 'number' ? s.order : idx + 1,
      pictures: s.pictures || [],
    }));

  return (
    <ProductWorkspace
      isEditMode={true}
      productId={product.id}
      initialData={{
        name: product.name,
        brand: product.brand,
        tags: product.tags,
        overview: product.overview,
        pictures: product.pictures,
        specs: productSpecs,
      }}
      onClose={onClose}
      onNavigateToCompare={onNavigateToCompare}
      onNavigateToManage={onNavigateToManage}
      allExistingTags={allExistingTags}
      onAddNewTag={onAddNewTag}
      onSaveProduct={onUpdateProduct}
      onDeleteProduct={onDeleteProduct}
    />
  );
};
