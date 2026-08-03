# CentsAI 💸

An AI-powered personal finance tracker. Users log expenses by typing a plain-language prompt ("spent 500 rupees on pizza yesterday and 200 today on a movie") — a dedicated microservice sends the prompt to a Gemini-powered LangChain agent, extracts structured, categorized, dated transactions, and the backend persists them and powers dashboards, category breakdowns, and spending trend charts.

---

## 🚀 Live Demo & Deployment

| | |
|---|---|
| **Frontend (live)** | [https://cents-ai.vercel.app](https://cents-ai.vercel.app/) — deployed on Vercel |
| **Backend** | Spring Boot API — Dockerfile included, deployable to any Java 21-compatible host |
| **AI Microservice** | FastAPI + LangChain + Gemini — deployable to any Python 3.10+ host |
| **Demo video** | [https://youtu.be/mXNpHLR403U](https://youtu.be/mXNpHLR403U) |

---

## Architecture Overview

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│   Frontend (Vercel)          │        │   Backend API (Spring Boot)   │
│  React 18 + TS + Vite        │◄──────►│   REST API + JWT auth         │
└─────────────────────────────┘  HTTP  └───────────────┬───────────────┘
                                                        │
                                     stores/reads       │        forwards natural-
                                     users & expenses    │        language prompts
                                                        │
                                          ┌─────────────┴─────────────┐
                                          │                           │
                                    ┌─────▼─────┐         ┌───────────▼────────────┐
                                    │  MongoDB   │         │  AI Microservice        │
                                    │ (users,    │         │  (FastAPI + LangChain)  │
                                    │  expenses) │         └───────────┬────────────┘
                                    └────────────┘                     │
                                                                       ▼
                                                          Google Gemini (gemini-3.6-flash)
```

**Frontend** — React SPA deployed on Vercel. Talks to the backend over REST via a typed `api.ts` client, attaching the JWT from `localStorage` to every authenticated request.

**Backend API** — Spring Boot (Java 21) service. Handles registration/login, JWT issuance, transaction CRUD, and per-user access control. Persists users and expenses in MongoDB. Forwards AI-entry prompts to the microservice via `MICROSERVICE_URI`.

**AI Microservice** — FastAPI service that receives a natural-language prompt, runs it through a LangChain agent backed by Gemini (with a currency-conversion tool available to the agent), and returns structured expense JSON (amount, category, date) back to the backend.

---

## Repositories & Structure

CentsAI is split across three repositories rather than a single monorepo.

### [`centsAI-frontend`](https://github.com/harshitkumar7525/centsAI-frontend)

```
src/
├── components/
│   ├── Dashboard/       # AIInput, AddTransactionDialog, ExpenseChart, CategoryBreakdown, ...
│   ├── Landing/         # Hero, Features, Navbar
│   └── ui/              # shadcn-ui components
├── lib/
│   ├── api.ts           # API client + type definitions
│   ├── categories.ts    # Expense category config
│   └── utils.ts
├── pages/                # Dashboard, Index, Login, Register, NotFound
└── hooks/
```

### [`CentsAI-API`](https://github.com/harshitkumar7525/CentsAI-API)

```
src/main/java/in/harshitkumar/centsaiapi/
├── config/
├── controller/
├── dto/
├── exception/
├── models/
├── repository/
├── security/
├── service/
└── utils/
src/main/resources/application.properties
```

### [`CentsAI-gemini-microservice`](https://github.com/harshitkumar7525/CentsAI-gemini-microservice)

```
main.py            # FastAPI app — routes, CORS setup
agent.py           # LangChain agent definition (Gemini + tools)
tools.py           # Currency exchange-rate tool for the agent
prompts.py         # System prompt template + output parser
schemas.py         # Pydantic response models
extraction.py      # Helper to pull plain text out of an agent message
config.py          # Environment variable loading
requirements.txt
.env.example
```

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Java | 21 |
| Gradle | 8.x |
| Node.js | 18 (frontend only) |
| Python | 3.10 (AI microservice) |
| MongoDB | any recent version |
| Google Gemini API key | — |

---

## Quick Start

### 1 — Clone all three repos

```bash
git clone https://github.com/harshitkumar7525/CentsAI-API.git
git clone https://github.com/harshitkumar7525/CentsAI-gemini-microservice.git
git clone https://github.com/harshitkumar7525/centsAI-frontend.git
```

### 2 — Start the AI microservice

```bash
cd CentsAI-gemini-microservice
python -m venv venv
source venv/bin/activate   # on Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# set GEMINI_API_KEY and BACKEND_URL
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Runs on `http://0.0.0.0:8000` by default. Interactive docs at `http://localhost:8000/docs`.

> **Note:** `.env.example` in this repo currently lists `CENTS_AI_BACKEND`, but `config.py` reads `BACKEND_URL` for the CORS origin. Set `BACKEND_URL` in your `.env` (or update `config.py`) so CORS is configured correctly.

### 3 — Start the backend API

```bash
cd CentsAI-API
# set env vars in src/main/resources/application.properties (see below)
./gradlew build
./gradlew bootRun
```

Runs on `http://localhost:8080` by default.

### 4 — Start the frontend

```bash
cd centsAI-frontend
cp .env.example .env
# set VITE_API_BASE_URL=http://localhost:8080/api/v1
npm install
npm run dev
```

Runs on `http://localhost:5173`.

---

## Environment Variables

### AI Microservice (`.env`)

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `BACKEND_URL` | Yes | Backend URL, used as the allowed CORS origin |
| `PORT` | No | Server port when running `python main.py` directly (default: `8000`) |

### Backend API (`application.properties`)

| Variable | Description | Example |
|---|---|---|
| `SPRING_APPLICATION_NAME` | App name | `centsaiapi` |
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://<user>:<pass>@<host>/<db>?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret used to sign JWTs | any string ≥ 32 chars |
| `JWT_EXPIRATION` | Token lifetime in ms | `604800000` (7 days) |
| `MICROSERVICE_URI` | AI microservice endpoint | `https://your-ai-service-url/generate` |
| `FRONTEND_URL` | Allowed CORS origin | `https://your-frontend-url` |
| `PORT` | Server port | `8080` |

### Frontend (`.env`)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:8080/api/v1` |

---

## API Reference

### Backend API (`CentsAI-API`)

All transaction endpoints require `Authorization: Bearer <token>`.

**Auth**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/users/register` | No | Register a new user, returns JWT |
| POST | `/api/v1/users/login` | No | Login, returns JWT |

**Transactions**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/users/{userId}/transactions` | Yes | Get all transactions for a user |
| POST | `/api/v1/users/{userId}/transaction` | Yes | Add a transaction manually |
| POST | `/api/v1/users/ai/{userId}/transaction` | Yes | Add transaction(s) parsed from a natural-language prompt |
| PATCH | `/api/v1/users/{userId}/transaction/{transactionId}` | Yes | Update a transaction |
| DELETE | `/api/v1/users/{userId}/transaction/{transactionId}` | Yes | Delete a transaction |

Every endpoint checks the path `userId` against the authenticated user and returns `403 Forbidden` on mismatch.

### AI Microservice (`CentsAI-gemini-microservice`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | Root / welcome message |
| GET | `/health` | No | Health check |
| POST | `/generate` | No | Extract structured expense(s) from a natural-language `prompt` |

**`POST /generate` example**

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "I spent 500 rupees on pizza yesterday and 200 today on a movie"}'
```

```json
[
  { "amount": 500, "transactionDate": "2025-12-04", "category": "food" },
  { "amount": 200, "transactionDate": "2025-12-05", "category": "entertainment" }
]
```

---

## Data Models

### User
```json
{ "user_id": "string", "username": "string", "email": "string" }
```

### Transaction / Expense
```json
{
  "id": "string",
  "amount": 50.0,
  "transactionDate": "2025-12-05",
  "category": "Food"
}
```

---

## AI Parsing Rules

The microservice's LangChain agent applies the following rules when turning a prompt into expense records:

- **Multiple transactions** — every distinct purchase mentioned in a single prompt is extracted as its own entry.
- **Date handling** — understands relative references like "kal" (yesterday) and "aaj"/"today"; defaults to today's date if none is mentioned, and different transactions in the same prompt can resolve to different dates.
- **Missing amount** — defaults to `0` if not specified.
- **Currency conversion** — non-INR amounts are converted to INR by having the agent call a `get_exchange_rate` tool that fetches live rates.
- **Categorization** — every expense is assigned one of `food`, `entertainment`, `bills`, `shopping`, `travel`, `health`, `education`, or `others`; anything that doesn't fit a known category falls back to `others`.
- **No expense detected** — returns a single zero-amount, `others`-category placeholder rather than an empty array.
- **Structured output** — the agent's response is validated against a Pydantic schema; if the LLM call fails or the output can't be parsed, the API returns `HTTP 502` with a descriptive error.

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | Registered accounts |
| `expenses` | Transactions, linked to a user |

No migrations required — MongoDB creates collections on first insert.

---

## Deployment

**Frontend** — Deployed on Vercel (`vercel.json` included). Set `VITE_API_BASE_URL` in the Vercel dashboard before building.

**Backend** — Ships with a `Dockerfile` and `docker-compose.yml`; deployable to any host that can run a Java 21 container or a Gradle-built jar. Set all `application.properties` variables (see above) in the host environment.

**AI Microservice** — A FastAPI service run via Uvicorn; deployable to any Python 3.10+ host (or a container running `uvicorn main:app`). Requires `GEMINI_API_KEY` and `BACKEND_URL` to be set.

---

## Author

**Harshit Kumar**
GitHub: [@harshitkumar7525](https://github.com/harshitkumar7525)