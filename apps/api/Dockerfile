FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json ./
RUN npm install

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Copy workflow JSON templates to dist (tsc doesn't copy non-TS files)
RUN cp -r src/workflows dist/workflows

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
