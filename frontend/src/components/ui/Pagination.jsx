import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

export function Pagination({ currentPage, totalPages, onPageChange, className }) {
  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  const getPageNumbers = () => {
    const pages = [];
    const pageLimit = 3;
    const leftSide = currentPage - 1 > 0 ? currentPage - 1 : 1;
    const rightSide = currentPage + 1 < totalPages ? currentPage + 1 : totalPages;
    let lastPage;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= leftSide && i <= rightSide)) {
        if (lastPage && i - lastPage > 1) {
          pages.push('...');
        }
        pages.push(i);
        lastPage = i;
      }
    }
    return pages;
  };
  
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn('mx-auto flex w-full justify-center py-4', className)}
    >
      <ul className="flex list-none flex-wrap items-center justify-center gap-1">
        <li>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>
        </li>
        {getPageNumbers().map((pageNumber, index) => (
          <li key={index}>
            {pageNumber === '...' ? (
              <span className="flex h-9 w-9 items-center justify-center">
                <MoreHorizontal className="h-4 w-4" />
              </span>
            ) : (
              <Button
                variant={currentPage === pageNumber ? 'outline' : 'ghost'}
                size="icon"
                onClick={() => handlePageChange(pageNumber)}
                className="h-9 w-9"
              >
                {pageNumber}
              </Button>
            )}
          </li>
        ))}
        <li>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </li>
      </ul>
    </nav>
  );
}
