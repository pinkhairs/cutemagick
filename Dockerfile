FROM node:20-bookworm
ENV PATH="/usr/local/bin:/usr/bin:/bin"

RUN apt-get update && apt-get install -y \
  tini \
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

COPY package*.json ./
RUN npm install --production

COPY . .

RUN npm exec @tailwindcss/cli \
  -i src/dashboard/app.css \
  -o src/dashboard/assets/css/style.css \
  --minify

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
