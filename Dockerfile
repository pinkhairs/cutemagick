FROM node:20-bookworm
ENV PATH="/usr/local/bin:/usr/bin:/bin"
RUN apt-get update && apt-get install -y \
  tini \
  openssh-client \
  php-cgi \
  ruby \
  php-cli \
  python3 \
  python3-venv \
  bash \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- app ----
WORKDIR /app

# Install deps (needs dev deps for Tailwind build)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Create directories and copy assets
RUN mkdir -p \
    /app/data/assets \
    /app/renders \
    /app/sites \
    /app/.ssh \
 && cp -r /app/src/dashboard/assets/* /app/data/assets/

# ---- build Tailwind CSS (PRODUCTION SAFE) ----
RUN npx @tailwindcss/cli \
  -i /app/src/dashboard/app.css \
  -o /app/data/assets/style.css

# Prune dev deps after build
RUN npm prune --production

# CRITICAL: Give node user ownership of everything AFTER all file operations
RUN chown -R node:node /app

# Switch to node user
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]