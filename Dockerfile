FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm install tsx@4.19.2 typescript@5.7.2 @types/node@22.10.0
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
