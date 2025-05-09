import express from "express";
import { scrapeFormFields } from "../scrapping.js";

const router = express.Router();

router.post("/scrape", async (req, res) => {
  try {
    const { url } = req.body;
    const fields = await scrapeFormFields(url); // return { name, email, phone, etc. }
    res.status(200).json({ success: true, fields });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
