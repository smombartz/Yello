import { useContext } from 'react';
import { ImportStatusContext } from '../contexts/importStatusContextValue';

export function useImportStatus() {
  const context = useContext(ImportStatusContext);
  if (!context) {
    throw new Error('useImportStatus must be used within an ImportStatusProvider');
  }
  return context;
}
