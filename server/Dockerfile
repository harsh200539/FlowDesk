FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY server server
RUN npm run db:generate -w server && npm run build -w server
EXPOSE 5003
CMD ["sh", "-c", "npm run db:migrate -w server && npm start -w server"]
