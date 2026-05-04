document.addEventListener("DOMContentLoaded", () => {
    // --- 1. MOBILE MENU ---
 const toggle = document.getElementById("menuToggle");
const menu = document.getElementById("navMenu");
const overlay = document.getElementById("menuOverlay");

toggle.addEventListener("click", () => {
  menu.classList.toggle("active");
  overlay.classList.toggle("active");
});

overlay.addEventListener("click", () => {
  menu.classList.remove("active");
  overlay.classList.remove("active");
});
    // --- 2. RELIABILITY SLIDER ---
    const sliderContainers = document.querySelectorAll('.slider-container');
    
    sliderContainers.forEach(container => {
        const slides = container.querySelectorAll('.slide');
        const dotsContainer = container.querySelector('.slider-dots');
        let currentSlide = 0;
        let slideInterval;

        if (slides.length > 0 && dotsContainer) {
            // Create dots
            slides.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.classList.add('dot');
                if (i === 0) dot.classList.add('active');
                dot.addEventListener('click', () => goToSlide(i));
                dotsContainer.appendChild(dot);
            });

            function goToSlide(n) {
                const dots = dotsContainer.querySelectorAll('.dot');
                slides[currentSlide].classList.remove('active');
                if (dots[currentSlide]) dots[currentSlide].classList.remove('active');
                currentSlide = (n + slides.length) % slides.length;
                slides[currentSlide].classList.add('active');
                if (dots[currentSlide]) dots[currentSlide].classList.add('active');
            }

            function nextSlide() {
                goToSlide(currentSlide + 1);
            }

            // Auto play slider every 5 seconds
            const startAutoPlay = () => slideInterval = setInterval(nextSlide, 5000);
            startAutoPlay();

            // Pause on hover
            container.addEventListener('mouseenter', () => clearInterval(slideInterval));
            container.addEventListener('mouseleave', startAutoPlay);
        }
    });

    // --- 3. SCROLL REVEAL ANIMATION ---
    const revealElements = document.querySelectorAll('.reveal');
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Once revealed, no need to track anymore
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15
    });

    revealElements.forEach(el => revealObserver.observe(el));
    
    // Immediately reveal first section
    if (revealElements[0]) revealElements[0].classList.add('active');
});
// docs/js/ui-utils.js

/**
 * Displays a toast notification.
 * @param {string} message - The message to display.
 * @param {'success' | 'error' | 'info'} type - The type of toast (determines color).
 */
function showToast(message, type = "success") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = message;
  container.appendChild(t);
  // The CSS animation 'fadeInOut' in teachers.css handles the fade-out.
  // We remove the element from the DOM slightly after the animation completes (3.5s animation).
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3800); // Remove after 3.8 seconds
}

/**
 * Displays a custom confirmation modal.
 * @param {string|object} messageOrOptions - The message or options object.
 * @param {string} [confirmText='Confirm'] - Text for the confirmation button.
 * @param {string} [cancelText='Cancel'] - Text for the cancel button.
 * @param {string} [confirmBtnClass='danger-btn'] - CSS class for the confirm button.
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled.
 */
function showConfirm(messageOrOptions, confirmText = 'Confirm', cancelText = 'Cancel', confirmBtnClass = 'danger-btn') {
  let message, title = 'Confirm Action';
  if (typeof messageOrOptions === 'object') {
    ({ message = 'Are you sure?', title = 'Confirm', confirmText = 'Yes', cancelText = 'No' } = messageOrOptions);
    confirmBtnClass = 'primary-btn'; // Default for object calls
  } else {
    message = messageOrOptions;
  }
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-box">
        <h4>${title}</h4>
        <p>${message}</p>
        <div class="confirm-buttons">
          <button class="btn secondary-btn" id="confCancel">${cancelText}</button>
          <button class="btn ${confirmBtnClass}" id="confOk">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    const close = (val) => {
      overlay.classList.remove('visible');
      setTimeout(() => { overlay.remove(); resolve(val); }, 300);
    };
    overlay.querySelector("#confCancel").onclick = () => close(false);
    overlay.querySelector("#confOk").onclick = () => close(true);
  });
}

// Make functions global
window.showToast = showToast;
window.showConfirm = showConfirm;