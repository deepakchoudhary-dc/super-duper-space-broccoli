FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production --no-audit --no-fund

# Copy source code
COPY . .

# Create logs directory and make it writable by the app user
RUN mkdir -p logs && chown -R node:node /app

# Run as non-root user (principle of least privilege)
USER node

# Expose port
EXPOSE 5000

# Health check (busybox wget is included in alpine base)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health || exit 1

# Start the application
CMD ["node", "index.js"]
