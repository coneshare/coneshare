package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

type Config struct {
	StoragePath      string
	InternalAPIToken string
	ServerPort       string
}

type URLRequest struct {
	StorageKey string `json:"storage_key"`
}

type URLResponse struct {
	URL string `json:"url"`
}

type CopyFileRequest struct {
	SourceStorageKey      string `json:"source_storage_key"`
	DestinationStorageKey string `json:"destination_storage_key"`
}

type TokenInfo struct {
	StorageKey string
	ExpiresAt  time.Time
}

// TODO: The tokenStore is a global in-memory map. This approach has two main drawbacks:
//    Scalability: The service is stateful. If you need to run multiple instances for high availability or load balancing, they won't share the token state, causing requests to fail depending on which instance they hit.
//    Testability: Global state makes parallel testing difficult and can lead to flaky tests.
// Consider encapsulating the token store and its lock within a struct that can be passed to handlers. For production scalability, might eventually need to move this state to a shared store like Redis.
var (
	tokenStore = make(map[string]TokenInfo)
	storeLock  = sync.RWMutex{}
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, using environment variables")
	}

	config := loadConfig()

	// Start a background goroutine to clean up expired tokens
	go cleanupExpiredTokens()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Internal API routes, protected by a shared token
	r.Route("/internal/v1", func(r chi.Router) {
		r.Use(AuthMiddleware(config.InternalAPIToken))
		r.Post("/generate-upload-url", generateURLHandler("upload"))
		r.Post("/generate-download-url", generateURLHandler("download"))
		r.Post("/delete-file", deleteFileHandler(config))
		r.Post("/copy-file", copyFileHandler(config))
	})

	// Public routes for file handling
	r.Put("/files/upload/{token}", handleUpload(config))
	r.Get("/files/download/{token}", handleDownload(config))

	log.Printf("Starting file server on port %s", config.ServerPort)
	if err := http.ListenAndServe(":"+config.ServerPort, r); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func loadConfig() Config {
	return Config{
		StoragePath:      getEnv("STORAGE_PATH", "/storage"),
		InternalAPIToken: getEnv("INTERNAL_API_TOKEN", ""),
		ServerPort:       getEnv("PORT", "8080"),
	}
}

func generateURLHandler(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var reqBody URLRequest
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if reqBody.StorageKey == "" {
			http.Error(w, "storage_key is required", http.StatusBadRequest)
			return
		}

		token := uuid.New().String()
		expiry := time.Now().Add(1 * time.Hour)

		storeLock.Lock()
		tokenStore[token] = TokenInfo{
			StorageKey: reqBody.StorageKey,
			ExpiresAt:  expiry,
		}
		storeLock.Unlock()

		url := filepath.Join("/files", action, token)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(URLResponse{URL: url})
	}
}

