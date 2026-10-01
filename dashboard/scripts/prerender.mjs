import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(scriptDir, "..");
const repoRoot = resolve(dashboardRoot, "..");
const distRoot = resolve(dashboardRoot, "dist");
const ssrBundle = resolve(dashboardRoot, "dist-ssr", "entry-server.js");
const clientIndex = resolve(distRoot, "index.html");
const privacySource = existsSync(resolve(dashboardRoot, "docs/PRIVACY_NOTICE.md"))
  ? resolve(dashboardRoot, "docs/PRIVACY_NOTICE.md")
  : resolve(repoRoot, "docs/PRIVACY_NOTICE.md");
const termsSource = existsSync(resolve(dashboardRoot, "docs/TERMS_OF_SERVICE.md"))
  ? resolve(dashboardRoot, "docs/TERMS_OF_SERVICE.md")
  : resolve(repoRoot, "docs/TERMS_OF_SERVICE.md");
const require = createRequire(import.meta.url);
const markedModule = require("marked");
const sanitizeModule = require("sanitize-html");
const sanitizeHtml = sanitizeModule.default ?? sanitizeModule;
async function parseMarkdown(markdown) {
  if (typeof markedModule.parse === "function") {
    return await markedModule.parse(markdown, { async: false });
  }
  if (typeof markedModule.marked === "function") {
    return await markedModule.marked(markdown, { async: false });
  }
  throw new Error("The installed marked package does not expose a synchronous parser");
}

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`Required input is missing: ${path}`);
  return readFileSync(path, "utf8");
}

function parseDeploymentEnvironment(value) {
  const candidate = value?.trim() || "development";
  if (candidate !== "development" && candidate !== "preview" && candidate !== "production") {
    throw new Error(`VITE_DEPLOYMENT_ENV must be development, preview, or production; received ${candidate}`);
  }
  return candidate;
}

function parseSiteUrl(value) {
  const candidate = value?.trim();
  if (!candidate) return null;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("VITE_SITE_URL must be an absolute http(s) origin");
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("VITE_SITE_URL must be an absolute http(s) origin without a path, query, or fragment");
  }

  return parsed.origin;
}

function getConfig() {
  const deploymentEnvironment = parseDeploymentEnvironment(process.env.VITE_DEPLOYMENT_ENV);
  const siteUrl = parseSiteUrl(process.env.VITE_SITE_URL);
  if (deploymentEnvironment === "production" && siteUrl === null) {
    throw new Error("VITE_SITE_URL is required when VITE_DEPLOYMENT_ENV=production");
  }
  return { deploymentEnvironment, siteUrl, indexable: deploymentEnvironment === "production" };
}

function absoluteUrl(siteUrl, path) {
  return siteUrl ? `${siteUrl}${path}` : path;
}

function robotsText(config) {
  if (!config.indexable || !config.siteUrl) {
    return "User-agent: *\nDisallow: /\n";
  }
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /notes",
    "Disallow: /usage",
    "Disallow: /settings",
    "Disallow: /login",
    "Disallow: /auth",
    "Disallow: /admin",
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

function sitemapXml(config) {
  if (!config.indexable || !config.siteUrl) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "</urlset>",
      "",
    ].join("\n");
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${config.siteUrl}/</loc></url>`,
    `  <url><loc>${config.siteUrl}/privacy</loc></url>`,
    `  <url><loc>${config.siteUrl}/terms</loc></url>`,
    "</urlset>",
    "",
  ].join("\n");
}

function htmlEscaped(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function replaceMeta(html, name, content) {
  const pattern = new RegExp(
    `<meta\\s+(?:name|property)=\"${name}\"\\s+content=\"[^\"]*\"\\s*\\/?>`,
    "i",
  );
  if (!pattern.test(html)) return html;
  return html.replace(pattern, `<meta name=\"${name}\" content=\"${htmlEscaped(content)}\" />`);
}

function replaceLegalBody(html, body) {
  const pattern = /<div id="root"><\/div>/;
  if (!pattern.test(html)) {
    throw new Error("Client shell is missing the expected empty #root element");
  }
  return html.replace(
    pattern,
    `<div id="root" data-prerendered="true" data-static="true">${body}</div>`,
  );
}

