# ---- Build Stage ----
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod go.sum ./

# Download all dependencies. This step is cached as long as go.mod/go.sum don't change.
RUN go mod download

# Copy the source code
COPY . .

# Build the Go app. CGO_ENABLED=0 is important for a static binary.
RUN CGO_ENABLED=0 GOOS=linux go build -v -o /app/server .


# ---- Final Stage ----
FROM alpine:latest

# It's a good practice to run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy the pre-built binary from the builder stage
COPY --from=builder /app/server .

# Change ownership of the app directory
USER appuser

# Expose port 8080
EXPOSE 8080

# Command to run the executable
CMD ["./server"]
