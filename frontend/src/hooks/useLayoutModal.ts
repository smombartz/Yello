// Hook for child components to signal modal state
export function useLayoutModal() {
  return {
    setModalOpen: (open: boolean) => {
      window.dispatchEvent(new CustomEvent('layout-modal-change', { detail: { open } }));
    }
  };
}
