// scrapeFormFields.js
import puppeteer from "puppeteer";
import fs from "fs";

const targetFields = [
  "fullname",
  "name",
  "full name",
  "full_name",
  "email",
  "email address",
  "mail",
  "phone",
  "phone number",
  "tel",
  "telephone",
  "github",
  "github url",
  "github profile",
  "linkedin",
  "linkedin url",
  "linkedin profile",
  "domain",
  "specialization",
  "domainSpecialization",
  "skills",
  "skill set",
  "expertise",
  "experience",
  "work experience",
  "employment",
];

async function scrapeFormFields(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  console.log(`🔍 Navigating to ${url}...`);
  await page.goto(url, { waitUntil: "networkidle2" });

  const relevantFields = await page.$$eval(
    "input, textarea, select",
    (elements, targets) => {
      return elements
        .filter((el) => {
          const id = (el.getAttribute("id") || "").toLowerCase();
          const name = (el.getAttribute("name") || "").toLowerCase();
          const placeholder = (
            el.getAttribute("placeholder") || ""
          ).toLowerCase();
          const labelFor =
            el.labels && el.labels.length > 0
              ? el.labels[0].innerText.toLowerCase()
              : "";

          return targets.some(
            (target) =>
              id.includes(target) ||
              name.includes(target) ||
              placeholder.includes(target) ||
              labelFor.includes(target)
          );
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") || null,
          id: el.getAttribute("id") || null,
          name: el.getAttribute("name") || null,
          placeholder: el.getAttribute("placeholder") || null,
          value: el.value || null,
        }));
    },
    targetFields
  );

  await browser.close();
  return relevantFields;
}

// Use hardcoded NVIDIA Contact page
const url = "https://developer.nvidia.com/contact";

scrapeFormFields(url)
  .then((fields) => {
    console.log("✅ Relevant form fields found:\n");
    console.log(fields);

    fs.writeFileSync("formFields.json", JSON.stringify(fields, null, 2));
    console.log("\n💾 Saved to formFields.json");
  })
  .catch((err) => {
    console.error("❌ Error scraping form fields:", err.message);
    process.exit(1);
  });
