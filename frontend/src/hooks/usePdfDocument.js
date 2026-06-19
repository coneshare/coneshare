import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from '../pdf-worker-polyfill.js?worker&url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export function usePdfDocument(pdfUrl) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      setNumPages(0);
      setPageDimensions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setError(null);

    const headers = {};
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      withCredentials: true,
      httpHeaders: headers,
    });

    loadingTask.promise.then(
      async (doc) => {
        if (isCancelled) {
          doc.destroy();
          return;
        }

        try {
          const dims = [];
          for (let i = 1; i <= doc.numPages; i++) {
            if (isCancelled) {
              doc.destroy();
              return;
            }
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1 });
            dims.push({ width: viewport.width, height: viewport.height });
          }

          if (!isCancelled) {
            setPageDimensions(dims);
            setPdfDoc(doc);
            setNumPages(doc.numPages);
            setLoading(false);
          }
        } catch (dimError) {
          console.error('Failed to load page dimensions:', dimError);
          // Fall back to loading the doc without dimensions
          if (!isCancelled) {
            setPdfDoc(doc);
            setNumPages(doc.numPages);
            setLoading(false);
          }
        }
      },
      (err) => {
        if (!isCancelled) {
          console.error('Failed to load PDF document:', err);
          setError(err);
          setLoading(false);
        }
      }
    );

    return () => {
      isCancelled = true;
      loadingTask.destroy();
    };
  }, [pdfUrl]);

  return { pdfDoc, numPages, pageDimensions, loading, error };
}

