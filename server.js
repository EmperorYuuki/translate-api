// server.js
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

app.post("/translate", async (req, res) => {
  const { apiKey, text, targetLanguage, glossary } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: "No API key provided." });
  }
  if (!text || !targetLanguage) {
    return res.status(400).json({ error: "Text and targetLanguage are required." });
  }

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: `Translate the following text into ${targetLanguage}.` },
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

    let translatedText = response.data.choices[0].message.content || "";

    if (glossary) {
      translatedText = applyGlossary(translatedText, glossary);
    }

    res.json({ translatedText });
  } catch (error) {
    console.error("Translation API Error:", error.message);
    res.status(500).json({ error: "Translation failed. Please try again later." });
  }
});

app.post("/upload-docx", async (req, res) => {
  const file = req.files?.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  try {
    const result = await mammoth.extractRawText({ buffer: file.data });
    res.json({ text: result.value });
  } catch (error) {
    console.error("Error reading .docx file:", error.message);
    res.status(500).json({ error: "Failed to read .docx file." });
  }
});

function applyGlossary(text, glossary) {
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const safeTerm = escapeRegExp(term);
    const regex = new RegExp(`\\b${safeTerm}\\b`, "gi");
    text = text.replace(regex, glossary[term]);
  }
  return text;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

