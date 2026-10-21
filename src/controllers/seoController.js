import sharp from "sharp";
import JobSeeker from "../models/JobSeeker.js";
import StoredImage from "../models/StoredImage.js";

const PAGE_SIZE = 10000;

function siteOrigin() {
  const raw = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://myprofilelive.com";
  return raw.split(",")[0].trim().replace(/\/$/, "");
}

const listed = {
  publicSlug: { $type: "string", $ne: "" },
  status: { $ne: "Inactive" },
  currentPlan: { $type: "string", $ne: "" },
  planExpiry: { $gt: new Date() },
};

function urlEntry(loc, lastmod, priority) {
  const mod = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : "";
  return `<url><loc>${loc}</loc>${mod}<changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
}

export async function sitemapIndex(req, res) {
  const origin = siteOrigin();
  const total = await JobSeeker.countDocuments(listed);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (pages === 1) {
    const people = await JobSeeker.find(listed).select("publicSlug updatedAt").sort({ _id: 1 }).lean();
    const body = [
      urlEntry(`${origin}/`, null, "1.0"),
      urlEntry(`${origin}/privacy-policy`, null, "0.3"),
      ...people.map((person) => urlEntry(`${origin}/${person.publicSlug}`, person.updatedAt, "0.8")),
    ].join("");
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
    return;
  }

  const links = Array.from({ length: pages }, (_, index) => {
    const page = index + 1;
    return `<sitemap><loc>${origin}/sitemap-${page}.xml</loc></sitemap>`;
  }).join("");
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${links}</sitemapindex>`);
}