func handleUpload(config Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")

		storeLock.Lock()
		info, ok := tokenStore[token]
		if ok {
			delete(tokenStore, token) // Token is single-use
		}
		storeLock.Unlock()

		if !ok || time.Now().After(info.ExpiresAt) {
			http.Error(w, "Invalid or expired upload token", http.StatusForbidden)
			return
		}

		filePath := filepath.Join(config.StoragePath, info.StorageKey)

		// Security check to prevent path traversal.
		storageRoot, err := filepath.Abs(config.StoragePath)
		if err != nil {
			log.Printf("Configuration error: invalid storage path: %v", err)
			http.Error(w, "Internal server error due to server configuration", http.StatusInternalServerError)
			return
		}
		safePrefix := storageRoot + string(os.PathSeparator)

		cleanPath, err := filepath.Abs(filePath)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !strings.HasPrefix(cleanPath, safePrefix) {
			http.Error(w, "Forbidden: path traversal attempt", http.StatusForbidden)
			return
		}

		dir := filepath.Dir(filePath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Printf("Error creating directory %s: %v", dir, err)
			http.Error(w, "Could not create storage directory", http.StatusInternalServerError)
			return
		}

		outFile, err := os.Create(filePath)
		if err != nil {
			log.Printf("Error creating file %s: %v", filePath, err)
			http.Error(w, "Could not save file", http.StatusInternalServerError)
			return
		}
		defer outFile.Close()

		_, err = io.Copy(outFile, r.Body)
		if err != nil {
			log.Printf("Error writing file %s: %v", filePath, err)
			http.Error(w, "Failed to write file content", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func deleteFileHandler(config Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var reqBody URLRequest
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if reqBody.StorageKey == "" {
			http.Error(w, "storage_key is required", http.StatusBadRequest)
			return
		}

		filePath := filepath.Join(config.StoragePath, reqBody.StorageKey)

		// Security check to prevent path traversal.
		storageRoot, err := filepath.Abs(config.StoragePath)
		if err != nil {
			log.Printf("Configuration error: invalid storage path: %v", err)
			http.Error(w, "Internal server error due to server configuration", http.StatusInternalServerError)
			return
		}
		safePrefix := storageRoot + string(os.PathSeparator)

		cleanPath, err := filepath.Abs(filePath)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !strings.HasPrefix(cleanPath, safePrefix) {
			http.Error(w, "Forbidden: path traversal attempt", http.StatusForbidden)
			return
		}

		err = os.Remove(filePath)
		if err != nil {
			if os.IsNotExist(err) {
				// Not an error if file is already gone
				w.WriteHeader(http.StatusNoContent)
				return
			}
			log.Printf("Error deleting file %s: %v", filePath, err)
			http.Error(w, "Could not delete file", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func copyFileHandler(config Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var reqBody CopyFileRequest
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if reqBody.SourceStorageKey == "" || reqBody.DestinationStorageKey == "" {
			http.Error(w, "source_storage_key and destination_storage_key are required", http.StatusBadRequest)
			return
		}

		sourcePath := filepath.Join(config.StoragePath, reqBody.SourceStorageKey)
		destPath := filepath.Join(config.StoragePath, reqBody.DestinationStorageKey)

		// Security check to prevent path traversal.
		storageRoot, err := filepath.Abs(config.StoragePath)
		if err != nil {
			log.Printf("Configuration error: invalid storage path: %v", err)
			http.Error(w, "Internal server error due to server configuration", http.StatusInternalServerError)
			return
		}
		safePrefix := storageRoot + string(os.PathSeparator)

		cleanSourcePath, err := filepath.Abs(sourcePath)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		cleanDestPath, err := filepath.Abs(destPath)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !strings.HasPrefix(cleanSourcePath, safePrefix) || !strings.HasPrefix(cleanDestPath, safePrefix) {
			http.Error(w, "Forbidden: path traversal attempt", http.StatusForbidden)
			return
		}

		sourceFile, err := os.Open(sourcePath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Source file not found", http.StatusNotFound)
				return
			}
			log.Printf("Error opening source file %s: %v", sourcePath, err)
			http.Error(w, "Could not open source file", http.StatusInternalServerError)
			return
		}
		defer sourceFile.Close()

		destDir := filepath.Dir(destPath)
		if err := os.MkdirAll(destDir, 0755); err != nil {
			log.Printf("Error creating destination directory %s: %v", destDir, err)
			http.Error(w, "Could not create storage directory", http.StatusInternalServerError)
			return
		}

		destFile, err := os.Create(destPath)
		if err != nil {
			log.Printf("Error creating destination file %s: %v", destPath, err)
			http.Error(w, "Could not create destination file", http.StatusInternalServerError)
			return
		}
		defer destFile.Close()

		_, err = io.Copy(destFile, sourceFile)
		if err != nil {
			log.Printf("Error copying file from %s to %s: %v", sourcePath, destPath, err)
			http.Error(w, "Failed to copy file content", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}

func handleDownload(config Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := chi.URLParam(r, "token")

		storeLock.RLock()
		info, ok := tokenStore[token]
		storeLock.RUnlock()

		if !ok || time.Now().After(info.ExpiresAt) {
			http.Error(w, "Invalid or expired download link", http.StatusForbidden)
			return
		}

		filePath := filepath.Join(config.StoragePath, info.StorageKey)

		// Security check to prevent path traversal.
		storageRoot, err := filepath.Abs(config.StoragePath)
		if err != nil {
			log.Printf("Configuration error: invalid storage path: %v", err)
			http.Error(w, "Internal server error due to server configuration", http.StatusInternalServerError)
			return
		}
		safePrefix := storageRoot + string(os.PathSeparator)

		cleanPath, err := filepath.Abs(filePath)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !strings.HasPrefix(cleanPath, safePrefix) {
			http.Error(w, "Forbidden: path traversal attempt", http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(filePath)+"\"")
		http.ServeFile(w, r, filePath)
	}
}

func cleanupExpiredTokens() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		storeLock.Lock()
		for token, info := range tokenStore {
			if time.Now().After(info.ExpiresAt) {
				delete(tokenStore, token)
			}
		}
		storeLock.Unlock()
	}
}

func AuthMiddleware(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
if token == "" {
	log.Println("Critical: INTERNAL_API_TOKEN is not set. Auth is required and is being enforced.")
	http.Error(w, "Forbidden", http.StatusForbidden)
	return
}
			authHeader := r.Header.Get("Authorization")
			if authHeader != "Bearer "+token {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
