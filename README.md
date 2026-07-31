# ⚙️ Grillo — Backend API

API serverless per **Grillo**: estrazione dati da screenshot di prenotazioni, generazione itinerari AI e chat assistente.

> **Backend del progetto Grillo** — Vercel Serverless Functions + DeepSeek + GPT-4o vision.

## 📡 Endpoint

| Endpoint | Descrizione |
|:--|:--|
| `POST /api/parse-booking` | Estrae dati dalla prenotazione (screenshot base64) |
| `POST /api/itinerary` | Genera l'itinerario personalizzato |
| `POST /api/chat` | Chat assistente viaggio |
| `GET  /api/test-gemini` | Diagnostica chiave Gemini |

## 🔄 Pipeline parse-booking

```
POST { images: [dataURL, ...] }
  → GPT-4o vision (OCR primario — legge TUTTE le immagini)
  → OCR.space Engine 2 (fallback se GPT fallisce)
  → DeepSeek (parsing JSON strutturato)
  → { destination, checkIn, checkOut, hotel, guestNames, confirmation, ... }
```

- **Multi-screenshot**: accetta un array — una sola prenotazione su più schermate
- **Raw base64**: nessun canvas lato client (affidabile su iPhone Safari)
- **`guestNames`**: nomi degli ospiti estratti esplicitamente
- **Fallback**: se tutto fallisce → `_ocrFailed: true` (l'app mostra il form manuale)

## 🔑 Variabili d'ambiente

| Variabile | Obbligatoria | Uso |
|:--|:--|:--|
| `DEEPSEEK_API_KEY` | ✅ | Parsing + itinerario + chat |
| `OPENAI_API_KEY` | ✅ | GPT-4o vision (OCR primario) |
| `OCR_SPACE_API_KEY` | ✅ | Fallback OCR |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | opzionale | Auth opzionale (JWT) |
| `GEMINI_API_KEY` | opzionale | Solo diagnostica |

## 🚀 Sviluppo locale

```bash
npm install
npx vercel dev        # Serverless locale su localhost:3000
```

## 🗂️ Struttura

```
api/
├── parse-booking.js    # OCR + parsing prenotazione
├── itinerary.js        # Generatore itinerari
├── chat.js             # Chat assistente
└── test-gemini.js      # Diagnostica
lib/
└── auth.js             # CORS centralizzato + auth opzionale Supabase JWT
```

## 🌐 Deploy

- **Repo GitHub**: `fooxluigi-dev/grillo-parlante-api`
- **Vercel**: push su `main` → auto-deploy su `gp-landing` e `grillo-parlante-api`
- `vercel.json`: maxDuration 30s (chat/parse-booking) e 60s (itinerary)

## 🔗 Frontend

- App: [fooxluigi-dev/grillo-parlante](https://github.com/fooxluigi-dev/grillo-parlante)
- Upload web: [fooxluigi-dev/grillo-scan](https://github.com/fooxluigi-dev/grillo-scan)

## 📄 Licenza

Tutti i diritti riservati — Grillo © 2026.
