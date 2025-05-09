import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import fs from "fs";
import path from "path";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

router.post("/parse-resume", upload.single("resume"), async (req, res) => {
  try {
    const absoluteFilePath = path.resolve(req.file.path);
    if (!fs.existsSync(absoluteFilePath)) {
      return res
        .status(404)
        .json({ error: "File not found", path: absoluteFilePath });
    }

    const fileBuffer = fs.readFileSync(absoluteFilePath);
    const pdfData = await pdfParse(fileBuffer);

    const extractedData = {
      fileName: req.file.originalname,
      rawText: pdfData.text,
      contactInfo: extractDetails(pdfData.text),
    };

    fs.unlinkSync(absoluteFilePath);

    res.status(200).json(extractedData);
  } catch (err) {
    console.error("Parsing Error:", err);
    res
      .status(500)
      .json({ error: "Resume parsing failed", message: err.message });
  }
});

function extractDetails(text) {
  return {
    name: extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
    github: extractGitHub(text),
    linkedin: extractLinkedIn(text),
    domain: extractDomain(text),
    skills: extractSkills(text),
  };
}

function extractName(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (
      /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(lines[i]) &&
      !lines[i].includes("@") &&
      !lines[i].includes("http") &&
      !lines[i].match(/\d{3,}/)
    ) {
      return lines[i];
    }
  }

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];

    if (
      /^[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+$/.test(line) ||
      /^[A-Z][a-z]+\s+[A-Z]\s+[A-Z][a-z]+$/.test(line)
    ) {
      return line;
    }
  }

  const firstFewLines = text.substring(0, 500);
  const nameMatch = firstFewLines.match(
    /([A-Z][a-z]+(?:\s+[A-Z]\.?\s+[A-Z][a-z]+)|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/
  );
  if (
    nameMatch &&
    !nameMatch[0].includes("@") &&
    !nameMatch[0].match(/\d{3,}/)
  ) {
    return nameMatch[0];
  }

  return "Name not found";
}

function extractEmail(text) {
  const match = text.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : "Email not found";
}

function extractPhone(text) {
  const phonePatterns = [/\+91[-\s]?\d{10}/, /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/];
  for (let pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return "Phone not found";
}

function extractGitHub(text) {
  const match = text.match(/https?:\/\/(www\.)?github\.com\/[^\s)]+/i);
  return match ? match[0] : "GitHub URL not found";
}

function extractLinkedIn(text) {
  const match = text.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[^\s)]+/i);
  return match ? match[0] : "LinkedIn URL not found";
}

function extractDomain(text) {
  const domainKeywords = [
    "full stack",
    "frontend",
    "backend",
    "android",
    "data science",
    "machine learning",
    "ai",
    "cloud",
    "cybersecurity",
    "web development",
    "devops",
    "software engineering",
  ];
  const lowerText = text.toLowerCase();
  for (let keyword of domainKeywords) {
    if (lowerText.includes(keyword)) {
      return keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }
  }
  return "Domain not found";
}

function extractSkills(text) {
  const skillsPattern = /skills?[:]\s*(.+)/i;
  const match = text.match(skillsPattern);
  if (match) {
    return match[1]
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const techSkillsSection = text.match(/Technical Skills[\s\S]{0,300}/i);
  if (techSkillsSection) {
    const skillsLine = techSkillsSection[0].split("\n").slice(1).join(", ");
    return skillsLine
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

export default router;
