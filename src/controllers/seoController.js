import JobSeeker from "../models/JobSeeker.js";

const PAGE_SIZE = 10000;

function siteOrigin() {
  const raw = process.env.CLIENT_URL || process.env.FRONTEND_URL || "https://myprofilelive.com";
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
