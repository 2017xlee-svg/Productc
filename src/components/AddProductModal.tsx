import React from 'react';
import { ProductWorkspace } from './ProductWorkspace';
import { Attachment } from '../types';

interface AddProductModalProps {
  onClose: () => void;
  onNavigateToCompare?: () => void;
  onNavigateToManage?: () => void;
  allExistingTags?: string[];
  onAddNewTag?: (tag: string) => void;
  onAddProduct: (productData: {
    name: string;
    brand: string;
    tags: string[];
    overview: string;
    pictures: Attachment[];
    specs: { name: string; details: string; order?: number; pictures?: Attachment[] }[];
  }) => Promise<void>;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  onClose,
  onNavigateToCompare,
  onNavigateToManage,
  allExistingTags,
  onAddNewTag,
  onAddProduct,
}) => {
  return (
    <ProductWorkspace
      onClose={onClose}
      onNavigateToCompare={onNavigateToCompare}
      onNavigateToManage={onNavigateToManage}
      allExistingTags={allExistingTags}
      onAddNewTag={onAddNewTag}
      onSaveProduct={onAddProduct}
    />
  );
};
