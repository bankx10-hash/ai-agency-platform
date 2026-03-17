FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies
COPY apps/api/package.json ./
RUN npm install

# Copy Prisma schema and migrations (root prisma/ contains both)
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy source and build
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src/
RUN npm run build

# Copy workflow JSON templates
RUN cp -r src/workflows dist/workflows

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
