const API_KEYS = [
  import.meta.env.VITE_GEMINI_API_KEY_1,
  import.meta.env.VITE_GEMINI_API_KEY_2,
  import.meta.env.VITE_GEMINI_API_KEY_3,
].filter(Boolean);

const endpoint = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

export function hasGeminiKeys() {
  return API_KEYS.length > 0;
}

export async function callGemini(systemPrompt, userMessage, history = []) {
  if (API_KEYS.length === 0) {
    throw new Error('No Gemini API key configured. Add VITE_GEMINI_API_KEY_1 to your .env file.');
  }

  const contents = [
    ...history.map((m) => ({
      role: m.isUser ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  };

  let lastError;
  for (const key of API_KEYS) {
    try {
      const res = await fetch(endpoint(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 503) {
        lastError = new Error(`Quota exceeded on key …${key.slice(-4)}, trying next…`);
        continue;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Gemini API error ${res.status}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini.');
      return text;
    } catch (err) {
      if (err.message.includes('Quota exceeded') || err.message.includes('429')) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Gemini API keys have been exhausted.');
}
