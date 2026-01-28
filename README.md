# HW HUNTER Auction — Telegram Mini App (MVP)

## Що всередині
- `backend/` — Node.js + Express + WebSocket + Prisma (Postgres)
- `webapp/` — Next.js Mini App (UA + ₴), фото лота в `public/`
- `bot/` — (опціонально) простий бот з кнопкою "Відкрити аукціон"

## 1) Backend (локально)
1. Скопіюй `backend/.env.example` -> `backend/.env` і заповни:
   - DATABASE_URL (Neon/Supabase/Postgres)
   - BOT_TOKEN (Telegram Bot token)
   - CHANNEL_ID (@hw_hunter_ua)
2. Запуск:
   - `cd backend`
   - `npm i`
   - `npm run prisma:gen`
   - `npm run prisma:push`
   - `npm run seed`
   - `npm start`
3. Перевірка:
   - http://localhost:8080/health

## 2) WebApp (локально)
1. Скопіюй `webapp/.env.local.example` -> `webapp/.env.local`
2. Запуск:
   - `cd webapp`
   - `npm i`
   - `npm run dev`
3. Відкривається: http://localhost:3000

> Важливо: авторизація initData працює лише всередині Telegram WebApp.

## 3) Фото лота (Варіант A)
`webapp/public/bmw-sth.jpg` — уже додано (можеш замінити своїм).

## 4) Bot (опціонально)
1. Скопіюй `bot/.env.example` -> `bot/.env` і заповни:
   - BOT_TOKEN
   - WEBAPP_URL (Vercel URL)
2. Запуск:
   - `cd bot`
   - `npm i`
   - `npm start`
