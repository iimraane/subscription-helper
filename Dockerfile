# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root config
COPY package.json ./

# Copy shared types
COPY shared/ ./shared/

# Install and build server
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci
COPY server/ ./server/
RUN cd server && npx prisma generate && npm run build

# Install and build client
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy server production files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/prisma ./server/prisma

# Copy client build output
COPY --from=builder /app/client/dist ./client/dist

# Copy shared
COPY --from=builder /app/shared ./shared

# Create data directory for SQLite
RUN mkdir -p /app/server/prisma/data

# Entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL="file:./data/prod.db"

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
