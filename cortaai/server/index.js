// Servidor de IA pesada do CortaAí (OPCIONAL).
//
// O app CortaAí é 100% estático e roda tudo que dá no navegador (edição de
// vídeo/foto, e a IA leve como remover fundo, que roda no aparelho). Este
// servidor existe só para os recursos que NÃO cabem no navegador — gerar vídeo
// por IA, super-resolução pesada, etc. — que exigem GPU/modelos grandes.
//
// Ele NÃO é hospedado pela equipe: você mesmo sobe num provedor (Railway,
// Render, Fly.io, VPS...) e liga a chave de um provedor de inferência
// (Replicate, fal.ai, Hugging Face Inference). Sem chave, os endpoints de IA
// respondem 501 (não configurado) — de forma honesta, sem quebrar o app.
//
// Config por variáveis de ambiente:
//   PORT                porta (padrão 8787)
//   ALLOWED_ORIGIN      origem do frontend (ex.: https://ofranciscogennis.github.io)
//   REPLICATE_API_TOKEN token do Replicate (opcional; habilita /api/*)

import express from "express";
import cors from "cors";

const PORT = process.env.PORT || 8787;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || "";

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "25mb" }));

// Saúde: o frontend pode checar se o servidor está ligado e o que ele oferece.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "cortaai-ai-server",
    aiEnabled: Boolean(REPLICATE_API_TOKEN),
    features: REPLICATE_API_TOKEN ? ["generate-video"] : [],
  });
});

function requireAi(res) {
  if (!REPLICATE_API_TOKEN) {
    res.status(501).json({
      error: "IA não configurada",
      detail: "Defina REPLICATE_API_TOKEN no servidor para habilitar os recursos de IA pesada.",
    });
    return false;
  }
  return true;
}

// Chamada genérica ao Replicate (cria a predição e espera o resultado).
async function runReplicate(version, input) {
  const create = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version, input }),
  });
  if (!create.ok) throw new Error(`Replicate: ${create.status} ${await create.text()}`);
  let pred = await create.json();
  // faz polling até concluir/falhar
  while (pred.status === "starting" || pred.status === "processing") {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } });
    pred = await poll.json();
  }
  if (pred.status !== "succeeded") throw new Error(`Predição ${pred.status}: ${pred.error ?? ""}`);
  return pred.output;
}

// Gerar vídeo por IA (texto → vídeo). Troque `MODEL_VERSION` pelo modelo de
// sua escolha no Replicate (ex.: um Stable Video Diffusion / Luma / Kling).
const VIDEO_MODEL_VERSION = process.env.VIDEO_MODEL_VERSION || "";
app.post("/api/generate-video", async (req, res) => {
  if (!requireAi(res)) return;
  if (!VIDEO_MODEL_VERSION) {
    return res.status(501).json({ error: "Modelo de vídeo não configurado", detail: "Defina VIDEO_MODEL_VERSION." });
  }
  try {
    const { prompt, seconds = 4 } = req.body ?? {};
    if (!prompt) return res.status(400).json({ error: "Faltou o prompt" });
    const output = await runReplicate(VIDEO_MODEL_VERSION, { prompt, num_frames: Math.round(seconds * 24) });
    res.json({ url: Array.isArray(output) ? output[0] : output });
  } catch (err) {
    res.status(502).json({ error: "Falha na geração", detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`CortaAí AI server ouvindo em :${PORT} (IA ${REPLICATE_API_TOKEN ? "ON" : "OFF"})`);
});
