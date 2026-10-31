import sharp from "sharp";
import JobSeeker from "../models/JobSeeker.js";
import StoredImage from "../models/StoredImage.js";
import { paidCandidateQuery } from "../utils/candidateVisibility.js";
import { COMPANY_PLANS, CANDIDATE_PLANS, EXTRA_LEAD_PRICING } from "../data/plans.js";
import { chargePaise } from "../utils/gst.js";

const PAGE_SIZE = 10000;

function siteOrigin() {
  const raw = process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://myprofilelive.com";
  return raw.split(",")[0].trim().replace(/\/$/, "");
}

function listed() {
  return {
    publicSlug: { $type: "string", $ne: "" },
    ...paidCandidateQuery(),
  };
}

const CONTENT_DATE = "2026-10-31";

function urlEntry(loc, lastmod, priority) {
  const mod = lastmod ? new Date(lastmod).toISOString().slice(0, 10) : CONTENT_DATE;
  return `<url><loc>${loc}</loc><lastmod>${mod}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`;
}

function jsonLdTag(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

const HOME_FAQS = [
  ["What is My Profile Live?", "My Profile Live is an executive hiring platform. A job seeker publishes one public profile. A company browses those profiles and unlocks the phone number and email only when it is ready to hire."],
  ["Who can create an account?", "A job seeker and a company each have their own registration. An agent account is created by the admin. Sign in and registration use the same screens that are already on the site."],
  ["Is my phone number public?", "No. The public profile shows professional details such as role, skills, and location. The phone number and email stay hidden until a company unlocks that contact."],
  ["What does a new company pay?", "A new company starts on a 30-day trial for ₹99, including GST, with 15 leads. Longer company plans add 18% GST at checkout. The full list is on the pricing page."],
  ["What does a new job seeker pay?", "A new job seeker starts on a 3-month trial for ₹1, including GST, with 10 credits. Job seeker plan prices already include GST."],
  ["How does a company reach a candidate?", "The company opens the public profile, then uses Unlock Contact. That spends one lead and reveals the phone number and email for that candidate."],
  ["Do you post jobs on this site?", "No. Companies do not post openings here, and job seekers do not apply to a job ad. Hiring starts from the verified profile."],
  ["Where is My Profile Live based?", "The platform is operated by NILKANTH ENTERPRISE from Mota Varachha, Surat, Gujarat, India. The contact page lists the address, phone, and email."],
];

function faqEntities() {
  return HOME_FAQS.map(([name, text]) => ({
    "@type": "Question",
    name,
    acceptedAnswer: { "@type": "Answer", text },
  }));
}

function crawlerGraph(origin, ...pages) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "LocalBusiness"],
        "@id": `${origin}/#organization`,
        name: "My Profile Live",
        legalName: "NILKANTH ENTERPRISE",
        url: origin,
        logo: `${origin}/mpl-logo.webp`,
        email: "myprofilelive5@gmail.com",
        telephone: "+91-7600688820",
        taxID: "24AASFN7398A1ZW",
        slogan: "Right executive. Right company. Faster hiring.",
        address: {
          "@type": "PostalAddress",
          streetAddress: "GF, House No 594, Nishal Faliyu, Mota Varachha Main Road, Mota Varachha",
          addressLocality: "Surat",
          addressRegion: "Gujarat",
          postalCode: "394105",
          addressCountry: "IN",
        },
        areaServed: "India",
        sameAs: [
          "https://x.com/myprofilelive",
          "https://www.instagram.com/myprofilelive/",
          "https://www.facebook.com/myprofilelive",
          "https://www.youtube.com/@myprofilelive",
          "https://www.linkedin.com/company/my-profile-livee",
        ],
        founder: { "@type": "Person", name: "Bhautik Bhuva", jobTitle: "Founder and CEO" },
        employee: [
          { "@type": "Person", name: "Bhautik Bhuva", jobTitle: "Founder and CEO" },
          { "@type": "Person", name: "Vinayak Kachchiya", jobTitle: "Marketing partner" },
          { "@type": "Person", name: "Satish Tiwari", jobTitle: "Strategist partner" },
          { "@type": "Person", name: "Himanshu Kapuriya", jobTitle: "Developer and tech lead", url: "https://www.himanshukapuriya.com/" },
        ],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          telephone: "+91-7600688820",
          email: "myprofilelive5@gmail.com",
          areaServed: "IN",
          availableLanguage: ["en"],
        },
        knowsAbout: ["Executive hiring", "Verified professional profiles", "Private contact details"],
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "My Profile Live",
        url: origin,
        inLanguage: "en-IN",
        publisher: { "@id": `${origin}/#organization` },
      },
      ...pages,
    ],
  };
}

