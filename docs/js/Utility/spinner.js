/**
 * Spinner Utility
 * Provides a simple way to add/remove loading spinners to buttons and other elements.
 */
window.spinner = {
  /**
   * Shows a spinner inside the target element.
   * @param {HTMLElement} el - The element to add the spinner to.
   * @param {string} [text] - Optional text to show alongside the spinner.
   */
  show: function(el, text = "") {
    if (!el || el.classList.contains('loading')) return;

    // Store original HTML and width to prevent layout shifts
    el.dataset.originalHtml = el.innerHTML;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      el.style.minWidth = `${rect.width}px`;
    }
    
    el.classList.add('loading');
    el.disabled = true;

    el.innerHTML = `
      <span class="spinner-icon"></span>
      ${text ? `<span class="spinner-text">${text}</span>` : ""}
    `;
  },

  /**
   * Hides the spinner and restores the element's original content.
   * @param {HTMLElement} el - The element to remove the spinner from.
   */
  hide: function(el) {
    if (!el || !el.classList.contains('loading')) return;

    if (el.dataset.originalHtml !== undefined) {
      el.innerHTML = el.dataset.originalHtml;
      delete el.dataset.originalHtml;
    }
    
    el.style.minWidth = "";
    el.classList.remove('loading');
    el.disabled = false;
  }
};

// Inject global spinner styles
(function injectSpinnerStyles() {
  if (document.getElementById('spinner-utility-styles')) return;
  const style = document.createElement('style');
  style.id = 'spinner-utility-styles';
  style.textContent = `
    .spinner-icon, .spinner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid rgba(148, 163, 184, 0.28) !important;
      border-top-color: #ffffff !important;
      border-right-color: #60a5fa !important;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08), 0 0 18px rgba(96, 165, 250, 0.28);
      animation: spinner-spin 0.9s linear infinite, spinner-pulse 1.8s ease-in-out infinite;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(96,165,250,0.12));
    }
    .spinner-icon::before, .spinner::before {
      content: "";
      position: absolute;
      inset: -30%;
      background: linear-gradient(120deg, transparent 32%, rgba(255,255,255,0.6) 48%, transparent 62%);
      transform: translateX(-120%) rotate(18deg);
      animation: spinner-sweep 1.6s ease-in-out infinite;
    }
    .spinner-icon::after, .spinner::after {
      content: "";
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.4);
      opacity: 0.8;
    }
    @keyframes spinner-spin {
      0% { transform: rotate(0deg) scale(1); }
      50% { transform: rotate(180deg) scale(1.06); }
      100% { transform: rotate(360deg) scale(1); }
    }
    @keyframes spinner-pulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08), 0 0 12px rgba(96, 165, 250, 0.2); }
      50% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12), 0 0 22px rgba(96, 165, 250, 0.36); }
    }
    @keyframes spinner-sweep {
      0% { transform: translateX(-120%) rotate(18deg); opacity: 0; }
      18% { opacity: 1; }
      70% { opacity: 1; }
      100% { transform: translateX(120%) rotate(18deg); opacity: 0; }
    }
    button.loading {
      cursor: not-allowed;
      opacity: 0.9;
      box-shadow: 0 10px 22px rgba(59, 130, 246, 0.16);
      animation: button-loading-pulse 1.8s ease-in-out infinite;
    }
    @keyframes button-loading-pulse {
      0%, 100% { box-shadow: 0 10px 22px rgba(59, 130, 246, 0.12); }
      50% { box-shadow: 0 12px 26px rgba(59, 130, 246, 0.22); }
    }
  `;
  document.head.appendChild(style);
})();