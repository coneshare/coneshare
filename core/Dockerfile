# ---- Build Stage ----
FROM golang:1.26-alpine AS builder

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
WORKDIR /app
COPY --from=builder /app/server .
CMD ["./server"]
