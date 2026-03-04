import * as React from 'react';
import { cn } from '@extension/ui';

interface TableRowSkeletonProps {
  isLight: boolean;
  columns?: number;
}

/**
 * Generic table row skeleton for loading states
 */
export const TableRowSkeleton: React.FC<TableRowSkeletonProps> = ({ isLight, columns = 4 }) => {
  const skeletonBar = (width: string) =>
    cn('h-3 rounded animate-pulse', width, isLight ? 'bg-gray-200' : 'bg-gray-700');

  const widths = ['w-1/4', 'w-1/3', 'w-1/2', 'w-2/5', 'w-1/6'];

  return (
    <tr className={cn(isLight ? 'bg-white' : 'bg-[#151C24]')}>
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="px-4 py-3">
          <div className={skeletonBar(widths[index % widths.length])} />
        </td>
      ))}
    </tr>
  );
};

/**
 * Multiple table row skeletons
 */
export const TableRowSkeletons: React.FC<TableRowSkeletonProps & { count?: number }> = ({
  isLight,
  columns = 4,
  count = 3,
}) => (
  <>
    {Array.from({ length: count }).map((_, index) => (
      <TableRowSkeleton key={index} isLight={isLight} columns={columns} />
    ))}
  </>
);

export default TableRowSkeleton;

