const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const fileUpload = require("express-fileupload");
const mammoth = require("mammoth");
const rateLimit = require("express-rate-limit"); // For rate limiting
const pino = require("pino"); // For structured logging
const expressPino = require("express-pino-logger")({ logger: pino() }); // Middleware for Pino logging

const app = express();

// Middleware setup
app.use(bodyParser.json());
app.use(cors());
app.use(fileUpload());
app.use(expressPino); // Add structured logging middleware

// Rate limiting middleware (10 requests per minute)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Helper function to validate request body
function validateRequestBody(requiredFields) {
  return (req, res, next) => {
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Missing fields: ${missingFields.join(", ")}` });
    }
    next();
  };
}

// Translation endpoint
// Translation endpoint
// Translation endpoint
app.post(
  "/translate",
  validateRequestBody(["apiKey", "text", "targetLanguage"]), // Validate required fields
  async (req, res) => {
    const { apiKey, text, targetLanguage, glossary, notes } = req.body;

    try {
      // Construct the system prompt with notes
      const systemPrompt = notes
        ? `Translate the following text into ${targetLanguage}. Context: ${notes}`
        : `Translate the following text into ${targetLanguage}.`;

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      let translatedText = response.data.choices[0].message.content || "";

      // Apply glossary if provided
      if (glossary) {
        translatedText = applyGlossary(translatedText, glossary);
      }

      res.json({ translatedText });
    } catch (error) {
      // Log the error with structured logging
      req.log.error({ error: error.message }, "Translation API Error");
      res.status(500).json({ error: "Translation failed. Please try again later." });
    }
  }
);

// File upload endpoint
app.post("/upload-docx", async (req, res) => {
  const file = req.files?.file;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  // Check file size (limit to 5MB)
  const fileSizeLimit = 5 * 1024 * 1024; // 5MB
  if (file.size > fileSizeLimit) {
    return res.status(413).json({ error: "File size exceeds the 5MB limit." });
  }

  try {
    const result = await mammoth.extractRawText({ buffer: file.data });
    res.json({ text: result.value });
  } catch (error) {
    // Log the error with structured logging
    req.log.error({ error: error.message }, "Error reading .docx file");
    res.status(500).json({ error: "Failed to read .docx file." });
  }
});

// Glossary application function
function applyGlossary(text, glossary) {
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const safeTerm = escapeRegExp(term);
    const regex = new RegExp(`\\b${safeTerm}\\b`, "gi");
    text = text.replace(regex, glossary[term]);
  }
  return text;
}

// Helper function to escape special characters in regex
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
