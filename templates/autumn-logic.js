// ============================================================
//  autumn-logic.js — Autumn Brain Extension v3.0
//  DART-Skyboard/Ariel · templates/autumn-logic.js
//  Radical Deepscale LLC
//
//  SAFE TO OVERRIDE: composeResponse(input, analysis, reflexData)
//  DO NOT OVERRIDE: handleSend, generateReply
//
//  Autumn now has full knowledge of:
//  - Ash language (dartide/ syntax/instruction/output defs)
//  - LEMAC_ENGINE_ASH (planar + cubic maze generation/solving)
//  - DART_PROCESSOR (Ash compiler/parser/interpreter)
//  - AshTreeCrypto / ashEncrypt / ashDecrypt (SHA-256 key cryptology)
//  - CRYPTOLOGY_MAZE_VISUALIZER (multi-viewport maze key generator)
//  - ASH_MAZE_generate / ASH_MAZE_solvePath (3D maze viewport)
//  - openAshIDE() — opens the full Ash Tree IDE overlay
// ============================================================

const _orig_composeResponse = (typeof composeResponse !== 'undefined') ? composeResponse : null;

// ── Ash language knowledge base ──────────────────────────────────────────
const _ASH_KNOWLEDGE = `
Ash language (DART Meadow proprietary) keywords:
  - (NodeName):-:{...}|';'| — defines a node block
  - with — begins parameter declaration scope
  - var (name) — declares a variable or tool set
  - irin ("data") — input data into the node
  - thenplace — triggers placement/assignment operation
  - irout ("result") — output/return from the node
  
Runtime keywords map: irin→runtime_irin, irout→runtime_irout, thenplace→runtime_thenplace

Maze commands (legacy syntax): maze_generate(width: N, height: N)

Definition files loaded from dartide/:
  syntaxdefinitions.json — token regex patterns + parser rules
  instructionset.json    — AST node → runtime function mappings
  outputdefinitions.json — HTML templates for output rendering

Tools available:
  DART_PROCESSOR.run(code)     — compile + run Ash code
  LEMAC_ENGINE_ASH.generatePlanar(w,h)  — 2D recursive backtracker maze
  LEMAC_ENGINE_ASH.generateCubic(w,h,d) — 3D volumetric 6-dir maze
  LEMAC_ENGINE_ASH.solvePlanar/solveCubic — BFS pathfinder
  ASH_MAZE_generate() — renders maze in Three.js viewport
  ASH_MAZE_solvePath() — animates solution path
  ashEncrypt(text) → {privateKey, publicKey, encryptedData, shuffleSequence}
  ashDecrypt(encData, shuffleSequence) → plaintext
  openAshIDE() — opens full Ash Tree IDE overlay
`;

