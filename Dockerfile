# Build stage for frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build stage for backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies only
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3456
ENV AUTH_DATABASE_PATH=/data/auth.db
ENV USER_DATA_PATH=/data/users

EXPOSE 3456

# Create data directories at runtime (handles Railway volume mounts)
CMD ["sh", "-c", "mkdir -p /data/users && node dist/server.js"]
