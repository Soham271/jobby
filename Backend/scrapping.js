import puppeteer from "puppeteer";

export async function scrapeFormFields(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page
      .waitForSelector("input, textarea, select", { timeout: 5000 })
      .catch(() => {
        console.warn("No form fields found.");
      });

    // Extract all fields and generate unique selectors
    const allFields = await page.$$eval("input, textarea, select", (elements) =>
      elements.map((el) => {
        // Helper defined inside the browser context
        function getUniqueSelector(el) {
          const parts = [];
          while (el && el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
              selector += `#${el.id}`;
              parts.unshift(selector);
              break;
            } else {
              let sib = el;
              let nth = 1;
              while ((sib = sib.previousElementSibling)) {
                if (sib.nodeName.toLowerCase() === selector) nth++;
              }
              selector += `:nth-of-type(${nth})`;
            }
            parts.unshift(selector);
            el = el.parentNode;
          }
          return parts.join(" > ");
        }

        return {
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          id: el.id || "",
          name: el.name || "",
          placeholder: el.placeholder || "",
          labels: Array.from(el.labels || []).map((l) => l.innerText.trim()),
          autocomplete: el.autocomplete || "",
          selector: getUniqueSelector(el),
        };
      })
    );

    // Define mapping keywords for relevant fields
    const fieldMatches = {
      FullName: ["name", "fullname", "full_name"],
      email: ["email", "e-mail"],
      phone: ["phone", "mobile", "tel"],
      github: ["github"],
      linkedin: ["linkedin"],
      domainSpecialization: ["domain", "specialization", "field", "stream"],
      skills: ["skills", "technologies"],
      experience: ["experience", "work", "job"],
    };

    // Match fields using keyword presence in id/name/placeholder/labels
    function matchField(field, keywords) {
      const haystack = [
        field.id,
        field.name,
        field.placeholder,
        ...field.labels,
      ]
        .join(" ")
        .toLowerCase();

      return keywords.some((kw) => haystack.includes(kw));
    }

    const filteredFields = {};
    for (const [key, keywords] of Object.entries(fieldMatches)) {
      const match = allFields.find((field) => matchField(field, keywords));
      if (match) {
        filteredFields[key] = match.selector;
      }
    }

    console.log("Matched fields:", filteredFields);
    return { fields: filteredFields };
  } catch (error) {
    console.error("Scraping error:", error);
    throw new Error("Failed to scrape form fields.");
  } finally {
    await browser.close();
  }
}
