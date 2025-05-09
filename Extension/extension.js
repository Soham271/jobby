// Determine context (background or content script) based on whether 'document' is accessible
const isBackground = !window.document;

// Background script logic (runs in service worker context)
if (isBackground) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === "fetchData") {
        fetch("http://localhost:3004/api/v1/getRegister")
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            return res.json();
          })
          .then((data) => {
            console.log("Fetched data (raw):", JSON.stringify(data, null, 2));
            const normalizedData = normalizeData(data);
            console.log(
              "Normalized data:",
              JSON.stringify(normalizedData, null, 2)
            );
            sendResponse({ data: normalizedData });
          })
          .catch((err) => {
            console.error("Fetch data error:", err.message);
            sendResponse({ error: err.message });
          });
        return true;
      }

      if (request.action === "scrapeFields") {
        fetch("http://localhost:3004/api/v1/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: request.url }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            return res.json();
          })
          .then((data) => {
            console.log("Scraped fields (raw):", JSON.stringify(data, null, 2));
            const fields = data.fields || data;
            console.log("Processed fields:", JSON.stringify(fields, null, 2));
            sendResponse({ data: { fields } });
          })
          .catch((err) => {
            console.error("Scrape fields error:", err.message);
            sendResponse({ error: err.message });
          });
        return true;
      }
    } catch (error) {
      console.error("Background script error:", error.message);
      sendResponse({ error: error.message });
      return true;
    }
  });
}

// Content script logic (runs in web page context)
if (!isBackground) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === "dynamicAutofill") {
        console.log(
          "Received dynamicAutofill request:",
          JSON.stringify(request, null, 2)
        );

        // Fetch user data
        chrome.runtime.sendMessage({ action: "fetchData" }, (response) => {
          try {
            if (response.error) {
              console.error("Fetch data error in autofill:", response.error);
              sendResponse({ error: response.error });
              return;
            }

            const data = response.data || {};
            const fields = request.fields || {};

            console.log("Autofill data:", JSON.stringify(data, null, 2));
            console.log("Autofill fields:", JSON.stringify(fields, null, 2));

            if (!Object.keys(fields).length) {
              console.warn("No fields provided for autofill");
              sendResponse({
                error: "No fields provided for autofill",
                filled: [],
                unfilled: [],
              });
              return;
            }

            // Map backend data to form fields
            const unfilled = [];
            const filled = [];
            for (const [key, selector] of Object.entries(fields)) {
              try {
                let input = null;
                // Validate selector
                if (typeof selector === "string" && selector.trim()) {
                  input = document.querySelector(selector);
                } else {
                  console.warn(
                    `Invalid selector for key "${key}": ${selector}`
                  );
                }

                if (!input) {
                  // Expanded fallback selectors
                  const normalizedKey = key
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");
                  const selectors = [
                    `input[name="${key.toLowerCase()}"]`,
                    `textarea[name="${key.toLowerCase()}"]`,
                    `select[name="${key.toLowerCase()}"]`,
                    `input[id="${key.toLowerCase()}"]`,
                    `input[name*="${normalizedKey}"]`,
                    `input[id*="${normalizedKey}"]`,
                    `input[name*="${key
                      .toLowerCase()
                      .replace("fullname", "name")}"]`,
                  ];
                  for (const sel of selectors) {
                    try {
                      input = document.querySelector(sel);
                      if (input) break;
                    } catch (selError) {
                      console.warn(
                        `Invalid fallback selector "${sel}" for key "${key}":`,
                        selError.message
                      );
                    }
                  }
                  console.warn(
                    `Selector "${selector}" not found for key "${key}", tried fallbacks: ${selectors.join(
                      ", "
                    )}`
                  );
                }

                if (input && data[key]) {
                  try {
                    input.value = data[key];
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    console.log(
                      `Filled field "${key}" with value "${
                        data[key]
                      }" using selector "${input ? selector : "fallback"}"`
                    );
                    filled.push(key);
                  } catch (fillError) {
                    console.error(
                      `Error filling field "${key}":`,
                      fillError.message
                    );
                    unfilled.push(key);
                  }
                } else {
                  console.warn(
                    `No input found for key "${key}" or no data available (data[${key}] = ${data[key]})`
                  );
                  unfilled.push(key);
                }
              } catch (entryError) {
                console.error(
                  `Error processing field "${key}" with selector "${selector}":`,
                  entryError.message
                );
                unfilled.push(key);
              }
            }

            // Monitor for dynamic fields (stop after 15 seconds)
            const observer = new MutationObserver(() => {
              for (const [key, selector] of Object.entries(fields)) {
                try {
                  const input = document.querySelector(selector);
                  if (input && data[key] && !input.value) {
                    input.value = data[key];
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    console.log(
                      `Dynamic: Filled field "${key}" with value "${data[key]}"`
                    );
                    if (!filled.includes(key)) filled.push(key);
                    if (unfilled.includes(key))
                      unfilled.splice(unfilled.indexOf(key), 1);
                  }
                } catch (dynamicError) {
                  console.error(
                    `Dynamic fill error for "${key}":`,
                    dynamicError.message
                  );
                }
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
              observer.disconnect();
              console.log("Stopped observing for dynamic fields");
            }, 15000);

            console.log(
              `Autofill summary: Filled=${filled.length}, Unfilled=${unfilled.length}`
            );
            sendResponse({ success: true, filled, unfilled });
          } catch (autofillError) {
            console.error("Autofill processing error:", autofillError.message);
            sendResponse({
              error: autofillError.message,
              filled: [],
              unfilled: Object.keys(fields),
            });
          }
        });
        return true;
      }
    } catch (error) {
      console.error("Content script error:", error.message);
      sendResponse({ error: error.message });
      return true;
    }
  });
}

// Normalize data to match expected keys
function normalizeData(data) {
  if (!data || typeof data !== "object") return {};
  const keyMap = {
    name: "FullName",
    full_name: "FullName",
    email: "email",
    phone: "phone",
    github: "github",
    linkedin: "linkedin",
    domain: "domainSpecialization",
    specialization: "domainSpecialization",
    skills: "skills",
    experience: "experience",
  };
  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    const mappedKey = keyMap[key.toLowerCase()] || key;
    normalized[mappedKey] = value;
  }
  return normalized;
}
