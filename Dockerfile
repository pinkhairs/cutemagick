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
  gosu \
  && rm -rf /var/lib/apt/lists/*
# ---- app ----
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# Copy and set up entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

RUN mkdir -p \
    /app/dashboard/assets/css \
    /app/renders

# Don't set USER node here - entrypoint handles it
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]