function replaceTagContent(html, tag, content) {
  const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "i");
  return html.replace(pattern, content);
}

function replaceDocumentMetadata(html, metadata) {
  let output = html.replace(/<html[^>]*>/, `<html lang="${metadata.lang}">`);
  output = replaceTagContent(output, "title", `<title>${htmlEscaped(metadata.title)}</title>`);
  output = replaceMeta(output, "description", metadata.description);
  output = replaceMeta(output, "robots", metadata.robots);
  output = output.replace(/<link[^>]*rel="canonical"[^>]*>/gi, "");
  output = output.replace(/<meta[^>]*property="og:[^"]*"[^>]*>/gi, "");
  output = output.replace(/<meta[^>]*name="twitter:[^"]*"[^>]*>/gi, "");
  output = output.replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");

  const snippets = [
    `<link rel="canonical" href="${htmlEscaped(metadata.canonical)}" />`,
    `<meta property="og:title" content="${htmlEscaped(metadata.ogTitle)}" />`,
    `<meta property="og:description" content="${htmlEscaped(metadata.ogDescription)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${htmlEscaped(metadata.canonical)}" />`,
    `<meta property="og:image" content="${htmlEscaped(metadata.socialImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${metadata.locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscaped(metadata.ogTitle)}" />`,
    `<meta name="twitter:description" content="${htmlEscaped(metadata.ogDescription)}" />`,
    `<meta name="twitter:image" content="${htmlEscaped(metadata.socialImage)}" />`,
  ];

  for (const snippet of snippets) {
    output = output.replace("</head>", `    ${snippet}\n  </head>`);
  }

  output = output.replace("</head>", `    ${metadata.jsonLd}\n  </head>`);
  return output;
}

const sanitizerOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "a", "strong", "em", "code", "pre",
    "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    th: ["scope"],
  },
  allowedSchemes: ["https"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href?.trim();
      if (!href) return { tagName, attribs: {} };
      if (href === "PRIVACY_NOTICE.md" || href === "./PRIVACY_NOTICE.md") {
        return { tagName, attribs: { href: "/privacy" } };
      }
      if (!href.startsWith("https://")) return { tagName: "span", attribs: {} };
      return { tagName, attribs: { href, rel: "noopener noreferrer" } };
    },
  },
};

function buildLegalHtml({ pageTitle, description, body }) {
  return [
    `<header><p><a href="/">Notinn</a></p></header>`,
    `<main id="main-content">`,
    `  <h1>${htmlEscaped(pageTitle)}</h1>`,
    `  <p>${htmlEscaped(description)}</p>`,
    `  ${body}`,
    `  <p><a href="/">Back to Notinn home</a></p>`,
    `</main>`,
  ].join("\n");
}

async function buildLegalPage({ sourcePath, pageTitle, description }) {
  const markdown = readRequired(sourcePath);
  const parsed = await parseMarkdown(markdown);
  return buildLegalHtml({
    pageTitle,
    description,
    body: sanitizeHtml(parsed, sanitizerOptions),
  });
}

