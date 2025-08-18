import express from "express";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import path from "path";
import os from "os";
dotenv.config();
console.log(process.env.GEMINI_API_KEY );
const app = express();
app.use(express.json());
ffmpeg.setFfmpegPath(ffmpegPath);
const upload = multer({ dest: "uploads/" });
app.use(cors());


// OR — restrict to specific origins
app.use(cors({
  origin: ["http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
// Gemini API client
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
console.log(genai)

// Conversation memory
let interviewContext = {
  jobRole: "",
  jobDescription: "",
  history: [] // { question, answer, evaluation }
};

const res=await generateText("Hello from the backend!");
console.log("Generated text", res);
// ---- Gemini helper ----
async function generateText(prompt) {
  const model = genai.getGenerativeModel({ model:"gemini-1.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ---- Extract audio from video ----
function extractAudio(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(outputPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

// ---- Routes ----
app.get("/hello", (req, res) => {
  console.log("Hello from the backend!");
  res.send("Hello from the backend!");
});

// Step 1 — Start interview
app.post("/start-interview", async (req, res) => {
  const { jobRole, jobDescription } = req.body;
  interviewContext.jobRole = jobRole;
  interviewContext.jobDescription = jobDescription;
  interviewContext.history = [];

  const prompt = `
    You are an AI interviewer. Ask the first interview question for:
    Role: ${jobRole}
    Description: ${jobDescription}
    Only output the question text, no extra text.
  `;

  const question = await generateText(prompt);
  res.json({ question });
});

// ...existing code...
app.post("/generate-report", async (req, res) => {
  try {
    // Compose a summary prompt for Gemini
    const reportPrompt = `
      You are an AI interview evaluator.
      Here is the interview history (each with question, answer, and evaluation): 
      ${JSON.stringify(interviewContext.history, null, 2)}
      The job role is: ${interviewContext.jobRole}
      The job description is: ${interviewContext.jobDescription}
      Please provide a JSON report with:
      - "technicalCorrectness": number (0-10)
      - "clarityOfExplanation": number (0-10)
      - "confidence": number (0-10)
      - "overallImpact": number (0-10)
      - "finalFeedback": string (5 lines of feedback for the candidate)
      Output only JSON in this format:
      {
        "technicalCorrectness": number,
        "clarityOfExplanation": number,
        "confidence": number,
        "overallImpact": number,
        "finalFeedback": string
      }
    `;

    const reportText = await generateText(reportPrompt);
    // Clean Gemini output to extract JSON
    const jsonMatch = reportText.match(/```json\s*([\s\S]*?)```|({[\s\S]*})/i);
    let reportJsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[2]) : reportText;
    reportJsonStr = reportJsonStr.trim();
    const report = JSON.parse(reportJsonStr);

    res.json(report);
  } catch (err) {
    console.error("❌ Error generating report:", err);
    res.status(500).json({ error: "Report generation failed" });
  }
});

// Step 2 — Upload answer & evaluate
app.post("/upload-answer", upload.single("video"), async (req, res) => {
  const { question } = req.body;

  // Ensure temp folder exists
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const audioPath = path.join(tempDir, `${Date.now()}.wav`);

  try {
    // Extract audio
    await extractAudio(req.file.path, audioPath);

    // TODO: transcription
    const answerText = "[Replace with transcription result]";

    const evalPrompt = `
      Question: ${question}
      Answer: ${answerText}
      Evaluate relevance, clarity, correctness (1-5 scale each) and give short feedback.
      Output ONLY valid JSON in this format: 
      { "feedback": string, "scores": { "relevance": number, "clarity": number, "correctness": number } }
      Do not include any explanation or text outside the JSON.
    `;

    const evalText = await generateText(evalPrompt);
    console.log("Gemini evalText:", evalText); // <-- Add this line for debugging

    // Extract the first {...} JSON object from the response
    const jsonMatch = evalText.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      // Log the full response for debugging
      console.error("Gemini did not return JSON. Response was:", evalText);
      throw new Error("No JSON found in Gemini response");
    }
    const evaluation = JSON.parse(jsonMatch[0]);
// ...existing code...
    interviewContext.history.push({ question, answer: answerText, evaluation });

    const nextPrompt = `
      You are an AI interviewer. Based on the candidate's previous answers:
      ${JSON.stringify(interviewContext.history)}
      Ask the next interview question for role: ${interviewContext.jobRole}.
      Only output the question text, no extra formatting.
    `;
    const nextQuestion = await generateText(nextPrompt);

    res.json({ evaluation, nextQuestion });

  } catch (err) {
    console.error("❌ Error processing upload:", err);
    res.status(500).json({ error: "Processing failed" });
  }
});

app.listen(process.env.PORT, async() =>{
  console.log("Server is running on http://localhost:5000");
  
});
