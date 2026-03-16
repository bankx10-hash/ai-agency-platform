FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY prisma ./prisma/
COPY packages ./packages/
COPY apps/api ./apps/api/

RUN npm install --workspace=apps/api --include-workspace-root

RUN npx prisma generate

WORKDIR /app/apps/api
RUN npm run build

EXPOSE 4000
CMD ["node", "dist/index.js"]
