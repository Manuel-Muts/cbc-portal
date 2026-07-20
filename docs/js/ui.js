document.addEventListener("DOMContentLoaded", () => {
    const isInstalledApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || window.location.search.includes('source=pwa');

    if (isInstalledApp) {
        const splash = document.createElement('div');
        splash.id = 'appSplash';
        splash.setAttribute('aria-hidden', 'true');
        splash.innerHTML = `
            <div class="app-splash-badge">CH</div>
            <div class="app-splash-title">CompetenceHub</div>
        `;
        document.body.appendChild(splash);

        requestAnimationFrame(() => {
            splash.classList.add('visible');
        });

        setTimeout(() => {
            splash.classList.remove('visible');
            setTimeout(() => splash.remove(), 400);
        }, 1400);
    }

    // --- 1. MOBILE MENU ---
 const toggle = document.getElementById("menuToggle");
const menu = document.getElementById("navMenu");
const overlay = document.getElementById("menuOverlay");

    // --- 1A. OFFLINE / NO INTERNET FALLBACK ---
    let offlineNoticeShown = false;
    let offlineToastShown = false;

    const offlineNotice = document.createElement('div');
    offlineNotice.id = 'offlineNotice';
    offlineNotice.setAttribute('role', 'status');
    offlineNotice.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div>
          <strong style="display:block;">No internet connection</strong>
          <span style="font-size:0.92rem;opacity:0.95;">Some pages may load slowly or appear incomplete until you reconnect.</span>
        </div>
        <button type="button" id="offlineNoticeClose" style="border:none;background:rgba(255,255,255,0.18);color:white;border-radius:999px;padding:7px 10px;cursor:pointer;font-weight:700;">×</button>
      </div>
    `;
    offlineNotice.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:13000;width:min(92vw, 520px);background:linear-gradient(135deg,#b45309,#dc2626);color:white;padding:12px 14px;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,0.25);display:none;';
    document.body.appendChild(offlineNotice);

    const showOfflineNotice = () => {
        if (offlineNoticeShown) return;
        offlineNoticeShown = true;
        offlineNotice.style.display = 'block';
        showToast('No internet connection. Some features may be unavailable.', 'warning');
        offlineToastShown = true;
    };

    const hideOfflineNotice = () => {
        offlineNoticeShown = false;
        offlineNotice.style.display = 'none';
    };

    if (!navigator.onLine) {
        showOfflineNotice();
    }

    window.addEventListener('offline', () => {
        showOfflineNotice();
    });

    window.addEventListener('online', () => {
        hideOfflineNotice();
        if (!offlineToastShown) {
            showToast('Connection restored.', 'success');
        }
        offlineToastShown = false;
    });

    const closeOfflineNoticeBtn = document.getElementById('offlineNoticeClose');
    if (closeOfflineNoticeBtn) {
        closeOfflineNoticeBtn.addEventListener('click', () => {
            hideOfflineNotice();
        });
    }

    // --- 1A. PWA INSTALL PROMPT (Only on landing page) ---
    // 🆕 Check if this is the landing page (/) to avoid showing on dashboards
    const isLandingPage = window.location.pathname === '/' || window.location.pathname === '/index.html';
    
    if (isLandingPage) {
        const installPromptState = {
            deferredPrompt: null,
            isInstalled: false,
            dismissed: false,
            bannerVisible: false,
            installCompleteNotified: false
        };

        if (!document.querySelector('link[rel="manifest"]')) {
            const manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            manifestLink.href = '/manifest.json';
            document.head.appendChild(manifestLink);
        }

        if (!document.querySelector('meta[name="theme-color"]')) {
            const themeMeta = document.createElement('meta');
            themeMeta.name = 'theme-color';
            themeMeta.content = '#0f766e';
            document.head.appendChild(themeMeta);
        }

        const installBanner = document.createElement('div');
        installBanner.id = 'pwaInstallBanner';
        installBanner.innerHTML = `
          <div class="pwa-install-card">
            <div>
              <strong>Install CompetenceHub</strong>
              <p>Open it as an app for faster access on your device.</p>
            </div>
            <div class="pwa-install-actions">
              <button id="pwaInstallBtn" class="pwa-install-btn">Install</button>
              <button id="pwaDismissBtn" class="pwa-dismiss-btn">Later</button>
            </div>
          </div>
        `;
        installBanner.style.display = 'none';
        document.body.appendChild(installBanner);

        const installFab = document.createElement('button');
        installFab.id = 'pwaInstallFab';
        installFab.className = 'pwa-install-fab';
        installFab.type = 'button';
        installFab.textContent = '⬇ Install App';
        installFab.style.display = 'none';
        document.body.appendChild(installFab);

        const showInstallBanner = () => {
            if (installPromptState.isInstalled || installPromptState.dismissed || installPromptState.bannerVisible) return;
            installPromptState.bannerVisible = true;
            installBanner.style.display = 'block';
            installFab.style.display = 'inline-flex';
        };

        const hideInstallBanner = () => {
            installPromptState.bannerVisible = false;
            installBanner.style.display = 'none';
        };

        const handleInstall = async () => {
            if (installPromptState.deferredPrompt) {
                installPromptState.deferredPrompt.prompt();
                const { outcome } = await installPromptState.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installPromptState.isInstalled = true;
                }
                installPromptState.deferredPrompt = null;
                hideInstallBanner();
                installFab.style.display = 'none';
                return;
            }

            if (!installPromptState.isInstalled) {
                showToast('Install is available from your browser menu when the app is ready.', 'info');
            }
        };

        const installBtn = installBanner.querySelector('#pwaInstallBtn');
        const dismissBtn = installBanner.querySelector('#pwaDismissBtn');
        if (installBtn) installBtn.addEventListener('click', handleInstall);
        if (dismissBtn) dismissBtn.addEventListener('click', () => {
            installPromptState.dismissed = true;
            hideInstallBanner();
            installFab.style.display = 'none';
        });

        installFab.addEventListener('click', handleInstall);

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            installPromptState.deferredPrompt = event;
            installFab.style.display = 'inline-flex';
            setTimeout(showInstallBanner, 1200);
        });

        window.addEventListener('appinstalled', () => {
            installPromptState.isInstalled = true;
            installFab.style.display = 'none';
            hideInstallBanner();
            if (!installPromptState.installCompleteNotified) {
                installPromptState.installCompleteNotified = true;
                showToast('Installation complete. Open the app anytime from your device home screen.', 'success');
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && installPromptState.deferredPrompt && !installPromptState.isInstalled && !installPromptState.dismissed) {
                installFab.style.display = 'inline-flex';
                showInstallBanner();
            }
        });

        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            installPromptState.isInstalled = true;
        }
    }

if (toggle) {
  toggle.addEventListener("click", () => {
    if (menu) menu.classList.toggle("active");
    if (overlay) overlay.classList.toggle("active");
  });
}

if (overlay) {
  overlay.addEventListener("click", () => {
    if (menu) menu.classList.remove("active");
    overlay.classList.remove("active");
  });
}
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
// --- 5. Clean URL Enforcement ---
    // If the URL ends with .html, redirect to the clean URL
    const currentPath = window.location.pathname;
    if (currentPath.endsWith('.html')) {
        let cleanPath = currentPath.replace(/\.html$/, '');
        
        // Specific mappings for dashboards to reach the "extra clean" paths you want
        const dashboardMappings = {
            '/teacher-dashboard': '/teacher',
            '/student-dashboard': '/student',
            '/dean-dashboard': '/dean',
            '/studentstudymaterial': '/study-materials'
        };

        window.location.replace((dashboardMappings[cleanPath] || cleanPath) + window.location.search + window.location.hash);
    }
    revealElements.forEach(el => revealObserver.observe(el));
    
    // Immediately reveal first section
    if (revealElements[0]) revealElements[0].classList.add('active');
});

// Inject global UI styles for toasts, modals, and common tables
(function injectGlobalUIStyles() {
  if (document.getElementById('global-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'global-ui-styles';
  style.textContent = `
    /* Modern Toast & Confirm Styles */
    #toastContainer {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .toast {
      padding: 12px 18px;
      border-radius: 8px;
      color: white !important;
      font-weight: 600;
      font-size: 0.9rem;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      min-width: 250px;
      transform: translateX(0);
      transition: all 0.35s ease;
    }
    .toast-success { background: #38a169 !important; border-left: 5px solid #22543d; }
    .toast-error { background: #e53e3e !important; border-left: 5px solid #742a2a; }
    .toast-info { background: #3182ce !important; border-left: 5px solid #2a4365; }
    .toast-warning { background: #d69e2e !important; border-left: 5px solid #975a16; }
    .toast.hiding { opacity: 0; transform: translateX(50px); }

    .confirm-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center;
      z-index: 11000; opacity: 0; visibility: hidden; transition: all 0.3s ease;
    }
    .confirm-overlay.visible { opacity: 1; visibility: visible; }
    .confirm-box {
      background: white; padding: 30px; border-radius: 16px; width: 90%; max-width: 400px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); transform: scale(0.9);
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); text-align: center;
    }
    .confirm-overlay.visible .confirm-box { transform: scale(1); }
    .confirm-box h4 { margin: 0 0 10px; font-size: 1.3rem; font-weight: 800; color: #1a202c; }
    .confirm-box p { margin: 0 0 25px; color: #4a5568; line-height: 1.6; }
    .confirm-buttons { display: flex; justify-content: center; gap: 15px; }
    .confirm-buttons .btn { padding: 10px 24px; font-size: 0.95rem; font-weight: 700; border-radius: 10px; border: none; cursor: pointer; }

    /* Generic .marks-table styles for consistency across dashboards */
    .marks-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .marks-table th, .marks-table td {
      padding: 8px 12px;
      border: 1px solid #e2e8f0; /* Light gray border */
      text-align: left;
      vertical-align: middle;
    }
    .marks-table th {
      background-color: #f8fafc; /* Light background for headers */
      font-weight: 700;
      color: #475569; /* Darker text for headers */
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.025em;
    }
    .marks-table tbody tr:nth-child(even) {
      background-color: #fdfdfd; /* Slightly different background for even rows */
    }
    .marks-table tbody tr:hover {
      background-color: #f0f4f8; /* Hover effect */
    }
    .marks-table tfoot {
      background-color: #f8fafc;
      font-weight: bold;
      border-top: 2px solid #cbd5e0;
    }

    /* PWA install banner */
    #pwaInstallBanner {
      position: fixed;
      left: 50%;
      top: 20px;
      transform: translateX(-50%);
      z-index: 12000;
      width: min(92vw, 480px);
    }
    .pwa-install-card {
      background: linear-gradient(135deg, #0f766e, #2563eb);
      color: white;
      border-radius: 14px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.25);
    }
    .pwa-install-card p { margin: 4px 0 0; font-size: 0.9rem; opacity: 0.95; }
    .pwa-install-actions { display: flex; gap: 8px; }
    .pwa-install-btn, .pwa-dismiss-btn {
      border: none;
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .pwa-install-btn { background: white; color: #0f172a; }
    .pwa-dismiss-btn { background: rgba(255,255,255,0.16); color: white; }

    .pwa-install-fab {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 12001;
      border: none;
      border-radius: 999px;
      padding: 12px 16px;
      background: linear-gradient(135deg, #0f766e, #2563eb);
      color: white;
      font-weight: 800;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
      cursor: pointer;
    }

    /* 🔐 Password Toggle Styles - Injected for Production Stability */
    .password-input-wrapper {
      position: relative !important;
      width: 100% !important;
      display: block !important;
    }
    .toggle-password-icon {
      position: absolute !important;
      right: 12px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      cursor: pointer !important;
      color: #64748b !important;
      z-index: 20 !important;
      font-size: 1.1rem !important;
      transition: color 0.2s ease;
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
      line-height: 1 !important;
    }
    .toggle-password-icon:hover {
      color: #1e293b !important;
    }
  `;
  document.head.appendChild(style);

  // 🆕 Ensure FontAwesome is available for the eye icon in production
  if (!document.querySelector('link[href*="font-awesome"]') && !document.querySelector('script[src*="font-awesome"]')) {
    const fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fa);
  }
})();
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
    container.style.zIndex = "99999"; // High z-index to stay above scheduling modals
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

// --- 4. ASSESSMENT MAPPING ---
const ASSESSMENT_MAPPING = {
  1: "Opener",
  2: "Assessment 2",
  3: "Assessment 3",
  4: "Assessment 4",
  5: "Midterm",
  6: "Assessment 6",
  7: "Assessment 7",
  8: "Endterm"
};

// Make functions global
window.showToast = showToast;
window.showConfirm = showConfirm;
window.ASSESSMENT_MAPPING = ASSESSMENT_MAPPING;

// 🆕 SERVICE WORKER REGISTRATION
// Pre-caches external libraries to ensure they are available offline and speed up PDF generation.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('🚀 Service Worker registered successfully');
        }).catch(err => {
            console.error('❌ Service Worker registration failed:', err);
        });
    });
}