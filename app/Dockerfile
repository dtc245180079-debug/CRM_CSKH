# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production Minimal Image
FROM node:20-alpine AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production
RUN apk --no-cache add curl wget

# Copy only production dependencies and source files with non-root user ownership
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node . .

# Run as unprivileged node user for security
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
