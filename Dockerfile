# ==========================================
# STAGE 1: Cài đặt dependencies phục vụ build
# ==========================================
FROM node:20-slim AS development

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# ==========================================
# STAGE 2: Cài đặt dependencies chỉ phục vụ Production
# ==========================================
FROM node:20-slim AS dependencies

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

# ==========================================
# STAGE 3: Giai đoạn chạy Runtime tối giản
# ==========================================
FROM node:20-slim AS production

WORKDIR /usr/src/app

COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=development /usr/src/app/dist ./dist
COPY --from=development /usr/src/app/package*.json ./

EXPOSE 3000

CMD ["node", "dist/main.js"]