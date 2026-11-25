import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Globe, Sparkles } from "lucide-react";
import {
  INITIAL_SEO_ARTICLES,
  SEO_JOB_PAGES,
  type SeoBlogArticle,
  type SeoJobLandingPage,
} from "../data/seoCatalog";
import { GlobalFooter, type LegalDocSlug } from "./GlobalFooter";

interface SeoPagesViewProps {
  mode: "jobs" | "blog" | "console";
  slug?: string;
  orgId?: string;
  userId?: string;
  isAuthenticated?: boolean;
  onNavigateJob: (slug: string) => void;
  onNavigateBlog: (slug: string) => void;
  onStartTrial: () => void;
  onReturnHomepage: () => void;
  onOpenLegal?: (slug: LegalDocSlug) => void;
  onSignIn?: () => void;
}

export function SeoPagesView({
  mode,
  slug,
  orgId,
  userId,
  isAuthenticated = false,
  onNavigateJob,
  onNavigateBlog,
  onStartTrial,
  onReturnHomepage,
  onOpenLegal,
  onSignIn,
}: SeoPagesViewProps) {
  const [jobs, setJobs] = useState<SeoJobLandingPage[]>(SEO_JOB_PAGES);
  const [articles, setArticles] = useState<SeoBlogArticle[]>(INITIAL_SEO_ARTICLES);
  const [topicInput, setTopicInput] = useState(
    "How to Automate 24kHz Audio SNR Verification for Remote AI Voice Agencies"
  );
  const [keywordInput, setKeywordInput] = useState("24kHz audio SNR verification");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genNotice, setGenNotice] = useState<string | null>(null);
  const [sitemapPreview, setSitemapPreview] = useState<string>("");
  const [robotsPreview, setRobotsPreview] = useState<string>("");
  const [activeInspectorTab, setActiveInspectorTab] = useState<"sitemap" | "robots" | "jsonld">(
    "sitemap"
  );

  const loadCatalogAndTechnicalSeo = useCallback(async () => {
    try {
      const [jobsRes, articlesRes, sitemapRes, robotsRes] = await Promise.all([
        fetch("/api/seo/jobs"),
        fetch("/api/seo/articles"),
        fetch("/sitemap.xml"),
        fetch("/robots.txt"),
      ]);
      if (jobsRes.ok) {
        const jData = (await jobsRes.json()) as { jobs?: SeoJobLandingPage[] };
        if (jData.jobs?.length) setJobs(jData.jobs);
      }
      if (articlesRes.ok) {
        const aData = (await articlesRes.json()) as { articles?: SeoBlogArticle[] };
        if (aData.articles?.length) setArticles(aData.articles);
      }
      if (sitemapRes.ok) {
        setSitemapPreview(await sitemapRes.text());
      }
      if (robotsRes.ok) {
        setRobotsPreview(await robotsRes.text());
      }
    } catch {
      // Keep local catalog baseline if offline
    }
  }, []);

  useEffect(() => {
    void loadCatalogAndTechnicalSeo();
  }, [loadCatalogAndTechnicalSeo]);

  const activeJob =
    jobs.find((j) => j.slug === slug) ?? jobs[0];
  const activeArticle =
    articles.find((a) => a.slug === slug) ?? articles[0];

  // Dynamically sync document <title> and <meta name="description"> for active programmatic route
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mode === "jobs" && activeJob) {
      document.title = activeJob.metaTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", activeJob.metaDescription);
    } else if (mode === "blog" && activeArticle) {
      document.title = activeArticle.metaTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", activeArticle.metaDescription);
    } else if (mode === "console") {
      document.title = "Automated SEO & Marketing Engine | Dutchkem Ventures";
    }
  }, [activeArticle, activeJob, mode]);

  async function handleGenerateArticle(e: React.FormEvent) {
    e.preventDefault();
    if (!topicInput.trim()) return;
    setGenerating(true);
    setGenError(null);
    setGenNotice(null);
    try {
      const res = await fetch("/api/seo/articles/generate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(orgId ? { "x-org-id": orgId } : {}),
          ...(userId ? { "x-user-id": userId } : {}),
        },
        body: JSON.stringify({
          topic: topicInput.trim(),
          targetKeyword: keywordInput.trim() || topicInput.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        article?: SeoBlogArticle;
        detail?: string;
      };
      if (!res.ok || !data.article) {
        throw new Error(data.detail || "Unable to generate SEO article.");
      }
      setGenNotice(
        `Published ${data.article.wordCount}-word article at /blog/${data.article.slug} and updated /sitemap.xml.`
      );
      await loadCatalogAndTechnicalSeo();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Article generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  // ==================== PUBLIC JOB LANDING PAGE (/jobs/:slug) ====================
  if (mode === "jobs" && activeJob) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-6">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              Dutchkem Ventures
            </button>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={onReturnHomepage}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Homepage
              </button>
              <button
                type="button"
                onClick={() => onNavigateBlog(articles[0].slug)}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Blog Guides
              </button>
              <button
                type="button"
                onClick={onStartTrial}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Pricing
              </button>
            </nav>
            <button
              type="button"
              onClick={onStartTrial}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 whitespace-nowrap shrink-0"
            >
              Start Your Free Trial
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-14 space-y-10">
          <div className="space-y-4 border-b border-slate-200 pb-8">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dutchkem Ventures</span>
            </button>

            <p className="text-xs font-mono text-amber-700">
              {activeJob.platformFocus} · {activeJob.hourlyRateRange} · Keyword: {activeJob.primaryKeyword}
            </p>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-slate-900 text-balance max-w-3xl">
              {activeJob.headline}
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
              {activeJob.summary}
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onStartTrial}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 whitespace-nowrap shrink-0"
              >
                <span>Start Your Free Trial</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-slate-500">
                Meta Title: {activeJob.metaTitle}
              </span>
            </div>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-7 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Automated QA Gate Specification
              </h2>
              <p className="text-xs font-mono text-amber-700">{activeJob.qaGateSpec}</p>
              <ul className="space-y-2.5 text-sm text-slate-700">
                {activeJob.deliverables.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-7 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Pre-Submission Agency Checklist
              </h2>
              <ul className="space-y-2.5 text-sm text-slate-700">
                {activeJob.checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {activeJob.faq.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-7 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Frequently Asked Questions
              </h2>
              <div className="divide-y divide-slate-100">
                {activeJob.faq.map((item) => (
                  <div key={item.q} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">{item.q}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Programmatic Directory Links across all 12 static job routes */}
          <section className="border-t border-slate-200 pt-8 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              All Programmatic AI Data Job Pages ({jobs.length} Indexed Routes)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {jobs.map((job) => (
                <button
                  key={job.slug}
                  type="button"
                  onClick={() => onNavigateJob(job.slug)}
                  className={`text-left rounded-lg border p-3.5 transition-colors ${
                    job.slug === activeJob.slug
                      ? "border-amber-400 bg-amber-50/50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900">{job.title}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    /jobs/{job.slug} · {job.hourlyRateRange}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </main>
        {onOpenLegal && (
          <GlobalFooter
            onOpenLegal={onOpenLegal}
            onOpenPricing={onStartTrial}
            isAuthenticated={isAuthenticated}
            onSignIn={!isAuthenticated ? onSignIn : undefined}
          />
        )}
      </div>
    );
  }

  // ==================== PUBLIC BLOG ARTICLE VIEW (/blog/:slug) ====================
  if (mode === "blog" && activeArticle) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-8 px-6">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              Dutchkem Ventures
            </button>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={onReturnHomepage}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Homepage
              </button>
              <button
                type="button"
                onClick={() => onNavigateJob(jobs[0].slug)}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Job Guides
              </button>
              <button
                type="button"
                onClick={onStartTrial}
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Pricing
              </button>
            </nav>
            <button
              type="button"
              onClick={onStartTrial}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 whitespace-nowrap shrink-0"
            >
              Start Your Free Trial
            </button>
          </div>
        </header>

        <article className="mx-auto max-w-3xl px-6 py-14 space-y-8">
          <header className="space-y-4 border-b border-slate-200 pb-8">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Homepage</span>
            </button>
            <p className="text-xs font-mono tabular-nums text-amber-700">
              {activeArticle.publishedAt} · {activeArticle.wordCount} words · {activeArticle.readMinutes} min read · {activeArticle.generatedBy}
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 text-balance">
              {activeArticle.title}
            </h1>
            <p className="text-base text-slate-600 leading-relaxed">
              {activeArticle.excerpt}
            </p>
          </header>

          <div className="space-y-8">
            {activeArticle.sections.map((section) => (
              <section key={section.heading} className="space-y-3">
                <h2 className="text-xl font-semibold text-slate-900">{section.heading}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-[15px] text-slate-700 leading-[1.7]">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <section className="rounded-xl border border-amber-300 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Automate Your Agency QA Before Client Upload
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Verify 24kHz SNR, Whisper WER, and YOLOv8 IoU inside Dutchkem Ventures Apex Data Copilot.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartTrial}
              className="px-5 py-2.5 text-xs font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 whitespace-nowrap shrink-0"
            >
              Start Your Free Trial
            </button>
          </section>

          <section className="border-t border-slate-200 pt-8 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Published Editorial Guides ({articles.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {articles.map((art) => (
                <button
                  key={art.slug}
                  type="button"
                  onClick={() => onNavigateBlog(art.slug)}
                  className={`text-left rounded-lg border p-4 transition-colors ${
                    art.slug === activeArticle.slug
                      ? "border-amber-400 bg-amber-50/40"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900">{art.title}</p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                    /blog/{art.slug} · {art.wordCount} words
                  </p>
                </button>
              ))}
            </div>
          </section>
        </article>
        {onOpenLegal && (
          <GlobalFooter
            onOpenLegal={onOpenLegal}
            onOpenPricing={onStartTrial}
            isAuthenticated={isAuthenticated}
            onSignIn={!isAuthenticated ? onSignIn : undefined}
          />
        )}
      </div>
    );
  }

  // ==================== WORKSPACE CONSOLE MODE (section = "seo-engine") ====================
  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-amber-700">
            Phase 11 · Programmatic SEO, Gemini Blog Generator & Sitemap Indexing
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Automated SEO & Marketing Engine
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            12 static job landing pages, live Gemini 1,000-word article publishing, /sitemap.xml, /robots.txt, and Schema.org JSON-LD.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartTrial}
          className="px-4 py-2 text-xs font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 whitespace-nowrap shrink-0"
        >
          Start Your Free Trial
        </button>
      </div>

      {/* Metrics Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-slate-200 bg-white rounded-lg p-5">
        <div>
          <p className="text-xs font-medium text-slate-500">Programmatic Job Pages</p>
          <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
            {jobs.length} routes
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Published Blog Guides</p>
          <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
            {articles.length} articles
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Sitemap Indexed URLs</p>
          <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-amber-700">
            {2 + jobs.length + articles.length} URLs
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">JSON-LD Structured Data</p>
          <p className="mt-1 text-sm font-medium text-emerald-700">
            Organization + SoftwareApplication
          </p>
        </div>
      </section>

      {/* Live Automated Gemini Blog Generator */}
      <section className="border border-slate-200 bg-white rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Automated Blog Generator (Gemini Live · ~1,000 Words)
          </h2>
        </div>

        <form onSubmit={handleGenerateArticle} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label htmlFor="seo-topic" className="block text-xs font-medium text-slate-700 mb-1">
              Article Title / Topic
            </label>
            <input
              id="seo-topic"
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="e.g., How to pass the TELUS Digital Voice Cloning Project"
              required
            />
          </div>
          <div>
            <label htmlFor="seo-keyword" className="block text-xs font-medium text-slate-700 mb-1">
              Target SEO Keyword
            </label>
            <input
              id="seo-keyword"
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="24kHz audio SNR verification"
            />
          </div>
          <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Generates 5 technical sections via server-side Gemini (`gemini-4-hydrogen`) and appends directly to `/blog/[slug]` and `/sitemap.xml`.
            </p>
            <button
              type="submit"
              disabled={generating}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-[#0F172A] text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {generating ? "Generating Article with Gemini..." : "Generate & Publish 1,000-Word Article"}
            </button>
          </div>
        </form>

        {genNotice && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            {genNotice}
          </div>
        )}
        {genError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
            {genError}
          </div>
        )}
      </section>

      {/* Programmatic Job Pages Directory + Published Blog List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Programmatic Job Pages (/jobs/[slug])
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {jobs.length} static routes
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
            {jobs.map((job) => (
              <div
                key={job.slug}
                className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{job.title}</p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    /jobs/{job.slug} · {job.hourlyRateRange}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateJob(job.slug)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Open Page
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Published Blog Articles (/blog/[slug])
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {articles.length} articles
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
            {articles.map((article) => (
              <div
                key={article.slug}
                className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {article.title}
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-500 truncate">
                    /blog/{article.slug} · {article.wordCount} words · {article.generatedBy}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateBlog(article.slug)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Read Article
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Live Sitemap.xml / Robots.txt / JSON-LD Inspector */}
      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Technical SEO Inspector (Live Endpoints)
            </h2>
            <p className="text-xs text-slate-500">
              Auto-generated directly from running Express server and embedded in index.html.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
            <button
              type="button"
              onClick={() => setActiveInspectorTab("sitemap")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeInspectorTab === "sitemap"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              /sitemap.xml
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab("robots")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeInspectorTab === "robots"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              /robots.txt
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab("jsonld")}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeInspectorTab === "jsonld"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              JSON-LD Schema
            </button>
          </div>
        </div>

        <pre className="p-6 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto max-h-72 leading-relaxed">
          <code>
            {activeInspectorTab === "sitemap"
              ? sitemapPreview || "Loading /sitemap.xml..."
              : activeInspectorTab === "robots"
                ? robotsPreview || "Loading /robots.txt..."
                : JSON.stringify(
                    {
                      "@context": "https://schema.org",
                      "@graph": [
                        { "@type": "Organization", name: "Dutchkem Ventures" },
                        {
                          "@type": "SoftwareApplication",
                          name: "Dutchkem Ventures Apex Data Copilot",
                          applicationCategory: "BusinessApplication",
                          offers: [
                            { price: "0", priceCurrency: "USD" },
                            { price: "49", priceCurrency: "USD" },
                            { price: "199", priceCurrency: "USD" },
                          ],
                        },
                      ],
                    },
                    null,
                    2
                  )}
          </code>
        </pre>
      </section>
    </div>
  );
}
