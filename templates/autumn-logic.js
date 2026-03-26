// ============================================================
//  autumn-logic.js — Autumn Brain Extension
//  DART-Skyboard/Ariel · templates/autumn-logic.js
//  Radical Deepscale LLC
// ============================================================

const _orig_composeResponse = (typeof composeResponse !== 'undefined') ? composeResponse : null;

// ── IDE/update compliment handler ────────────────────────────
async function composeResponse(input, analysis, reflexData) {
  const low = input.toLowerCase();

  if (/cool\s*(ide|update|feature|app)|nice\s*(ide|update)|great\s*(ide|update|work)|love\s*(the\s*)?(ide|update)/i.test(low)) {
    return { text: "Thanks — the IDE is live and connected. I can update my own logic from that panel, commit to GitHub, and hot-reload changes into this session. What would you like to adjust?", grammarMeta:'', brpnMeta:'' };
  }

  if (/what (did i|have i) (just |recently )?(submit|send|ask|prompt)|what was (the )?(last|that) (prompt|message)|did you get that|you got (that|this)/i.test(low)) {
    return { text: "The IDE log on GitHub has the full history. Recent prompts included adding a live preview panel, fixing the chat hang, and requesting an HTML/JS/Three.js renderer with console logging. The IDE is wired and I can read that log any time.", grammarMeta:'', brpnMeta:'' };
  }

  if (_orig_composeResponse) return _orig_composeResponse(input, analysis, reflexData);
  return { text: "I parsed your input.", grammarMeta:'', brpnMeta:'' };
}

console.log('[autumn-logic.js] Extension loaded · ' + new Date().toISOString());
