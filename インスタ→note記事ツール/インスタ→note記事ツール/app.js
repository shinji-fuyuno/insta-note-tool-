// ==============================
// 設定: LocalStorage Keys
// ==============================
const STORAGE_KEYS = {
  geminiModel: 'insta_note_gemini_model',
};

// ==============================
// 状態管理
// ==============================
let isGenerating = false;
let uploadedMedia = []; // [{file, dataUrl, type:'image'|'video', mimeType}]

// ==============================
// DOM References
// ==============================
const settingsBtn     = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettings   = document.getElementById('closeSettings');
const saveSettings    = document.getElementById('saveSettings');
const geminiModelSel  = document.getElementById('geminiModel');

const instaText      = document.getElementById('instaText');
const charCount      = document.getElementById('charCount');
const toneSelect     = document.getElementById('toneSelect');
const lengthSelect   = document.getElementById('lengthSelect');
const additionalNote = document.getElementById('additionalNote');
const removeHashtags = document.getElementById('removeHashtags');
const removeEmoji    = document.getElementById('removeEmoji');

const generateBtn = document.getElementById('generateBtn');
const btnText     = generateBtn.querySelector('.btn-text');
const btnLoading  = generateBtn.querySelector('.btn-loading');

const outputArea      = document.getElementById('outputArea');
const copyBtn         = document.getElementById('copyBtn');
const clearBtn        = document.getElementById('clearBtn');
const outputMeta      = document.getElementById('outputMeta');
const outputCharCount = document.getElementById('outputCharCount');
const providerBadge   = document.getElementById('providerBadge');

const dropZone     = document.getElementById('dropZone');
const mediaInput   = document.getElementById('mediaInput');
const mediaPreview = document.getElementById('mediaPreview');
const videoWarning = document.getElementById('videoWarning');

// ==============================
// 初期化
// ==============================
function init() {
  loadSettings();
  setupEventListeners();
  setupDropZone();
}

function loadSettings() {
  const savedModel = localStorage.getItem(STORAGE_KEYS.geminiModel) || 'gemini-2.5-flash';
  if (geminiModelSel) geminiModelSel.value = savedModel;
}

function getGeminiModel() {
  return (geminiModelSel && geminiModelSel.value)
    || localStorage.getItem(STORAGE_KEYS.geminiModel)
    || 'gemini-2.5-flash';
}

// ==============================
// イベントリスナー
// ==============================
function setupEventListeners() {
  settingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
  closeSettings.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
  });

  saveSettings.addEventListener('click', () => {
    if (geminiModelSel) localStorage.setItem(STORAGE_KEYS.geminiModel, geminiModelSel.value);
    settingsOverlay.classList.add('hidden');
    showToast('設定を保存しました ✓');
  });

  instaText.addEventListener('input', () => {
    charCount.textContent = instaText.value.length;
  });

  generateBtn.addEventListener('click', handleGenerate);

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(getOutputText()).then(() => showToast('クリップボードにコピーしました ✓'));
  });

  clearBtn.addEventListener('click', resetOutput);
}

// ==============================
// ドロップゾーン
// ==============================
function setupDropZone() {
  dropZone.addEventListener('click', () => mediaInput.click());

  mediaInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
    mediaInput.value = '';
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (files.length === 0) {
      showToast('画像または動画ファイルを選択してください', 'error');
      return;
    }
    handleFiles(files);
  });
}

function handleFiles(files) {
  const MAX_FILES = 6;
  const remaining = MAX_FILES - uploadedMedia.length;
  if (remaining <= 0) {
    showToast(`最大${MAX_FILES}ファイルまでです`, 'error');
    return;
  }
  const toAdd = files.slice(0, remaining);
  if (files.length > remaining) showToast(`${remaining}件追加しました（上限${MAX_FILES}件）`);

  toAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      uploadedMedia.push({
        file,
        dataUrl: ev.target.result,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        mimeType: file.type,
      });
      renderPreview();
    };
    reader.readAsDataURL(file);
  });
}

