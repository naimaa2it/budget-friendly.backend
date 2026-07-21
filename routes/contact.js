import express from "express";
import { sendContactEmail } from "../lib/mailer.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, email, message } = req.body || {};

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: "Name, email and message are required." });
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  if (message.trim().length < 10) {
    return res.status(400).json({ error: "Message must be at least 10 characters." });
  }

  // Await the send — on Vercel the function invocation ends as soon as the
  // response is flushed, so fire-and-forget email sends here get killed
  // before the SMTP handshake completes and silently never arrive.
  await sendContactEmail({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    message: message.trim(),
  }).catch((err) => {
    console.error("[contact] email error:", err.message);
  });

  res.json({ success: true });
});

export default router;
