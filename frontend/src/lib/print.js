/**
 * Utility functions for printing documents from the viewer.
 */

/**
 * Prints a PDF file by loading it into a hidden iframe.
 * @param {string} pdfUrl - The URL of the PDF document.
 */
export function printPdf(pdfUrl) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = pdfUrl;
  
  document.body.appendChild(iframe);
  
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      
      const cleanup = () => {
        clearTimeout(fallbackTimeout);
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      };
      
      // Clean up immediately when print dialog closes, with a fallback timeout
      iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
      const fallbackTimeout = setTimeout(cleanup, 10000);
      
      iframe.contentWindow.print();
    } catch (err) {
      console.error('Failed to print PDF directly inside iframe', err);
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }
  };
}

/**
 * Prints a list of page images by rendering them inside a hidden iframe.
 * @param {string[]} imageUrls - Array of page image URLs.
 */
export function printImages(imageUrls) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  
  document.body.appendChild(iframe);
  
  const doc = iframe.contentWindow.document;
  doc.title = 'Print Document';

  const style = doc.createElement('style');
  style.textContent = `
    @page {
      size: auto;
      margin: 0;
    }
    body {
      margin: 0;
      padding: 0;
      background: white;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      page-break-after: always;
    }
    img:last-child {
      page-break-after: avoid;
    }
  `;
  doc.head.appendChild(style);

  imageUrls.forEach((url) => {
    const img = doc.createElement('img');
    img.src = url;
    doc.body.appendChild(img);
  });

  const images = doc.getElementsByTagName('img');
  let loadedCount = 0;
  
  const triggerPrintWithCleanup = () => {
    try {
      iframe.contentWindow.focus();
      
      const cleanup = () => {
        clearTimeout(fallbackTimeout);
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      };
      
      iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
      const fallbackTimeout = setTimeout(cleanup, 10000);
      
      iframe.contentWindow.print();
    } catch (err) {
      console.error('Failed to print images', err);
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }
  };

  const checkPrint = () => {
    loadedCount++;
    if (loadedCount === images.length) {
      triggerPrintWithCleanup();
    }
  };

  if (images.length === 0) {
    triggerPrintWithCleanup();
  } else {
    for (let i = 0; i < images.length; i++) {
      if (images[i].complete) {
        checkPrint();
      } else {
        images[i].onload = checkPrint;
        images[i].onerror = checkPrint; // Trigger print dialog even if a page image fails to load
      }
    }
  }
}
