(function initializeDeanReportQrCode() {
  async function createDataUrl(value) {
    if (typeof window.QRCode !== 'function') {
      throw new Error('QR code library is unavailable. Check your connection and try again.');
    }

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    document.body.appendChild(container);

    try {
      new window.QRCode(container, {
        text: value,
        width: 256,
        height: 256,
        correctLevel: window.QRCode.CorrectLevel.M
      });

      const canvas = container.querySelector('canvas');
      if (canvas) return canvas.toDataURL('image/png');

      const image = container.querySelector('img');
      if (!image) throw new Error('QR code could not be generated.');
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('QR code image could not be generated.'));
        });
      }
      return image.src;
    } finally {
      container.remove();
    }
  }

  function verificationUrl(token) {
    const url = new URL('/report-verification', window.location.origin);
    url.searchParams.set('token', token);
    return url.toString();
  }

  window.DeanReportQrCode = { createDataUrl, verificationUrl };
})();