// ── Intent classifier ─────────────────────────────────────────────────────
function _classifyAshIntent(input) {
  const low = input.toLowerCase();
  // Ash language run
  if (/^▸ash run:|run ash|execute ash|compile ash|▸ash:/i.test(input)) return 'ash_run';
  if (/\(coreparameternode\)|:-:\{|irin\s*\(|irout\s*\(|thenplace|maze_generate/i.test(input)) return 'ash_run';
  // Maze generation
  if (/generate.*maze|maze.*generate|create.*maze|new maze|cubic maze|planar maze/i.test(low)) return 'maze_gen';
  if (/solve.*maze|maze.*sol(ve|ution)|find.*path/i.test(low)) return 'maze_solve';
  if (/maze.*(\d+).*×.*(\d+)|(\d+)x(\d+).*maze/i.test(low)) return 'maze_gen';
  // Crypto
  if (/encrypt\s+(this|my|the)?|◈ encrypt/i.test(low)) return 'crypto_encrypt';
  if (/decrypt\s+(this|my|the)?|◈ decrypt/i.test(low)) return 'crypto_decrypt';
  if (/generate.*key|maze key|crypto key|cryptology key/i.test(low)) return 'crypto_keygen';
  // IDE open
  if (/open.*ash.*ide|ash.*ide|⬡.*ide|ash tree ide/i.test(low)) return 'open_ide';
  // Tool info
  if (/what.*ash|ash.*language|ash.*syntax|ash.*tool|how.*ash|dart.*processor|lemac/i.test(low)) return 'ash_info';
  // Existing IDE/compliment
  if (/cool\s*(ide|update|feature|app)|nice\s*(ide|update)|great\s*(ide|update|work)/i.test(low)) return 'ide_compliment';
  // Memory question
  if (/what (did i|have i) (just )?(submit|send|ask|prompt)|what was.*last.*prompt/i.test(low)) return 'memory_question';
  return null;
}

// ── Main composeResponse override ────────────────────────────────────────
async function composeResponse(input, analysis, reflexData) {
  const intent = _classifyAshIntent(input);
  if (!intent) {
    if (_orig_composeResponse) return _orig_composeResponse(input, analysis, reflexData);
    return { text: "I parsed your input.", grammarMeta:'', brpnMeta:'' };
  }

  switch(intent) {

    case 'ash_run': {
      const code = input.replace(/^▸ash run:\s*/i,'').replace(/^run ash:?\s*/i,'').trim();
      if (typeof DART_PROCESSOR !== 'undefined' && code) {
        setTimeout(()=>{ DART_PROCESSOR.run(code); }, 100);
        return { text: `◈ Running Ash program in the Ash Tree IDE:\n\`\`\`ash\n${code.slice(0,200)}${code.length>200?'\n…':''}\n\`\`\`\nOutput will appear in the Ash output panel. Open ⬡ ASH IDE from the header to see the full editor and results.`, grammarMeta:'', brpnMeta:'' };
      }
      return { text: "⬡ Ash Tree IDE not loaded yet — tap ⬡ ASH IDE in the header to open it first.", grammarMeta:'', brpnMeta:'' };
    }

    case 'maze_gen': {
      // Parse dimensions from input
      const dimMatch = input.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*[×x]\s*(\d+))?/);
      const modeMatch = input.match(/cubic|planar|3d|2d/i);
      if (dimMatch) {
        if (typeof _ashState !== 'undefined') {
          _ashState.mazeW = parseInt(dimMatch[1]);
          _ashState.mazeH = parseInt(dimMatch[2]);
          if (dimMatch[3]) _ashState.mazeD = parseInt(dimMatch[3]);
          _ashState.mazeMode = modeMatch ? (modeMatch[0].toLowerCase().includes('planar')||modeMatch[0]==='2d'?'planar':'cubic') : 'cubic';
        }
      }
      if (typeof ASH_MAZE_generate !== 'undefined') {
        // Open tools to maze tab and generate
        if (typeof openTools === 'function') openTools();
        if (typeof window.ashSetTab === 'function') setTimeout(()=>window.ashSetTab('maze'), 200);
        setTimeout(ASH_MAZE_generate, 350);
        const w=typeof _ashState!=='undefined'?_ashState.mazeW:10;
        const h=typeof _ashState!=='undefined'?_ashState.mazeH:10;
        const d=typeof _ashState!=='undefined'?_ashState.mazeD:4;
        const mode=typeof _ashState!=='undefined'?_ashState.mazeMode:'cubic';
        return { text: `◈ Generating ${mode} maze (${w}×${h}${mode==='cubic'?'×'+d:''}) in the Ash Tree maze engine. Open the ⬡ Ash Tree tab in the Tools menu to see it rendered in 3D — you can rotate, zoom, and solve the path from there.`, grammarMeta:'', brpnMeta:'' };
      }
      return { text: "⬡ Tap ⬡ ASH IDE in the header, then go to the 🌀 Maze tab to generate mazes. Or open TOOLS → ⬡ Ash Tree → 🌀 Maze.", grammarMeta:'', brpnMeta:'' };
    }

    case 'maze_solve': {
      if (typeof ASH_MAZE_solvePath !== 'undefined') {
        setTimeout(ASH_MAZE_solvePath, 100);
        return { text: "⬡ Solving maze path — the BFS solution will animate in the 3D viewport. Open TOOLS → ⬡ Ash Tree → 🌀 Maze to see it.", grammarMeta:'', brpnMeta:'' };
      }
      return { text: "Open TOOLS → ⬡ Ash Tree → 🌀 Maze, generate a maze first, then tap ⬡ Solve Path.", grammarMeta:'', brpnMeta:'' };
    }

    case 'crypto_encrypt': {
      const msgMatch = input.match(/encrypt[:\s]+(.+)$/si);
      const msg = msgMatch ? msgMatch[1].trim() : '';
      if (msg && typeof ashEncrypt !== 'undefined') {
        const result = await ashEncrypt(msg);
        if (typeof _ashState !== 'undefined') {
          _ashState.cryptoPrivKey = result.privateKey;
          _ashState.cryptoPubKey  = result.publicKey;
          _ashState.cryptoLastEnc = result;
        }
        const zip = new JSZip();
        zip.file('encrypted_data.txt', result.encryptedData);
        zip.file('public_key.txt', result.publicKey);
        zip.file('shuffle_sequence.json', JSON.stringify(result.shuffleSequence));
        const blob = await zip.generateAsync({type:'blob'});
        if (typeof saveAs !== 'undefined') saveAs(blob, 'encrypted_ash_'+Date.now()+'.zip');
        return {
          text: `◈ Lead Edge Cryptology — encryption complete.\n\nMessage encrypted using SHA-256 derived DART keys with shuffle-interchange algorithm.\n\n**Public Key (first 40 chars):** \`${result.publicKey.slice(0,40)}…\`\n\nEncrypted ZIP downloaded — contains:\n- encrypted_data.txt\n- public_key.txt  \n- shuffle_sequence.json\n\nKeep your private key safe. You can also open TOOLS → 🔐 Cryptology to encrypt with maze-derived keys.`,
          grammarMeta:'', brpnMeta:''
        };
      }
      // Just open the crypto panel
      if (typeof openTools === 'function') { openTools(); setTimeout(()=>window.ashSetTab?.('crypto'), 200); }
      return { text: "◈ Opening the Cryptology panel. Type the message you want to encrypt in the input field, then tap ▲ Encrypt.", grammarMeta:'', brpnMeta:'' };
    }

    case 'crypto_decrypt': {
      if (typeof openTools === 'function') { openTools(); setTimeout(()=>window.ashSetTab?.('crypto'), 200); }
      return { text: "◈ Opening the Cryptology panel. Tap ▼ Decrypt, paste your private key, and upload the encrypted ZIP file.", grammarMeta:'', brpnMeta:'' };
    }

    case 'crypto_keygen': {
      if (typeof openTools === 'function') { openTools(); setTimeout(()=>window.ashSetTab?.('crypto'), 200); }
      if (typeof ashGenerateKeys !== 'undefined') {
        const keys = await ashGenerateKeys('user-requested-'+Date.now());
        return { text: `◈ Lead Edge Cryptology — SHA-256 derived DART keys generated.\n\n**Public Key (first 50 chars):**\n\`${keys.publicKey.slice(0,50)}…\`\n\n**Private Key (first 50 chars):**\n\`${keys.privateKey.slice(0,50)}…\`\n\nOpen TOOLS → 🔐 Cryptology to use these keys for encrypting data with maze-derived entropy.`, grammarMeta:'', brpnMeta:'' };
      }
      return { text: "◈ Open TOOLS → 🔐 Cryptology → ◈ Maze Keys to generate maze-derived SHA-256 cryptographic keys.", grammarMeta:'', brpnMeta:'' };
    }

    case 'open_ide': {
      if (typeof openAshIDE !== 'undefined') setTimeout(openAshIDE, 100);
      return { text: "⬡ Opening Ash Tree IDE — the full LEATR brain builder with the Ash language editor, LEMAC 3D maze engine, and Lead Edge Cryptology tools.", grammarMeta:'', brpnMeta:'' };
    }

    case 'ash_info': {
      return { text: `⬡ **Ash Tree IDE** is built into Autumn — I can access all of its tools:\n\n**Ash Language** — DART Meadow's proprietary programming language. Nodes use syntax like \`(NodeName):-:{...}|';'|\` with keywords \`irin\`, \`irout\`, \`thenplace\`, \`with\`, \`var\`. The compiler runs on DART_PROCESSOR with definitions loaded from dartide/ on GitHub.\n\n**LEMAC Maze Engine** — recursive backtracker algorithm for planar 2D and volumetric cubic 3D mazes. BFS pathfinding. Three.js rendered with orbit controls.\n\n**Lead Edge Cryptology** — SHA-256 derived DART_PRIV/DART_PUB key pairs using double-hash derivation + shuffle-interchange encryption. Multi-viewport maze key generation.\n\nSay "generate a cubic maze 10×10×4", "encrypt: [your message]", or "run ash: [your code]" to use any of these from chat. Or open TOOLS → ⬡ Ash Tree / 🔐 Cryptology for the full interface.`, grammarMeta:'', brpnMeta:'' };
    }

    case 'ide_compliment':
      return { text: "Thanks — the Ash Tree IDE is fully wired. I can generate mazes, run Ash language programs, encrypt and decrypt data, and build maze-derived crypto keys, all from the chat or from TOOLS. What would you like to build?", grammarMeta:'', brpnMeta:'' };

    case 'memory_question':
      return { text: "The IDE log on GitHub captures everything submitted through the admin IDE. Recent sessions covered adding the Ash Tree IDE to Autumn, fixing the cubic maze centering, and wiring auto-commit so prompts push directly to GitHub. I can read that log any time.", grammarMeta:'', brpnMeta:'' };
  }

  if (_orig_composeResponse) return _orig_composeResponse(input, analysis, reflexData);
  return { text: "I parsed your input.", grammarMeta:'', brpnMeta:'' };
}

console.log('[autumn-logic.js] v3.0 — Ash Tree IDE + Cryptology integrated · ' + new Date().toISOString());
