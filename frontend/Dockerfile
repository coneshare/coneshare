# Stage 1: Build the React app
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./
#COPY yarn.lock ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build metadata injected by CI/local make dist.
ARG VITE_APP_VERSION=dev
ARG VITE_GIT_SHA=unknown
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
ENV VITE_GIT_SHA=${VITE_GIT_SHA}

# Build the React app
RUN npm run build
