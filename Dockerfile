FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY index.js ./

# Create directories and copy assets
RUN mkdir -p \
    /app/dashboard/assets/css \
    /app/renders
USER node

CMD ["node", "index.js"]
