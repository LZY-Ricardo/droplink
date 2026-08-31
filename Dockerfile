FROM node:24-slim

WORKDIR /app

COPY package*.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org/
# 用 npm install 而非 npm ci：ci 按锁文件里的 resolved 地址下载，不遵循 --registry
# node -e 校验依赖真实装上了（npm 网络异常时可能报错但仍返回 0）
RUN npm install --omit=dev --no-audit --no-fund --fetch-timeout=60000 --registry=${NPM_REGISTRY} \
  && node -e "require('express')"

COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "server.js"]
