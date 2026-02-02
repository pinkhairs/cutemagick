FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
  ca-certificates \
  php-cgi \
  php-cli \
  python3 \
  lua5.4 \
  bash \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p \
  public/admin/assets \
  public/admin/css

# Build static assets into image
RUN npm run assets:sync \
 && npm run css:build

RUN npm prune --production

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000

CMD ["node", "src/index.js"]
