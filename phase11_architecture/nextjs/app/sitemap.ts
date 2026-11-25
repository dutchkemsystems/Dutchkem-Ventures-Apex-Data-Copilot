import type { MetadataRoute } from "next";

const JOB_SLUGS = [
  "tts-audio-qa",
  "multilingual-prompt-engineering",
  "video-annotation-qa",
  "voice-cloning-rubric-qa",
  "yolo-bounding-box-auditor",
  "rlhf-reasoning-evaluation",
  "asr-whisper-wer-verification",
  "synthetic-speech-dataset-factory",
  "telus-digital-ai-rater-prep",
  "mercor-expert-interview-prep",
  "multimodal-red-teaming-qa",
  "automotive-lidar-bbox-qa",
];

const BLOG_SLUGS = [
  "how-to-pass-telus-digital-voice-cloning-project",
  "top-5-ai-data-annotation-platforms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://apex.dutchkemventures.com";
  const now = new Date();

  return [
    { url: baseUrl, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...JOB_SLUGS.map((slug) => ({
      url: `${baseUrl}/jobs/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    ...BLOG_SLUGS.map((slug) => ({
      url: `${baseUrl}/blog/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
