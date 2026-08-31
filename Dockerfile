FROM node:20-slim

WORKDIR /app

COPY package*.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org/
# node -e 校验依赖真实装上了（npm 网络异常时可能报错但仍返回 0）
RUN npm ci --omit=dev --registry=${NPM_REGISTRY} && node -e "require('express')"

COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "server.js"]
