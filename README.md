# CentsAI

CentsAI tracks expenses, salary credits, and monthly budgets. Enter transactions manually or describe them in one message, then review them in the dashboard.

The Next.js App Router serves the UI and the REST API from one application. MongoDB stores users and expenses. The AI route runs a server-side LangGraph.js workflow that calls Groq through LangChain.js `ChatGroq`. The workflow extracts and validates expense amounts, categories, dates, and currencies. It converts foreign currencies to INR with ExchangeRate-API before saving entries. [Groq structured output](https://console.groq.com/docs/structured-outputs) · [LangGraph.js](https://docs.langchain.com/oss/javascript/langgraph/overview) · [ExchangeRate-API](https://www.exchangerate-api.com/docs/free)

## Local setup

Use Node.js 20.19 or later, a MongoDB instance, and a Groq API key.

1. Copy `.env.example` to `.env.local` and fill in the server settings below.
2. Run `npm ci` and `npm run dev` from the repository root.
3. Open `http://localhost:3000`.

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | MongoDB connection string. Include the database name in the URI or set `MONGO_DB`. |
| `MONGO_DB` | Optional explicit database name. |
| `JWT_SECRET` | Server signing secret of at least 32 UTF-8 bytes. |
| `JWT_EXPIRATION` | Session lifetime in milliseconds. Defaults to seven days. |
| `GROQ_API_KEY` | Groq API key for natural-language expense entry. |
| `GROQ_MODEL` | Model supporting strict JSON Schema output. Defaults to `openai/gpt-oss-20b`. |
| `APP_TIME_ZONE` | IANA time zone for relative dates and the default transaction date. Defaults to `Asia/Kolkata`. |
| `LEGACY_MONGO_TIME_ZONE` | Optional time zone Spring used to store old BSON dates. Defaults to `APP_TIME_ZONE`. |

Point `MONGO_URI` at the existing database to carry over the `users` and `expenses` collections. Existing bcrypt passwords and BSON dates are supported. Set `LEGACY_MONGO_TIME_ZONE` to the previous Java application's time zone if it differs from the new app's setting. New transaction dates are stored as `YYYY-MM-DD` strings. Reusing the previous JWT secret lets existing signed tokens remain valid until expiration.

## Google sign-in

Create a Google OAuth client with application type **Web application**. Add `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI for local development. For deployment, add the same path on your HTTPS domain. The redirect URI must match exactly. [Google OAuth setup](https://developers.google.com/identity/openid-connect/openid-connect#setredirecturi)

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the server environment, then restart the app. **Continue with Google** appears on the sign-in and registration pages. Existing CentsAI users enter their CentsAI password once to link Google and keep their existing expenses.

## Salary and monthly budgets

In **Manual Entry**, choose **Salary credit** and enter the amount and the date the salary was received. You can also describe salary deposits in the AI input. Salary credits appear as positive transactions and are excluded from spending charts.

In **Monthly budget**, choose a calendar month and save a limit in INR. Each month has its own budget. The dashboard shows salary received, expenses, and the amount remaining or overspent for that month.

In **AI spending insights**, choose an expense period of one to seven calendar days and generate a summary. Groq receives aggregated expenses for that window and the current month’s budget and recorded salary totals.

## API

Transaction routes require `Authorization: Bearer <token>`. Registration and login return `user_id`, `username`, and `token`.

| Method | Route | Request body |
| --- | --- | --- |
| POST | `/api/v1/users/register` | `email`, `username`, `password` |
| POST | `/api/v1/users/login` | `email`, `password` |
| GET | `/api/v1/users/{userId}/transactions` | |
| POST | `/api/v1/users/{userId}/transaction` | `amount`, optional `category`, `date`, and `type` (`expense` or `credit`) |
| POST | `/api/v1/users/ai/{userId}/transaction` | `prompt` |
| PATCH | `/api/v1/users/{userId}/transaction/{transactionId}` | Any of `amount`, `category`, `date` |
| DELETE | `/api/v1/users/{userId}/transaction/{transactionId}` | |
| GET | `/api/v1/users/{userId}/budget?month=YYYY-MM` | |
| PUT | `/api/v1/users/{userId}/budget?month=YYYY-MM` | `amount` in INR, or `null` to clear that month’s budget |
| POST | `/api/v1/users/{userId}/insights` | Optional `days` from 1 to 7 (defaults to 7) |

The transaction routes return salary entries in `credits` and preserve the expense-only arrays. If `month` is omitted, the budget endpoint uses the current calendar month in `APP_TIME_ZONE`. A prompt without identifiable expenses or salary credits with positive amounts returns HTTP 400.

## Build and deployment

Run `npm run lint`, `npm run typecheck`, and `npm run build` to check the app. Run `npm start` to serve the production build locally. For a Next.js host such as Vercel, set the project root to this repository's root and configure the server environment variables there.

Active code lives under `src/app`, `src/components`, `src/lib`, and `src/server`. The retired service sources and configuration are archived under `legacy/`.

Created by [Harshit Kumar](https://github.com/harshitkumar7525).
