const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const fileUpload = require("express-fileupload");
const mammoth = require("mammoth");

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: "*" })); // Allow all origins
app.use(fileUpload());

// Hardcoded values
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "deepseek/deepseek-chat";

// No glossary escaping, simple replacement
function applyGlossary(text, glossary) {
  if (!glossary) return text;
  for (const [term, data] of Object.entries(glossary)) {
    text = text.replace(new RegExp(term, "gi"), data.translation);
  }
  return text;
}

// No retries, no error handling
app.post("/translate", async (req, res) => {
  try {
    const { text, targetLanguage, glossary, customNotes } = req.body;
    
    const response = await axios.post(OPENROUTER_API_URL, {
      model: MODEL_NAME,
      messages: [
        { 
          role: "system", 
          content: customNotes 
            ? `Translate to ${targetLanguage}. ${customNotes}`
            : `Translate to ${targetLanguage}`
        },
        { role: "user", content: text }
      ]
    }, {
      headers: {
        "Authorization": `Bearer ${req.body.apiKey || ''}`,
        "Content-Type": "application/json"
      }
    });

    const translated = response.data.choices[0].message.content;
    res.send({ translatedText: applyGlossary(translated, glossary) });
  } catch (error) {
    res.status(500).send({ error: "Failed. Try again." });
  }
});

// Basic DOCX upload
app.post("/upload-docx", async (req, res) => {
  try {
    const result = await mammoth.extractRawText({ buffer: req.files.file.data });
    res.send({ text: result.value });
  } catch {
    res.status(500).send({ error: "Bad DOCX file" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dumb server running on ${PORT}`));
