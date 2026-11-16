/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Vendor & shared chunking strategy: isolate heavy libraries and group shared primitives for optimal caching and on-demand loading
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React runtime and routing core (global app baseline, long-term cacheable)
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
              return 'vendor-react';
            }
            // HLS.js video streaming library (~500KB+, dynamically loaded on video preview)
            if (id.includes('node_modules/hls.js')) {
              return 'vendor-hls';
            }
            // PDF.js rendering engine (~400KB+, dynamically loaded on PDF preview)
            if (id.includes('node_modules/pdfjs-dist')) {
              return 'vendor-pdfjs';
            }
            // Drag-and-drop utilities (only loaded on admin / reordering pages)
            if (id.includes('node_modules/@dnd-kit')) {
              return 'vendor-dndkit';
            }
            // Lucide icons (consolidated to avoid generating dozens of sub-1KB icon chunks)
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            // Radix UI primitives (consolidate common modals, popovers, and dropdown menus)
            if (id.includes('node_modules/@radix-ui')) {
              return 'vendor-ui';
            }
          }
          // Shared internal UI primitives (Input, Label, Badge, FileTypeIcon, etc.)
          // Grouping into a dedicated chunk prevents Rollup from fragmenting small components or accidentally merging them into admin routes
          if (id.includes('/src/components/ui/') || id.includes('/src/components/documents/FileTypeIcon') || id.includes('/src/components/common/LanguagePicker')) {
            return 'shared-ui';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/.well-known/oauth-authorization-server': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/files': {
        target: 'http://core:8080',
        changeOrigin: true,
      },      
    },
  },  
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/tests/setup.js",
    include: ["src/tests/**/*.test.{js,jsx}", ],
  },
});
