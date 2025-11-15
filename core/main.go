package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Config struct {
	MinioEndpoint        string
	MinioAccessKeyID     string
	MinioSecretAccessKey string
	MinioBucketName      string
	MinioUseSSL          bool
	InternalAPIToken     string
	ServerPort           string
}

type APIResponse struct {
	URL string `json:"url"`
}

type URLRequest struct {
	StorageKey string `json:"storage_key"`
}

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, using environment variables")
	}

	config := loadConfig()
	minioClient, err := initMinioClient(config)
	if err != nil {
		log.Fatalf("Failed to initialize MinIO client: %v", err)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Internal API routes, protected by a shared token
	r.Route("/internal/v1", func(r chi.Router) {
		r.Use(AuthMiddleware(config.InternalAPIToken))
		r.Post("/generate-upload-url", generatePresignedURLHandler(minioClient, config, "put"))
		r.Post("/generate-download-url", generatePresignedURLHandler(minioClient, config, "get"))
	})

	log.Printf("Starting file server on port %s", config.ServerPort)
	if err := http.ListenAndServe(":"+config.ServerPort, r); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func loadConfig() Config {
	return Config{
		MinioEndpoint:        getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinioAccessKeyID:     getEnv("MINIO_ROOT_USER", ""),
		MinioSecretAccessKey: getEnv("MINIO_ROOT_PASSWORD", ""),
		MinioBucketName:      getEnv("MINIO_BUCKET_NAME", "coneshare"),
		MinioUseSSL:          getEnvAsBool("MINIO_USE_SSL", false),
		InternalAPIToken:     getEnv("INTERNAL_API_TOKEN", ""),
		ServerPort:           getEnv("PORT", "8080"),
	}
}

func initMinioClient(config Config) (*minio.Client, error) {
	return minio.New(config.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(config.MinioAccessKeyID, config.MinioSecretAccessKey, ""),
		Secure: config.MinioUseSSL,
	})
}

func generatePresignedURLHandler(minioClient *minio.Client, config Config, method string) http.HandlerFunc {
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

		expiry := time.Hour * 1 // URLs are valid for 1 hour

		var presignedURL *url.URL
		var err error

		ctx := context.Background()

		if method == "put" {
			presignedURL, err = minioClient.PresignedPutObject(ctx, config.MinioBucketName, reqBody.StorageKey, expiry)
		} else { // "get"
			presignedURL, err = minioClient.PresignedGetObject(ctx, config.MinioBucketName, reqBody.StorageKey, expiry, nil)
		}

		if err != nil {
			log.Printf("Error generating presigned URL for key %s: %v", reqBody.StorageKey, err)
			http.Error(w, "Could not generate URL", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(APIResponse{URL: presignedURL.String()})
	}
}

func AuthMiddleware(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if token == "" {
				log.Println("Warning: INTERNAL_API_TOKEN is not set. Disabling auth.")
				next.ServeHTTP(w, r)
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

func getEnvAsBool(key string, fallback bool) bool {
	if value, ok := os.LookupEnv(key); ok {
		return value == "true"
	}
	return fallback
}
