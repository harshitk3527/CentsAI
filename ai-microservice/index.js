import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL;

const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

app.use(
  cors({
    origin: BACKEND_URL,
    credentials: true,
  })
);

// Root route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Cents-Ai-Microservice" });
});

// Generate route
app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    const today = new Date().toISOString().split("T")[0];

    const optimizedPrompt = `
You are a financial expense extractor. Return ONLY a JSON array.

Categories: food, entertainment, bills, shopping, travel, health, education, others
Today: ${today}

Rules:
- Use mentioned date or 'kal/yesterday'. Else Today.
- Missing amount → 0.
- Non-INR → convert using last known currency rate.
- Each object: amount, transactionDate, category.
- Unknown category → "others".
- JS Date compatible.
- If no expense → return [{"amount":0,"transactionDate":Today,"category":"others"}].
- Output MUST be valid JSON ONLY.

User Input: "${prompt}"
`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: optimizedPrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    res.json(JSON.parse(response.text));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});