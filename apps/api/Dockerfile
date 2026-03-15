FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --ignore-scripts || true
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
