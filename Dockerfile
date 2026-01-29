# ---- base ----
FROM node:20-bookworm

# System deps (keep minimal)
RUN apt-get update && apt-get install -y \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# App dir
WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Create data dirs inside image (ownership matters)
RUN mkdir -p \
    /app/data/assets/css \
    /app/data/assets \
 && chown -R node:node /app

# Build assets at image build time
RUN npm run assets:sync \
 && npm run css:build

# Drop dev deps (optional but recommended)
RUN npm prune --production

# Runtime user
USER node

EXPOSE 3000

CMD ["node", "src/index.js"]
