export function clickOutside(node: HTMLElement, callback: () => void) {
  const handle = (e: MouseEvent) => {
    if (!node.contains(e.target as Node)) callback();
  };
  document.addEventListener('click', handle, true);
  return {
    destroy() {
      document.removeEventListener('click', handle, true);
    },
  };
}
