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
    .spinner-icon {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ee7716;
      border-radius: 50%;
      animation: spinner-spin 0.8s linear infinite;
      display: inline-block;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes spinner-spin {
      to { transform: rotate(360deg); }
    }
    button.loading {
      cursor: not-allowed;
      opacity: 0.8;
    }
  `;
  document.head.appendChild(style);
})();