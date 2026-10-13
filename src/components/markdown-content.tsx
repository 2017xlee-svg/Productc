import React from 'react';
import Markdown from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  if (!content || !content.trim()) {
    return <span className="text-slate-400 italic text-xs">No overview provided.</span>;
  }

  return (
    <div className={`prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed space-y-2 ${className}`}>
      <Markdown>{content}</Markdown>
    </div>
  );
};