function staticPages(origin) {
  return [
    urlEntry(`${origin}/`, null, "1.0"),
    urlEntry(`${origin}/about`, null, "0.7"),
    urlEntry(`${origin}/pricing`, null, "0.6"),
    urlEntry(`${origin}/faq`, null, "0.6"),
    urlEntry(`${origin}/contact`, null, "0.5"),
    urlEntry(`${origin}/privacy-policy`, null, "0.3"),
  ];
}

function inrFromPaise(paise) {
  const rupees = Math.round((Number(paise) || 0) / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}

function planRows(plans, userType) {
  return plans
    .filter((plan) => plan.id !== "1m" && plan.id !== "10k")
    .map((plan) => {
      const payable = inrFromPaise(chargePaise(userType, plan.price * 100).totalPaise);
      const name = escapeHtml(plan.badge === "recommended" ? `${plan.label} (recommended)` : plan.label);
      return `<tr><td>${name}</td><td>${escapeHtml(payable)}</td><td>${plan.leads}</td></tr>`;
    })
    .join("");
}

export function pricingPage(req, res) {
  const origin = siteOrigin();
  const url = `${origin}/pricing`;
  const description = "Company and job seeker plans on My Profile Live, with lead counts and GST.";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Plans and pricing | My Profile Live</title>
<link rel="canonical" href="${escapeHtml(url)}" />
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="index, follow" />
${jsonLdTag(crawlerGraph(origin, { "@type": "WebPage", "@id": `${url}#webpage`, name: "Plans and pricing", url, description, isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#organization` } }))}
<style>
body{margin:0;font-family:Segoe UI,sans-serif;background:#f8fafc;color:#334155}
main{max-width:42rem;margin:0 auto;padding:2rem 1rem}
h1,h2{color:#0d1a40}
table{width:100%;border-collapse:collapse;background:#fff}
th,td{text-align:left;padding:.75rem 1rem;border-top:1px solid #e2e8f0}
th{background:#f8fafc;font-size:.75rem;text-transform:uppercase}
</style>
</head>
<body>
<main>
<h1>Plans and pricing</h1>
<p>A new company starts on a 30-day trial for ₹99, including GST, with 15 leads. A new job seeker starts on a 3-month trial for ₹1, including GST, with 10 credits. The plans below replace that trial.</p>
<h2>Companies</h2>
<p>The amount you pay includes 18% GST.</p>
<table><thead><tr><th>Plan</th><th>You pay</th><th>Leads</th></tr></thead><tbody>${planRows(COMPANY_PLANS, "company")}</tbody></table>
<p>Extra company leads are ₹${EXTRA_LEAD_PRICING.company.perLead} each, minimum ${EXTRA_LEAD_PRICING.company.minimum}, plus 18% GST.</p>
<h2>Job seekers</h2>
<p>These prices already include GST.</p>
<table><thead><tr><th>Plan</th><th>You pay</th><th>Credits</th></tr></thead><tbody>${planRows(CANDIDATE_PLANS, "jobseeker")}</tbody></table>
<p>Extra job seeker credits are ₹${EXTRA_LEAD_PRICING.jobseeker.perLead} each, minimum ${EXTRA_LEAD_PRICING.jobseeker.minimum}, including GST.</p>
</main>
</body>
</html>`;
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(html);
}

function guidePage({ title, description, canonical, body, schema }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta name="description" content="${escapeHtml(description)}" />
<meta name="robots" content="index, follow" />
${schema ? jsonLdTag(schema) : ""}
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

export function aboutPage(req, res) {
  const origin = siteOrigin();
  const description = "My Profile Live is an executive hiring platform operated by NILKANTH ENTERPRISE in Surat. Phone numbers and email stay private until a company unlocks them.";
  const html = guidePage({
    title: "About us | My Profile Live",
    description,
    canonical: `${origin}/about`,
    schema: crawlerGraph(origin, { "@type": "AboutPage", "@id": `${origin}/about#webpage`, name: "About us", url: `${origin}/about`, description, isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#organization` } }),
    body: `<h1>About My Profile Live</h1>
<p>A company should meet the right executive without posting a job and waiting. A job seeker should be discoverable without putting a phone number on the open internet.</p>
<p>The job seeker keeps one verified public profile. The company browses it, then unlocks contact only when it is ready to talk.</p>
<p>My Profile Live is operated by NILKANTH ENTERPRISE, GF, House No 594, Nishal Faliyu, Mota Varachha Main Road, Mota Varachha, Surat, Gujarat, 394105, India.</p>
<p><a href="${origin}/pricing">Pricing</a> · <a href="${origin}/contact">Contact</a> · <a href="${origin}/faq">FAQ</a></p>`,
  });
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(html);
}

export function contactPage(req, res) {
  const origin = siteOrigin();
  const description = "Contact NILKANTH ENTERPRISE in Mota Varachha, Surat. Phone +91 7600688820. Email myprofilelive5@gmail.com.";
  const html = guidePage({
    title: "Contact us | My Profile Live",
    description,
    canonical: `${origin}/contact`,
    schema: crawlerGraph(origin, { "@type": "ContactPage", "@id": `${origin}/contact#webpage`, name: "Contact us", url: `${origin}/contact`, description, isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#organization` } }),
    body: `<h1>Contact us</h1>
<p>NILKANTH ENTERPRISE<br>GF, House No 594, Nishal Faliyu, Mota Varachha Main Road, Mota Varachha, Surat, Gujarat, 394105</p>
<p>Phone: <a href="tel:+917600688820">+91 7600688820</a></p>
<p>Email: <a href="mailto:myprofilelive5@gmail.com">myprofilelive5@gmail.com</a></p>
<p>The contact page on the website also has a form. It emails the platform team and sends a confirmation to the person who wrote.</p>
<p><a href="${origin}/about">About</a> · <a href="${origin}/privacy-policy">Privacy policy</a></p>`,
  });
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(html);
}

export function faqPage(req, res) {
  const origin = siteOrigin();
  const description = "Answers about the My Profile Live platform: private contact, trials, Unlock Contact, and how hiring starts from a verified profile.";
  const html = guidePage({
    title: "FAQ | My Profile Live",
    description,
    canonical: `${origin}/faq`,
    schema: crawlerGraph(origin, { "@type": "FAQPage", "@id": `${origin}/faq#webpage`, name: "FAQ", url: `${origin}/faq`, description, isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#organization` }, mainEntity: faqEntities() }),
    body: `<h1>FAQ</h1>
<h2>What is My Profile Live?</h2>
<p>An executive hiring platform. A job seeker publishes one public profile. A company unlocks the phone number and email only when it is ready to hire.</p>
<h2>Is my phone number public?</h2>
<p>No. The public profile shows professional details. The phone number and email stay hidden until a company unlocks that contact.</p>
<h2>What does a new company pay?</h2>
<p>A new company starts on a 30-day trial for ₹99, including GST, with 15 leads. Longer company plans add 18% GST at checkout.</p>
<h2>What does a new job seeker pay?</h2>
<p>A new job seeker starts on a 3-month trial for ₹1, including GST, with 10 credits. Job seeker plan prices already include GST.</p>
<h2>Do you post jobs on this site?</h2>
<p>No. Companies do not post openings here, and job seekers do not apply to a job ad.</p>
<p><a href="${origin}/pricing">Pricing</a> · <a href="${origin}/contact">Contact</a></p>`,
  });
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(html);
}

export function homePage(req, res) {
  const origin = siteOrigin();
  const description = "Verified executive profiles for companies in India. Phone and email stay private until a company unlocks contact. Operated from Surat by NILKANTH ENTERPRISE.";
  const html = guidePage({
    title: "My Profile Live | Executive Hiring Platform",
    description,
    canonical: `${origin}/`,
    schema: crawlerGraph(
      origin,
      { "@type": "WebPage", "@id": `${origin}/#webpage`, name: "My Profile Live", url: origin, description, isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#organization` }, hasPart: { "@id": `${origin}/#faq` } },
      { "@type": "FAQPage", "@id": `${origin}/#faq`, name: "Questions before you start", url: `${origin}/#faq`, isPartOf: { "@id": `${origin}/#webpage` }, mainEntity: faqEntities() },
    ),
    body: `<h1>Right executive. Right company. Faster hiring.</h1>
<p>My Profile Live gives a job seeker one public profile and gives a company a private way to reach them. Contact details are revealed only when the company chooses to unlock them.</p>
<p>Company trial: ₹99 including GST, 15 leads, 30 days. Job seeker trial: ₹1 including GST, 10 credits, 3 months.</p>
<h2>Questions before you start</h2>
${HOME_FAQS.map(([question, answer]) => `<h3>${question}</h3><p>${answer}</p>`).join("\n")}
<p><a href="${origin}/about">About</a> · <a href="${origin}/pricing">Pricing</a> · <a href="${origin}/faq">FAQ</a> · <a href="${origin}/contact">Contact</a> · <a href="${origin}/login">Log in</a> · <a href="${origin}/signup">Register</a></p>`,
  });
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(html);
}

export async function sitemapIndex(req, res) {
  const origin = siteOrigin();
  const total = await JobSeeker.countDocuments(listed());
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (pages === 1) {
    const people = await JobSeeker.find(listed()).select("publicSlug updatedAt").sort({ _id: 1 }).lean();
    const body = [
      ...staticPages(origin),
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
  const people = await JobSeeker.find(listed())
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
    "This file is generated from the live site. A profile appears here only after the trial payment and while that job seeker's plan is active.",
    "",
    "## Pages",
    "",
    markdownLink("Home", `${origin}/`, "Executive hiring platform for verified profiles"),
    markdownLink("About", `${origin}/about`, "Goals and vision of My Profile Live, operated from Surat"),
    markdownLink("Plans and pricing", `${origin}/pricing`, "Company and job seeker plans, lead counts, and GST"),
    markdownLink("FAQ", `${origin}/faq`, "How private contact, trials, and unlock work"),
    markdownLink("Contact", `${origin}/contact`, "NILKANTH ENTERPRISE office in Mota Varachha, Surat"),
    markdownLink("Privacy policy", `${origin}/privacy-policy`, "How My Profile Live handles personal information"),
    markdownLink("Sitemap", `${origin}/sitemap.xml`, "Every public URL currently available to search engines"),
    "",
    "## Business",
    "",
    "- Legal name: NILKANTH ENTERPRISE",
    "- GSTIN: 24AASFN7398A1ZW",
    "- Address: GF, House No 594, Nishal Faliyu, Mota Varachha Main Road, Mota Varachha, Surat, Gujarat, 394105, India",
    "- Phone: +91 7600688820",
    "- Email: myprofilelive5@gmail.com",
    "- Slogan: Right executive. Right company. Faster hiring.",
    "",
    "## Team",
    "",
    "- Bhautik Bhuva, Founder and CEO",
    "- Vinayak Kachchiya, Marketing partner",
    "- Satish Tiwari, Strategist partner",
    "- Himanshu Kapuriya, Developer and tech lead: https://www.himanshukapuriya.com/",
    "",
    "## Plans",
    "",
    "- Company trial: ₹99 including GST, 15 leads, 30 days.",
    "- Job seeker trial: ₹1 including GST, 10 credits, 3 months.",
    "- Company plans add 18% GST at checkout. Public card prices for 3, 6, and 12 months are ₹2,549, ₹4,549, and ₹8,549 before GST.",
    "- Job seeker paid prices include GST: 3 months ₹249, 6 months ₹449, 12 months ₹849.",
    "- Extra company leads: ₹50 each before GST, minimum 25.",
    "- Extra job seeker credits: ₹10 each including GST, minimum 25.",
    "",
    "## Social",
    "",
    "- https://x.com/myprofilelive",
    "- https://www.instagram.com/myprofilelive/",
    "- https://www.facebook.com/myprofilelive",
    "- https://www.youtube.com/@myprofilelive",
    "- https://www.linkedin.com/company/my-profile-livee",
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
  const people = await JobSeeker.find(listed())
    .select("publicSlug updatedAt")
    .sort({ _id: 1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const entries = people.map((person) => urlEntry(`${origin}/${person.publicSlug}`, person.updatedAt, "0.8"));
  if (page === 1) {
    entries.unshift(...staticPages(origin));
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

function cardDocument({ title, description, image, imageType, width, height, url, type, schema }) {
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
${schema ? jsonLdTag(schema) : ""}
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
    const person = await JobSeeker.findOne({ ...listed(), publicSlug: slug })
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
      const profileUrl = `${origin}/${person.publicSlug}`;
      res.send(cardDocument({
        title,
        description,
        image: hasPhoto ? `${origin}/api/public/profile/${person.publicSlug}/share.jpg` : `${origin}/og-image.png`,
        imageType: hasPhoto ? "image/jpeg" : "image/png",
        width: hasPhoto ? 800 : 1200,
        height: hasPhoto ? 800 : 630,
        url: profileUrl,
        type: "profile",
        schema: crawlerGraph(origin, {
          "@type": "ProfilePage",
          "@id": `${profileUrl}#webpage`,
          name: person.fullName,
          url: profileUrl,
          description,
          isPartOf: { "@id": `${origin}/#website` },
          mainEntity: {
            "@type": "Person",
            name: person.fullName,
            jobTitle: role || undefined,
            url: profileUrl,
            address: place ? { "@type": "PostalAddress", addressLocality: person.city || undefined, addressRegion: person.state || undefined, addressCountry: "IN" } : undefined,
          },
        }),
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

  const person = await JobSeeker.findOne({ ...listed(), publicSlug: slug }).select("photo").lean();
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
