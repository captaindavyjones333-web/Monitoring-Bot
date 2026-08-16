import { generateJSON } from './ollamaClient.js';
import { cached } from './diskCache.js';
import { canonicalizeCpuRegex } from './normalizeCpuRegex.js';
import { canonicalizeGpuRegex } from './normalizeGpuRegex.js';

const CPU_PROMPT = (raw) => `You normalize laptop CPU model strings into a single canonical form.

Rules:
- Output format: "<Brand> <Family> <Model>", e.g. "Intel Core i7-13700H", "AMD Ryzen 7 7735HS", "Apple M4".
- Strip clock speeds, trademark symbols, extra whitespace, parentheses.
- CRITICAL: preserve every digit and letter of the model number EXACTLY as given. Never substitute, complete, or "correct" it to a different known model — if you don't recognize it, keep it verbatim.
- If you cannot confidently parse a model, return the cleaned input as-is rather than guessing.

Return ONLY this JSON, no markdown, no explanation:
{"canonical": "<result>"}

Input: ${raw}`;

const GPU_PROMPT = (raw) => `You normalize laptop GPU model strings into a single canonical form.

Rules:
- Discrete GPUs -> "<Brand> <Model>", e.g. "NVIDIA RTX 4060", "AMD Radeon RX 7600S".
- Integrated GPUs -> use the chipset's own name, e.g. "Intel Iris Xe", "Intel UHD Graphics", "AMD Radeon 780M", "Apple M4 GPU".
- ONLY clean formatting: strip trademark symbols, VRAM amounts, extra whitespace.
- CRITICAL: preserve every digit of the model number EXACTLY as given. Never substitute it for a different, more familiar model number — if unsure, keep it verbatim.
- If you cannot confidently parse it, return the cleaned input as-is rather than guessing.

Return ONLY this JSON, no markdown, no explanation:
{"canonical": "<result>"}

Input: ${raw}`;

export async function canonicalizeCpu(raw) {
  if (!raw) return null;

  const regexResult = canonicalizeCpuRegex(raw);
  if (regexResult) {
    return { ...regexResult, source: 'regex', needs_review: regexResult.confidence === 'guessed' };
  }

  return cached('cpu_llm', raw, async () => {
    const { canonical } = await generateJSON(CPU_PROMPT(raw));
    return { canonical, source: 'llm', needs_review: true }; // LLM output for CPU has a demonstrated track record of dropping/fabricating digits — always flag for manual check
  });
}

export async function canonicalizeGpu(raw) {
  if (!raw) return null;

  const regexResult = canonicalizeGpuRegex(raw);
  if (regexResult) {
    return { ...regexResult, source: 'regex', needs_review: false };
  }

  return cached('gpu_llm', raw, async () => {
    const { canonical } = await generateJSON(GPU_PROMPT(raw));
    return { canonical, source: 'llm', needs_review: true };
  });
}