import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Crucial: Use JSON body parser for incoming API payloads
  app.use(express.json());

  // ----------------- API ROUTES FIRST -----------------
  
  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // REAL EMAIL SENDER API
  app.post("/api/send-code", async (req: express.Request, res: express.Response) => {
    const { email, code, username } = req.body;

    if (!email || !code || !username) {
      return res.status(400).json({ error: "Шаардлагатай мэдээлэл дутуу байна." });
    }

    const gmailUser = process.env.EMAIL_USER;
    const gmailPass = process.env.EMAIL_PASS;

    // Strict local safety checks / fallback if credentials aren't ready
    if (!gmailUser || !gmailPass) {
      console.warn("[Gmail Server Warning] EMAIL_USER or EMAIL_PASS environment variables are not set.");
      return res.status(400).json({
        error: "Имэйл илгээх систем тохируулагдаагүй байна! Түр хүлээнэ үү эсвэл систем хариуцагчид хандана уу.",
        fallback: true
      });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      const mailOptions = {
        from: `"Ухаалаг Сургууль" <${gmailUser}>`,
        to: email,
        subject: "Ухаалаг Сургууль • Баталгаажуулах код",
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px;">
              <span style="font-size: 24px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px;">🏫 УХААЛАГ СУРГУУЛЬ</span>
              <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0; text-transform: uppercase; tracking: 1px; font-weight: 600;">Системд Нэвтрэх Эрх Сэргээх</p>
            </div>
            
            <div style="color: #334155; line-height: 1.6; font-size: 15px;">
              <p style="margin-top: 0;">Сайн байна уу, <strong style="color: #0f172a; font-weight: 700;">${username}</strong> нэвтрэх нэртэй хэрэглэгч танд энэхүү имэйлийг илгээж байна.</p>
              <p>Таны данс руу нэвтрэх нууц үгийг шинэчлэх түр зуурын 6 оронтой хамгаалалтын код амжилттай үүслээ. Доорх кодыг ашиглан нэг удаа нэвтэрч, нууц үгээ шинэчилнэ үү.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background-color: #f5f3ff; border: 2px dashed #c7d2fe; padding: 15px 40px; border-radius: 16px;">
                  <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #4f46e5; letter-spacing: 6px;">${code}</span>
                </div>
                <p style="font-size: 11px; color: #94a3b8; margin-top: 10px;">(Кодыг хуулж авахдаа анхааралтай хуулна уу)</p>
              </div>

              <p style="color: #dc2626; font-size: 12px; font-weight: 600; padding: 12px; background-color: #fef2f2; border-radius: 10px; margin-top: 20px;">
                ⚠️ Санамж: Энэхүү код нь зөвхөн 15 минутын хугацаанд хүчинтэй байна. Хэрэв та энэхүү хүсэлтийг илгээгээгүй бол доорх имэйлийг үл тоомсорлож, нууц үгээ хадгална уу.
              </p>
            </div>

            <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 12px;">
              <p style="margin: 0; font-weight: 600;">Ухаалаг Сургууль Холбооны Систем</p>
              <p style="margin: 4px 0 0 0;">Энэхүү имэйл нь автоматаар үүсгэгдсэн тул хариу бичих шаардлагагүй.</p>
            </div>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[Gmail Server] Successfully sent verification email directly to: ${email}`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Gmail Server Error] Nodemailer failed to send mail:", error);
      return res.status(500).json({
        error: "Имэйлийн SMTP холболт холбогдож чадсангүй. Эх үүсвэрийг шалгана уу.",
        details: error?.message || error
      });
    }
  });

  // GEMINI AI CHAT API
  app.post("/api/gemini/chat", async (req: express.Request, res: express.Response) => {
    const { prompt, history, role } = req.body;

    const key = process.env.GEMINI_API_KEY;
    console.log("DEBUG API KEY:", {
      exists: !!key,
      length: key ? key.length : 0,
      prefix: key ? key.substring(0, 10) : "",
      suffix: key ? key.substring(key.length - 10) : "",
    });
    if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "" || key.includes("placeholder")) {
      return res.status(500).json({
        error: "⚠️ Gemini API түлхүүр тохируулаагүй байна!\n\nШийдвэрлэх заавар:\n1. AI Studio дэлгэцийн баруун дээд талд байрлах 'Settings' (арааны зураг) товчийг дарна уу.\n2. 'Secrets' цэс рүү ороод 'GEMINI_API_KEY'-ийн арын 'Value' унах цэсийг (dropdown) дарна уу.\n3. Тэндээс 'AI Studio Free Tier' гэдгийг сонгоно уу.\n4. Доор нь гарч ирэх 'Apply changes' (Өөрчлөлтийг хэрэгжүүлэх) товчлуур дээр дарж хадгалаарай!\n\nЭнэ нь бүрэн ҮНЭГҮЙ бөгөөд ямар нэгэн карт эсвэл төлбөр нэхэхгүй шууд ажиллана."
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemInstruction = role === 'teacher'
        ? "Та бол 'Ухаалаг Сургууль' системийн Багш нарт зориулсан хиймэл оюун ухаант туслах (Gemini) юм. Багш нарт хичээл бэлтгэх, даалгавар, шалгалт, ирцийн бодлогод туслах, сурагчдын идэвхийг дээшлүүлэх мэргэжлийн бөгөөд найрсаг зөвлөгөөг богино, товчхон, хэрэгцээтэй хэлбэрээр өгнө үү. Монгол хэлээр харилцана."
        : "Та бол 'Ухаалаг Сургууль' системийн Сурагчдын сурлагад зориулсан хиймэл оюун ухаант зөвлөх (Gemini) юм. Сурагчдын хичээл даалгавар, асуусан шинжлэх ухаан, математик, хэл уран зохиолын асуултуудад маш хялбар ойлгомжтой, сонирхолтой байдлаар тайлбарлаж, урам зориг өгч тусална уу. Монгол хэлээр харилцана.";

      // Support simple structure
      const contents = history && Array.isArray(history) && history.length > 0
        ? [...history, { role: 'user', parts: [{ text: prompt }] }]
        : prompt;

      const responseStream = await ai.models.generateContentStream({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(chunk.text);
        }
      }
      res.end();
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      const isApiKeyError = error?.message?.includes("key not valid") || 
                            error?.message?.includes("API_KEY_INVALID") || 
                            error?.message?.includes("API key not valid") ||
                            error?.message?.includes("billing") ||
                            error?.message?.includes("BILLING");
      
      if (isApiKeyError) {
        if (res.headersSent) {
          res.write("\n\n⚠️ Таны Settings-д оруулсан GEMINI_API_KEY буруу байна!");
          res.end();
          return;
        }
        return res.status(500).json({
          error: "⚠️ Оруулсан API Түлхүүр хүчингүй эсвэл Төлбөрийн нөхцөл (Billing) шаардаж байна!\n\nТа карт эсвэл төлбөрийн мэдээлэл оруулахгүйгээр шууд ҮНЭГҮЙ ашиглах заавар:\n\n1. Дэлгэцийн баруун дээд буланд байрлах 'Settings' (арааны зураг) товчийг дарна уу.\n2. 'Secrets' цэс рүү ороод 'GEMINI_API_KEY'-ийн арын 'Value' хэсэг дээр дарж унах цэсийг нээнэ үү.\n3. Тэндээс 'AI Studio Free Tier' гэдгийг сонгоно уу.\n4. Доор нь гарч ирэх 'Apply changes' (Өөрчлөлтийг хэрэгжүүлэх) товчлуур дээр дарж амжилттай хадгалаарай!\n\nИнгэснээр систем шууд үнэгүй, ямар нэгэн алдаагүй ажиллана."
        });
      }
      if (res.headersSent) {
        res.write(`\n\n⚠️ Алдаа гарлаа: ${error?.message || "Холболт тасарлаа."}`);
        res.end();
      } else {
        res.status(500).json({ error: error?.message || "Холбогдоход алдаа гарлаа. Та дахин оролдоно уу." });
      }
    }
  });

  // ----------------- VITE MIDDLEWARE CONFIG -----------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start Server on PORT 3000
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
