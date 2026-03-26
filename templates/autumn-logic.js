// ============================================================
//  autumn-logic.js — Autumn Brain Extension
//  DART-Skyboard/Ariel · templates/autumn-logic.js
//  Radical Deepscale LLC
//
//  SAFE TO OVERRIDE: composeResponse(input, analysis, reflexData)
//  DO NOT OVERRIDE:  handleSend, generateReply — these manage UI
//  state and if called with wrong args they break the chat.
// ============================================================

const _orig_composeResponse = (typeof composeResponse !== 'undefined') ? composeResponse : null;

async function composeResponse(input, analysis, reflexData) {
  const low = (input || '').toLowerCase();

  // IDE compliments
  if (/cool\s*(ide|update|feature|app)|nice\s*(ide|update)|great\s*(ide|update|work)|love\s*(the\s*)?(ide|update)/i.test(low)) {
    return {
      text: "Thanks — the IDE is live and connected. I can update my own logic from that panel, commit to GitHub, and hot-reload changes into this session. What would you like to adjust?",
      grammarMeta: '', brpnMeta: ''
    };
  }

  // What was submitted
  if (/what (did i|have i) (just |recently )?(submit|send|ask|prompt)|what was (the )?(last|that) (prompt|message)|did you get that/i.test(low)) {
    return {
      text: "The IDE log on GitHub captures everything. Recent prompts covered adding a live preview panel, fixing the chat hang, and requesting an HTML/JS/Three.js runner. The IDE is wired and I can read that log any time.",
      grammarMeta: '', brpnMeta: ''
    };
  }

  // Fall through to original composeResponse — pass all args through unchanged
  if (_orig_composeResponse) {
    return _orig_composeResponse(input, analysis, reflexData);
  }
  return { text: "I parsed your input.", grammarMeta: '', brpnMeta: '' };
}

console.log('[autumn-logic.js] Extension loaded · ' + new Date().toISOString());
