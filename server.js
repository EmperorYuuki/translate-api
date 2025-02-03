require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const fileUpload = require("express-fileupload");
const mammoth = require("mammoth");

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(fileUpload());

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "deepseek/deepseek-chat";

// Helper: safely escape special regex chars
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper: apply glossary after translation
function applyGlossary(text, glossaryObj) {
  if (!glossaryObj || typeof glossaryObj !== "object") return text;
  const terms = Object.keys(glossaryObj).sort((a, b) => b.length - a.length);
  let output = text;
  for (const term of terms) {
    const safeTerm = escapeRegExp(term);
    const regex = new RegExp(`\\b${safeTerm}\\b`, "gi");
    output = output.replace(regex, glossaryObj[term].translation);
  }
  return output;
}

// Retry logic for translations
async function translateWithRetries(apiKey, text, targetLanguage, systemPrompt = "") {
  const MAX_RETRIES = 3;
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const response = await axios.post(
        OPENROUTER_API_URL,
        {
          model: MODEL_NAME,
          messages: [
            { role: "system", content: systemPrompt || "You are translating a novel. Maintain style and accuracy." },
            { role: "user", content: text }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );
      return response.data.choices[0].message.content || "";
    } catch (error) {
      console.error(`Translation error (attempt ${attempts + 1}):`, error.response?.data || error.message);
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response.headers["retry-after"] || "3", 10);
        console.warn(`Rate limit reached, retrying after ${retryAfter}s`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      } else {
        throw error;
      }
    }
    attempts++;
  }
  throw new Error("Translation failed after maximum retries.");
}

// Main /translate endpoint
app.post("/translate", async (req, res) => {
  const { apiKey, text, targetLanguage, glossary, customNotes } = req.body;
  if (!apiKey) return res.status(400).json({ error: "No API key provided." });
  if (!text || !targetLanguage) return res.status(400).json({ error: "Text and targetLanguage are required." });

  try {
    const systemPrompt = customNotes
      ? `You are translating a novel or fanfiction. ${customNotes}`
      : "You are translating a novel. Maintain style and accuracy.";
    
    const translated = await translateWithRetries(apiKey, text, targetLanguage, systemPrompt);
    const finalText = applyGlossary(translated, glossary);
    res.json({ translatedText: finalText });
  } catch (error) {
    console.error("Final translation failure:", error.message);
    res.status(500).json({ error: "Translation failed. Please try again later." });
  }
});

// .docx file upload => text extraction
app.post("/upload-docx", async (req, res) => {
  const file = req.files?.file;
  if (!file) return res.status(400).json({ error: "No file uploaded." });
  try {
    const result = await mammoth.extractRawText({ buffer: file.data });
    res.json({ text: result.value.trim() });
  } catch (error) {
    console.error("Error reading .docx:", error.message);
    res.status(500).json({ error: "Failed to read .docx file." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
