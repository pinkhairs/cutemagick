FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
  ca-certificates \
  bash \
  coreutils \
  sed \
  gawk \
  grep \
  jq \
  curl \
  wget \
  php-cli \
  php-cgi \
  php-sqlite3 \
  php-mysql \
  php-curl \
  php-mbstring \
  php-zip \
  php-xml \
  php-gd \
  php-imagick \
  sqlite3 \
  python3 \
  python3-requests \
  python3-pil \
  lua5.4 \
  lua-socket \
  lua-sec \
  imagemagick \
  msmtp \
  sendmail \
  && rm -rf /var/lib/apt/lists/*


WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

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
