FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=7860
EXPOSE 7860
CMD ["node", "server/index.js"]
