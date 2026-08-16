import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';

const client = axios.create({
  baseURL: OLLAMA_URL,
  timeout: 60000, // local generation can be slow on first load / big models
});

/**
 * Sends a prompt to Ollama and returns the parsed JSON response.
 * Assumes the prompt instructs the model to return ONLY JSON.
 *
 * @param {string} prompt
 * @param {object} opts
 * @param {string} [opts.model]
 * @param {number} [opts.retries]
 * @returns {Promise<object>}
 */
export async function generateJSON(prompt, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const retries = opts.retries ?? 1;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await client.post('/api/generate', {
        model,
        prompt: `${prompt}\n/no_think`, // qwen3 supports this to skip its reasoning step — faster and avoids leaking <think> content into the output
        format: 'json',
        stream: false,
        options: { temperature: 0 }, // deterministic — we want the same input to always canonicalize the same way
      });

      let cleaned = String(data.response || '');
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, ''); // strip reasoning blocks some models emit
      cleaned = cleaned.replace(/\/no_think|\/think/gi, ''); // strip stray control tokens some models echo back
      cleaned = cleaned.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) continue;
    }
  }

  throw new Error(`Ollama request failed after ${retries + 1} attempt(s): ${lastErr.message}`);
}

export function isConfigured() {
  return true; // always "configured" — will just fail loudly if Ollama isn't running
}