function renderPreview() {
  mediaPreview.innerHTML = '';
  mediaPreview.classList.toggle('hidden', uploadedMedia.length === 0);

  uploadedMedia.forEach((item, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'media-thumb';

    if (item.type === 'video') {
      const vid = document.createElement('video');
      vid.src = item.dataUrl;
      vid.muted = true;
      vid.preload = 'metadata';
      thumb.appendChild(vid);
      const label = document.createElement('span');
      label.className = 'thumb-type';
      label.textContent = '動画';
      thumb.appendChild(label);
    } else {
      const img = document.createElement('img');
      img.src = item.dataUrl;
      img.alt = `画像${index + 1}`;
      thumb.appendChild(img);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'thumb-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = '削除';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadedMedia.splice(index, 1);
      renderPreview();
    });
    thumb.appendChild(removeBtn);
    mediaPreview.appendChild(thumb);
  });
}

// ==============================
// 記事生成メイン処理
// ==============================
async function handleGenerate() {
  if (isGenerating) return;

  const text = instaText.value.trim();
  if (!text && uploadedMedia.length === 0) {
    showToast('テキストか画像・動画を入力してください', 'error');
    return;
  }

  isGenerating = true;
  setGeneratingState(true);
  resetOutput();

  const container = document.createElement('div');
  container.className = 'article-content';
  outputArea.innerHTML = '';
  outputArea.appendChild(container);

  try {
    await generateViaServer(text, container);
    enableOutputActions();
    updateOutputMeta();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color: var(--error)">⚠️ エラーが発生しました：${err.message}</p>`;
  } finally {
    isGenerating = false;
    setGeneratingState(false);
  }
}

// ==============================
// プロンプト生成
// ==============================
function buildPrompt(rawText) {
  let processedText = rawText;
  if (removeHashtags.checked) {
    processedText = processedText.replace(/#[\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]+/g, '').trim();
  }
  if (removeEmoji.checked) {
    processedText = processedText.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
  }

  const toneMap = {
    casual: 'カジュアルで親しみやすい話し言葉。友人に語りかけるような文体。',
    formal: '丁寧なです・ます調。読みやすく誠実な文章。',
    literary: '文学的・エッセイ調。詩情を大切にした美しい日本語。体言止めも使う。',
    motivational: '熱量が高く背中を押すような文体。読者に行動を促すエネルギッシュな表現。',
  };
  const lengthMap = {
    short: '500〜800字程度',
    medium: '800〜1500字程度',
    long: '1500〜2500字程度',
  };

  const tone   = toneMap[toneSelect.value]    || toneMap.formal;
  const length = lengthMap[lengthSelect.value] || lengthMap.medium;
  const extra  = additionalNote.value.trim();
  const hasMedia = uploadedMedia.length > 0;
  const mediaNote = hasMedia
    ? '- 添付された画像・動画の内容（被写体、雰囲気、色彩、シーンなど）を読み取り、記事の描写に積極的に活かしてください'
    : '';

  return `あなたはプロのnoteライターです。以下の情報をもとに、noteプラットフォーム向けの読み応えのある記事を書いてください。

【インスタの投稿テキスト】
${processedText || '（テキストなし）'}

【執筆条件】
- 文体・トーン：${tone}
- 記事の長さ：${length}
${extra ? `- 追加指示：${extra}` : ''}
${mediaNote}

【記事の構成】
1. タイトル（# で始める）
2. 導入部（読者の興味を引くリード文）
3. 本文（投稿の内容を膨らませ、具体的なエピソードや感情、気づきを加える）
4. まとめ・メッセージ（読者への言葉で締めくくる）

【重要なルール】
- インスタの投稿を単にコピーするのではなく、note記事として読み応えのある文章に昇華させてください
- マークダウン形式で書いてください（タイトルは#、見出しは##）
- ハッシュタグは書かないでください
- note記事として完成された形で出力してください。説明文や補足は不要です。`;
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

// ==============================
// サーバー経由でGemini呼び出し
// ==============================
async function generateViaServer(rawText, container) {
  const prompt = buildPrompt(rawText);
  const parts  = [];

  // メディアをpartsに追加
  for (const item of uploadedMedia) {
    const parsed = parseDataUrl(item.dataUrl);
    if (!parsed) continue;
    // 動画は20MB以下のみ対応
    if (item.type === 'video' && item.file.size > 20 * 1024 * 1024) {
      showToast(`「${item.file.name}」は大きすぎます（20MB以下にしてください）`, 'error');
      continue;
    }
    parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
  }

  parts.push({ text: prompt });

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts,
      model: getGeminiModel(),
    }),
  });

  if (!response.ok) {
    let errorMessage = `サーバーエラー (${response.status})`;
    try {
      const err = await response.json();
      errorMessage = err?.error || errorMessage;
    } catch {
      // JSONではないエラー（Vercel自体のエラーメッセージなど）をテキストで取得
      const rawText = await response.text().catch(() => '');
      if (rawText) errorMessage += `: ${rawText.slice(0, 100)}`;
    }
    throw new Error(errorMessage);
  }

  await streamResponse(response, container);
}

