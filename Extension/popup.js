let storedUrl = null;

document.addEventListener("DOMContentLoaded", () => {
  const fetchUrlBtn = document.getElementById("url");
  const fetchDataBtn = document.getElementById("fetchData");
  const scrapeBtn = document.getElementById("scrape");

  // Initially disable the Auto-fill button
  scrapeBtn.disabled = true;

  // Fetch URL
  fetchUrlBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.url.startsWith("http")) throw new Error("Invalid URL");

      storedUrl = tab.url;
      alert("URL fetched successfully!");

      // Enable the Auto-fill button
      scrapeBtn.disabled = false;
    } catch (error) {
      console.error("Fetch URL error:", error.message);
      alert("Failed to fetch URL: " + error.message);
    }
  });

  // Fetch Data (new button)
  fetchDataBtn.addEventListener("click", async () => {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "fetchData" }, resolve);
      });
      if (response.error) throw new Error(response.error);
      console.log(
        "Fetched data from backend:",
        JSON.stringify(response.data, null, 2)
      );
      alert("Data fetched and logged to console!");
    } catch (error) {
      console.error("Fetch data error:", error.message);
      alert("Failed to fetch data: " + error.message);
    }
  });

  // Auto-fill
  scrapeBtn.addEventListener("click", async () => {
    if (!storedUrl) return alert("Please fetch the URL first.");

    scrapeBtn.disabled = true;
    scrapeBtn.textContent = "Scraping...";

    try {
      // Scrape fields from backend
      const response = await fetch("http://localhost:3004/api/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: storedUrl }),
      });

      const result = await response.json();
      console.log("Scrape response:", JSON.stringify(result, null, 2));
      if (!response.ok) throw new Error(result.error || "Scraping failed");

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Ensure content script is injected
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["extension.js"],
      });

      // Send dynamicAutofill message
      const autofillResponse = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tab.id,
          { action: "dynamicAutofill", fields: result.fields || {} },
          resolve
        );
      });

      if (autofillResponse.error) throw new Error(autofillResponse.error);
      if (autofillResponse.unfilled?.length) {
        console.warn("Unfilled fields:", autofillResponse.unfilled);
        alert(
          `Auto-fill complete, but some fields were not filled: ${autofillResponse.unfilled.join(
            ", "
          )}`
        );
      } else if (!autofillResponse.filled?.length) {
        alert(
          "Auto-fill failed: No fields were filled. Check console logs for details."
        );
      } else {
        alert(
          "Auto-fill complete! Filled fields: " +
            autofillResponse.filled.join(", ")
        );
      }
    } catch (error) {
      console.error("Auto-fill error:", error.message);
      alert("Auto-fill failed: " + error.message);
    } finally {
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = "Auto-fill";
    }
  });
});
