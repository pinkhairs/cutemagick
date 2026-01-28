FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY index.js ./

EXPOSE 3000
RUN mkdir -p \
    /app/dashboard/assets/css \
    /app/renders \
 && chown -R node:node \
    /app/dashboard \
    /app/renders
USER node

CMD ["node", "index.js"]
