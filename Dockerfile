FROM node:24-slim

WORKDIR /app

# 不拷贝 package-lock.json：npm 会优先用锁文件里 resolved 的 npmjs.org 地址，
# 导致 --registry 失效，在国内服务器上下载挂死
COPY package.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org/
# node -e 校验依赖真实装上了（npm 网络异常时可能报错但仍返回 0）
RUN npm install --omit=dev --no-audit --no-fund --fetch-timeout=60000 --registry=${NPM_REGISTRY} \
  && node -e "require('express')"

COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 3000

CMD ["node", "server.js"]
