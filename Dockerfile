FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "server.js"]
