import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

interface BlogArticle {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  targetKeyword: string;
  publishedAt: string;
  excerpt: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

async function readPublishedArticles(): Promise<BlogArticle[]> {
  try {
    const filePath = path.resolve(process.cwd(), "data/seo-articles.json");
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as BlogArticle[];
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  const articles = await readPublishedArticles();
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const articles = await readPublishedArticles();
  const article = articles.find((a) => a.slug === slug);
  if (!article) {
    return { title: "AI Data Operations Journal | Dutchkem Ventures" };
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://apex.dutchkemventures.com";
  return {
    title: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt,
    alternates: { canonical: `${baseUrl}/blog/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.metaTitle || article.title,
      description: article.metaDescription || article.excerpt,
      publishedTime: article.publishedAt,
      url: `${baseUrl}/blog/${article.slug}`,
    },
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const articles = await readPublishedArticles();
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  return (
    <article className="min-h-screen bg-[#F8FAFC] text-[#0F172A] px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-4 border-b border-slate-200 pb-8">
          <p className="text-xs font-mono text-amber-700">
            Dutchkem Ventures · Published {article.publishedAt}
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            {article.title}
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">{article.excerpt}</p>
        </header>

        <div className="space-y-8">
          {article.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">{section.heading}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-base text-slate-700 leading-relaxed">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer className="rounded-xl border border-amber-300 bg-white p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-slate-900">
              Automate Your Audio & Vision QA Before Delivery
            </p>
            <p className="text-xs text-slate-600">
              Start a 14-day free trial of Dutchkem Ventures Apex Data Copilot.
            </p>
          </div>
          <Link
            href="/pricing"
            className="px-5 py-2.5 text-xs font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 whitespace-nowrap"
          >
            Start Your Free Trial
          </Link>
        </footer>
      </div>
    </article>
  );
}