async function main() {
  const config = getConfig();
  if (!existsSync(ssrBundle)) {
    throw new Error(`SSR bundle is missing: ${ssrBundle}. Run \"npm run build:ssr\" first.`);
  }
  if (!existsSync(clientIndex)) {
    throw new Error(`Client build output is missing: ${clientIndex}. Run \"npm run build:client\" first.`);
  }

  const shell = readRequired(clientIndex);
  const landingTitle = "Notinn | Turn messages and documents into tidy notes";
  const landingDescription =
    "Send text, voice notes, screenshots, or documents through Telegram. Notinn turns them into structured notes you can save and find again.";
  const landingOgDescription =
    "Notinn is a knowledge inbox on Telegram that turns text, voice notes, screenshots, and documents into ready-to-use notes.";

  const { renderLanding } = await import(pathToFileURL(ssrBundle).href);
  if (typeof renderLanding !== "function") {
    throw new Error("SSR bundle must export renderLanding()");
  }

  cpSync(clientIndex, resolve(distRoot, "app.html"));
  let appShell = readRequired(resolve(distRoot, "app.html"));
  appShell = appShell.replace(/<html[^>]*>/, "<html lang=\"en\">");
  appShell = appShell.replace(/<title>[^<]*<\/title>/, "<title>Notinn — Your Notes Dashboard</title>");
  appShell = replaceMeta(appShell, "description", "Notinn dashboard. Sign in through Telegram to read your notes.");
  appShell = replaceMeta(appShell, "robots", "noindex, nofollow");
  appShell = appShell.replace(/<div id=\"root\"><\/div>/, "<div id=\"root\"></div>");
  writeFileSync(resolve(distRoot, "app.html"), appShell);

  // Static SPA routes fallback
  const spaRoutes = ["notes", "login", "auth", "auth/callback", "usage", "settings", "admin"];
  for (const route of spaRoutes) {
    const dir = resolve(distRoot, route);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "index.html"), appShell);
  }


  const socialImage = absoluteUrl(config.siteUrl, "/notinn-social.png");
  const landingBody = renderLanding();
  const landingShell = replaceDocumentMetadata(shell, {
    lang: "en",
    title: landingTitle,
    description: landingDescription,
    robots: config.indexable ? "index, follow" : "noindex, nofollow",
    canonical: absoluteUrl(config.siteUrl, "/"),
    ogTitle: "Raw material in. Tidy notes out.",
    ogDescription: landingOgDescription,
    socialImage,
    locale: "en_GB",
    jsonLd: [
      "<script type=\"application/ld+json\">",
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Notinn",
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Web and Telegram interface",
        description: landingDescription,
        url: absoluteUrl(config.siteUrl, "/"),
      }),
      "</script>",
    ].join(""),
  }).replace(
    "<div id=\"root\"></div>",
    `<div id="root" data-prerendered="true">${landingBody}</div>`,
  );
  writeFileSync(clientIndex, landingShell);

  const legalEntries = [
    {
      sourcePath: privacySource,
      directory: resolve(distRoot, "privacy"),
      pageTitle: "Notinn privacy notice",
      description: "How Notinn handles Telegram content, AI processing, retention, and deletion.",
      metadataTitle: "Notinn privacy notice",
    },
    {
      sourcePath: termsSource,
      directory: resolve(distRoot, "terms"),
      pageTitle: "Notinn Closed Alpha terms",
      description: "Closed Alpha eligibility, AI limits, fair use, and deletion rules.",
      metadataTitle: "Notinn Closed Alpha terms",
    },
  ];

  for (const entry of legalEntries) {
    const body = await buildLegalPage({
      sourcePath: entry.sourcePath,
      pageTitle: entry.pageTitle,
      description: entry.description,
    });
    const directory = entry.directory;
    const urlPath = directory === resolve(distRoot, "privacy") ? "/privacy" : "/terms";
    const legalShell = replaceLegalBody(
      replaceDocumentMetadata(shell, {
        lang: "en",
        title: entry.metadataTitle,
        description: entry.description,
        robots: config.indexable ? "index, follow" : "noindex, nofollow",
        canonical: absoluteUrl(config.siteUrl, urlPath),
        ogTitle: entry.metadataTitle,
        ogDescription: entry.description,
        socialImage,
        locale: "en_US",
        jsonLd: [
          "<script type=\"application/ld+json\">",
          JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: entry.metadataTitle,
            description: entry.description,
            url: absoluteUrl(config.siteUrl, urlPath),
          }),
          "</script>",
        ].join(""),
      }),
      body,
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "index.html"), legalShell);
  }

  writeFileSync(resolve(distRoot, "robots.txt"), robotsText(config));
  writeFileSync(resolve(distRoot, "sitemap.xml"), sitemapXml(config));

  rmSync(resolve(dashboardRoot, "dist-ssr"), { recursive: true, force: true });
  const leftovers = readdirSync(distRoot).filter((name) => name.endsWith(".map"));
  if (leftovers.length > 0) {
    console.log(`Preserving source maps in dist: ${leftovers.join(", ")}`);
  }
}

await main();
