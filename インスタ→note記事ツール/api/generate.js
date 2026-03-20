// Vercel Edge Function - Gemini APIプロキシ
// ユーザーのブラウザからAPIキーを隠してGeminiを呼び出す
export const config = { runtime: 'edge' };

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'サーバーにAPIキーが設定されていません' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '不正なリクエスト形式です' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { parts, model } = body;
  if (!parts || !Array.isArray(parts)) {
    return new Response(JSON.stringify({ error: 'partsが必要です' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const selectedModel = model || 'gemini-2.5-flash';

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errData = await geminiRes.json().catch(() => ({}));
    const message = errData?.error?.message || `Gemini APIエラー (${geminiRes.status})`;
    return new Response(JSON.stringify({ error: message }), {
      status: geminiRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Geminiのストリーミングレスポンスをそのままクライアントに流す
  return new Response(geminiRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
