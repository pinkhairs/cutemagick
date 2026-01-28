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
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
RUN mkdir -p \
    /app/dashboard/assets/css \
    /app/renders \
 && chown -R node:node \
    /app/dashboard \
    /app/renders
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]