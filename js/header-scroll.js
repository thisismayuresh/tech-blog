/**
 * Adds `.site-header-scrolled` once content has moved under the sticky
 * liquid-glass header (stronger cast shadow). Passive scroll only.
 */
export function initHeaderScrollState() {
  const headerElement = document.querySelector('.site-header');

  if (headerElement === null) {
    return;
  }

  const updateHeaderState = () => {
    const isScrolled = window.scrollY > 8;
    headerElement.classList.toggle('site-header-scrolled', isScrolled);
  };

  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });
}
