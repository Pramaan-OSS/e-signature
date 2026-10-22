FROM node:24-bookworm
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY . .
RUN npm ci --no-audit --no-fund
RUN npx playwright install --with-deps chromium
RUN npm run build
ENTRYPOINT ["sh", "docker/local/entrypoint.sh"]
