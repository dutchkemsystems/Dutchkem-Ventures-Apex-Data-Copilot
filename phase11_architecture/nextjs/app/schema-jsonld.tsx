export function OrganizationAndSoftwareJsonLd() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://apex.dutchkemventures.com";
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        name: "Dutchkem Ventures",
        url: baseUrl,
        description:
          "AI Data Operations & Workforce Orchestration company powering automated Audio QA, YOLOv8 Vision QA, Synthetic Speech Factories, and Multi-Tenant Escrow Settlement.",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${baseUrl}/#software`,
        name: "Dutchkem Ventures Apex Data Copilot",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        provider: { "@id": `${baseUrl}/#organization` },
        description:
          "Generate synthetic data, verify 24kHz mono audio SNR (> 35 dB), audit YOLOv8 bounding box IoU (>= 0.70), and win AI data contracts automatically.",
        offers: [
          { "@type": "Offer", name: "Starter Free Trial (14 Days)", price: "0", priceCurrency: "USD" },
          { "@type": "Offer", name: "Pro Plan", price: "49", priceCurrency: "USD" },
          { "@type": "Offer", name: "Agency Plan", price: "199", priceCurrency: "USD" },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
