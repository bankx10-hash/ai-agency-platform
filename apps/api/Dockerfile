FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install

RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