// ==============================
// ストリーミング処理
// ==============================
async function streamResponse(response, container) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', fullText = '';

  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  container.appendChild(cursor);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          fullText += text;
          renderArticle(container, fullText, cursor);
        }
      } catch (_) {}
    }
  }

  if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
  renderArticle(container, fullText, null);
}

// ==============================
// マークダウン → HTML レンダリング
// ==============================
function renderArticle(container, text, cursor) {
  let html = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) {
      html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
    } else if (line.startsWith('## ') || line.startsWith('### ')) {
      html += `<h2>${escapeHtml(line.replace(/^#{2,3} /, ''))}</h2>`;
    } else if (line === '') {
      html += '<br>';
    } else {
      const processed = escapeHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html += `<p>${processed}</p>`;
    }
  }
  container.innerHTML = html;
  if (cursor) container.appendChild(cursor);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==============================
// UI ヘルパー
// ==============================
function setGeneratingState(loading) {
  generateBtn.disabled = loading;
  btnText.classList.toggle('hidden', loading);
  btnLoading.classList.toggle('hidden', !loading);
}

function resetOutput() {
  outputArea.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">✦</div>
      <p>インスタの投稿を入力して<br />「記事を生成する」を押してください</p>
    </div>
  `;
  copyBtn.disabled = true;
  clearBtn.disabled = true;
  outputMeta.classList.add('hidden');
}

function enableOutputActions() {
  copyBtn.disabled = false;
  clearBtn.disabled = false;
  outputMeta.classList.remove('hidden');
}

function updateOutputMeta() {
  outputCharCount.textContent = `${getOutputText().length}文字`;
  providerBadge.textContent = `Gemini / ${getGeminiModel()}`;
  providerBadge.className = 'badge badge-gemini';
}

function getOutputText() {
  return outputArea.innerText || outputArea.textContent || '';
}

// ==============================
// トースト通知
// ==============================
function showToast(message, type = 'success') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  const isErr = type === 'error';
  toast.style.cssText = `
    position: fixed; bottom: 32px; left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: ${isErr ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)'};
    border: 1px solid ${isErr ? 'rgba(248,113,113,0.4)' : 'rgba(52,211,153,0.4)'};
    color: ${isErr ? '#f87171' : '#34d399'};
    padding: 12px 24px; border-radius: 50px; font-size: 0.85rem; font-weight: 500;
    backdrop-filter: blur(20px); z-index: 9999; opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap; font-family: 'Noto Sans JP', sans-serif;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==============================
// 起動
// ==============================
init();
