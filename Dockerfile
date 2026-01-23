FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY index.js ./

EXPOSE 3000

CMD ["node", "index.js"]