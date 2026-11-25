import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";

const TARGET_TOPICS = [
  {
    slug: "how-to-pass-telus-digital-voice-cloning-project",
    topic: "How to pass the TELUS Digital Voice Cloning Project",
    keyword: "How to pass the TELUS Digital Voice Cloning Project",
  },
  {
    slug: "top-5-ai-data-annotation-platforms",
    topic: "Top 5 AI Data Annotation Platforms",
    keyword: "Top 5 AI Data Annotation Platforms",
  },
  {
    slug: "automating-24khz-audio-snr-verification-for-voice-agencies",
    topic: "Automating 24kHz Audio SNR Verification (> 35 dB) for Remote Voice Agencies",
    keyword: "24kHz Audio SNR Verification",
  },
  {
    slug: "achieving-iou-070-on-yolov8-video-annotation-contracts",
    topic: "Achieving IoU >= 0.70 on Enterprise Video Bounding Box Contracts",
    keyword: "YOLOv8 Video Annotation QA",
  },
];

async function generateSeoArticles() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required.");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const published: Array<Record<string, unknown>> = [];

  for (const item of TARGET_TOPICS) {
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Write a comprehensive, authoritative 1,000-word technical SEO guide titled "${item.topic}" targeting "${item.keyword}" for freelancers and boutique AI data agencies using Dutchkem Ventures Apex Data Copilot. Include concrete QA thresholds (24kHz mono WAV, -70 dBFS noise floor, > 35 dB SNR, Whisper WER <= 5%, YOLOv8 IoU >= 0.70, PostgreSQL RLS, 80/20 escrow). Return 5 deep multi-paragraph sections.`,
      config: {
        systemInstruction:
          "You are an expert AI Data Operations editor for Dutchkem Ventures. Write clear, practical prose totaling ~1,000 words without fluff.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            metaTitle: { type: Type.STRING },
            metaDescription: { type: Type.STRING },
            excerpt: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  heading: { type: Type.STRING },
                  paragraphs: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ["heading", "paragraphs"],
              },
            },
          },
          required: ["title", "metaTitle", "metaDescription", "excerpt", "sections"],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? "{}").trim());
    published.push({
      slug: item.slug,
      targetKeyword: item.keyword,
      publishedAt: new Date().toISOString().slice(0, 10),
      ...parsed,
    });
  }

  const outPath = path.resolve(process.cwd(), "data/seo-articles.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(published, null, 2), "utf8");
  console.log(`Published ${published.length} SEO articles to ${outPath}`);
}

generateSeoArticles().catch((err) => {
  console.error(err);
  process.exit(1);
});
