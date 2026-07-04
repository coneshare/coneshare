package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestHandleDownloadSanitizesFilename(t *testing.T) {
	// Create a temporary storage directory
	tempDir, err := os.MkdirTemp("", "coneshare-test-storage")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Write a dummy file to download
	storageKey := "uploads/test-file.txt"
	fullPath := filepath.Join(tempDir, storageKey)
	err = os.MkdirAll(filepath.Dir(fullPath), 0755)
	if err != nil {
		t.Fatalf("failed to create storage dir structure: %v", err)
	}
	err = os.WriteFile(fullPath, []byte("hello world"), 0644)
	if err != nil {
		t.Fatalf("failed to write dummy file: %v", err)
	}

	config := Config{
		StoragePath: tempDir,
	}

	// Insert a token with a malicious filename containing path traversal
	token := "test-token"
	tokenStore[token] = TokenInfo{
		StorageKey: storageKey,
		Filename:   "../../etc/evil.txt",
		ExpiresAt:  time.Now().Add(1 * time.Hour),
	}

	// Set up router and recorder
	r := chi.NewRouter()
	r.Get("/files/download/{token}", handleDownload(config, "attachment"))

	req := httptest.NewRequest("GET", "/files/download/test-token", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	contentDisposition := w.Header().Get("Content-Disposition")
	expectedHeader := `attachment; filename*=UTF-8''evil.txt`
	if contentDisposition != expectedHeader {
		t.Errorf("expected Content-Disposition %q, got %q", expectedHeader, contentDisposition)
	}
}