function markdownLink(title, url, description) {
  const label = String(title || "Page").replace(/[\[\]\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const note = String(description || "").replace(/\s+/g, " ").trim();
  return note ? `- [${label}](${url}): ${note}` : `- [${label}](${url})`;
}

export async function llmsTxt(req, res) {
  const origin = siteOrigin();
  const people = await JobSeeker.find(listed)
    .select("fullName publicSlug currentJobTitle currentCompany city state")
    .sort({ updatedAt: -1, fullName: 1 })
    .lean();

  const profiles = people
    .filter((person) => person.publicSlug && person.fullName)
    .map((person) => {
      const role = [person.currentJobTitle, person.currentCompany].filter(Boolean).join(" at ");
      const place = [person.city, person.state].filter(Boolean).join(", ");
      const summary = role && place ? `${role}, ${place}` : role || place;
      return markdownLink(person.fullName, `${origin}/${person.publicSlug}`, summary);
    });

  const lines = [
    "# My Profile Live",
    "",
    "> My Profile Live connects verified executives with companies. A public profile shows professional details, while phone numbers and email addresses stay private until a company unlocks them.",
    "",
    "This file is generated from the live site. A profile appears here only while that job seeker's plan is active, and it is removed automatically when the plan expires.",
    "",
    "## Pages",
    "",
    markdownLink("Home", `${origin}/`, "Executive hiring platform for verified profiles"),
    markdownLink("Privacy policy", `${origin}/privacy-policy`, "How My Profile Live handles personal information"),
    markdownLink("Sitemap", `${origin}/sitemap.xml`, "Every public URL currently available to search engines"),
    "",
    "## Public profiles",
    "",
    profiles.length ? profiles.join("\n") : "No active public profiles are listed right now.",
    "",
  ];

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=120");
  res.set("Cloudflare-CDN-Cache-Control", "max-age=120");
  res.send(lines.join("\n"));
}

export async function sitemapPage(req, res) {
  const page = Math.max(1, Number(String(req.params.page).replace(".xml", "")) || 1);
  const origin = siteOrigin();
  const people = await JobSeeker.find(listed)
    .select("publicSlug updatedAt")
    .sort({ _id: 1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const entries = people.map((person) => urlEntry(`${origin}/${person.publicSlug}`, person.updatedAt, "0.8"));
  if (page === 1) {
    entries.unshift(urlEntry(`${origin}/`, null, "1.0"), urlEntry(`${origin}/privacy-policy`, null, "0.3"));
  }
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{4,8}$/;

const SITE_TITLE = "My Profile Live | Executive Hiring Platform";
const SITE_DESCRIPTION =
  "My Profile Live connects verified executives with companies. Share a public profile, keep your phone and email private, and let companies unlock contact.";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clamp(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}

function stripPrivate(text) {
  return String(text || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\+?\d[\d\s-]{8,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function storedImageId(photo) {
  try {
    const name = new URL(photo, siteOrigin()).pathname.split("/").pop() || "";
    const id = name.replace(/\.webp$/i, "");
    return /^[A-Za-z0-9_-]{8,32}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

function cardDocument({ title, description, image, imageType, width, height, url, type }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const i = escapeHtml(image);
  const u = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${t}</title>
<link rel="canonical" href="${u}" />
<meta name="description" content="${d}" />
<meta name="robots" content="index, follow" />
<meta property="og:type" content="${escapeHtml(type)}" />
<meta property="og:site_name" content="My Profile Live" />
<meta property="og:locale" content="en_IN" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${u}" />
<meta property="og:image" content="${i}" />
<meta property="og:image:secure_url" content="${i}" />
<meta property="og:image:type" content="${escapeHtml(imageType)}" />
<meta property="og:image:width" content="${width}" />
<meta property="og:image:height" content="${height}" />
<meta property="og:image:alt" content="${t}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${i}" />
</head>
<body><p><a href="${u}">${t}</a></p><p>${d}</p></body>
</html>`;
}

export async function socialCard(req, res) {
  const origin = siteOrigin();
  const slug = String(req.params.slug || "").replace(/\/$/, "");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "private, no-store");
  res.set("CDN-Cache-Control", "no-store");

  if (SLUG_RE.test(slug)) {
    const person = await JobSeeker.findOne({ ...listed, publicSlug: slug })
      .select("fullName publicSlug photo currentJobTitle currentCompany totalExperience city state about")
      .lean();
    if (person?.publicSlug && person.fullName) {
      const role = String(person.currentJobTitle || "").trim();
      let title = role ? `${person.fullName} | ${role}` : `${person.fullName} | My Profile Live`;
      if (title.length > 70) title = `${person.fullName} | My Profile Live`;
      const about = stripPrivate(person.about);
      const place = [person.city, person.state].filter(Boolean).join(", ");
      const company = person.currentCompany ? ` at ${person.currentCompany}` : "";
      const description = clamp(
        about.length >= 40
          ? about
          : `${person.fullName} is a ${role || "professional"}${company}${place ? ` in ${place}` : ""}. View skills, work history and availability on My Profile Live.`,
        160
      );
      const hasPhoto = Boolean(storedImageId(person.photo));
      res.send(cardDocument({
        title,
        description,
        image: hasPhoto ? `${origin}/api/public/profile/${person.publicSlug}/share.jpg` : `${origin}/og-image.png`,
        imageType: hasPhoto ? "image/jpeg" : "image/png",
        width: hasPhoto ? 800 : 1200,
        height: hasPhoto ? 800 : 630,
        url: `${origin}/${person.publicSlug}`,
        type: "profile",
      }));
      return;
    }
  }

  res.send(cardDocument({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    image: `${origin}/og-image.png`,
    imageType: "image/png",
    width: 1200,
    height: 630,
    url: `${origin}/`,
    type: "website",
  }));
}

export async function profileCardImage(req, res) {
  const slug = String(req.params.slug || "");
  if (!SLUG_RE.test(slug)) return res.status(404).end();

  const person = await JobSeeker.findOne({ ...listed, publicSlug: slug }).select("photo").lean();
  const id = storedImageId(person?.photo);
  if (!id) return res.redirect(302, `${siteOrigin()}/og-image.png`);

  const image = await StoredImage.findById(id).select("data").lean();
  const raw = image?.data;
  const buffer = Buffer.isBuffer(raw) ? raw : raw?.buffer ? Buffer.from(raw.buffer) : null;
  if (!buffer) return res.redirect(302, `${siteOrigin()}/og-image.png`);

  const jpeg = await sharp(buffer)
    .rotate()
    .resize(800, 800, { fit: "inside", withoutEnlargement: false })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "public, max-age=86400");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.set("X-Content-Type-Options", "nosniff");
  res.send(jpeg);
}
