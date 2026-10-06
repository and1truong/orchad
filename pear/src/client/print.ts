// Only the explicitly prepared, authenticated view is included in browser PDF.
export function printView(element: HTMLElement) {
  document
    .querySelectorAll("[data-print-active]")
    .forEach((node) => node.removeAttribute("data-print-active"));
  element.setAttribute("data-print-active", "true");
  window.print();
}
