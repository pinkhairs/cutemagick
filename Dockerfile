FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY index.js ./

RUN mkdir -p \
    /app/dashboard/assets/css \
    /app/renders
USER node

CMD ["node", "index.js"]
