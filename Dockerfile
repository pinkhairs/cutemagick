FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY index.js ./

EXPOSE 3000
RUN mkdir -p \
    /app/dashboard/assets/css \
    /app/.ssh \
    /app/renders \
    /app/data \
    /app/sites \
 && chown -R node:node \
    /app/dashboard \
    /app/.ssh \
    /app/renders \
    /app/data \
    /app/sites
USER node

CMD ["node", "index.js"]
