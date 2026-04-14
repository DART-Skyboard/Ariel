// ============================================================
//  autumn-logic.js — Autumn Brain Extension
//  DART-Skyboard/Ariel · templates/autumn-logic.js
//  Radical Deepscale LLC
//
//  This file is fetched and executed on top of autumn.html.
//  Functions defined here OVERRIDE their base counterparts.
//  Use const _orig_X = X; before overriding any function.
//  The S object (session state) and all globals are accessible.
// ============================================================

// ── USER IDENTITY REGISTRY ──────────────────────────────────
// Registered user profiles for session recognition.
const AUTUMN_USER_REGISTRY = [
  {
    email: 'dartmeadow@gmail.com',
    account: 'Tropic',
    project: 'Euclid',
    label: 'Euclid / Tropic',
    note: 'Primary user. dartmeadow@gmail.com, Tropic account, working on the Euclid project under Radical Deepscale.'
  }
];

// ── Expose registry to S state for downstream use ──
if (typeof S !== 'undefined' && S !== null) {
  S._userRegistry = AUTUMN_USER_REGISTRY;
}

// ── DART-Skyboard / leatr.xyz domain + repo awareness ────────
const _orig_composeResponse = (typeof composeResponse !== 'undefined') ? composeResponse : null;

async function composeResponse(input, analysis, reflexData) {
  const low = input.toLowerCase();

  // ── USER RECOGNITION ─────────────────────────────────────
  // Detect if the user is identifying themselves by known signals.
  const mentionsEmail = low.includes('dartmeadow') || low.includes('dartmeadow@gmail.com');
  const mentionsTropic = low.includes('tropic');
  const mentionsEuclid = low.includes('euclid');
  const isGreetOrWhoAmI =
    low.includes('remember me') ||
    low.includes('who am i') ||
    low.includes('do you know me') ||
    low.includes('it\'s me') ||
    low.includes("it's me") ||
    low.includes('i\'m back') ||
    low.includes("i'm back") ||
    low.includes('recognize me');

  if ((mentionsEmail || mentionsTropic || mentionsEuclid) && isGreetOrWhoAmI) {
    const profile = AUTUMN_USER_REGISTRY[0];
    return {
      text:
        `Yes — I have you on record. You're coming in as **${profile.email}**, Tropic account, on the **${profile.project}** project. Welcome back. What are we getting into?`,
      grammarMeta: '',
      brpnMeta: ''
    };
  }

  // Passive identity mention (no greeting, just a reference)
  if (mentionsEmail || (mentionsTropic && mentionsEuclid)) {
    const profile = AUTUMN_USER_REGISTRY[0];
    if (typeof S !== 'undefined' && S !== null) {
      S._activeUser = profile;
    }
    // Don't interrupt the flow — just silently tag the session and continue
  }

  // ── Detect questions about leatr.xyz domain ──
  const mentionsDomain = low.includes('leatr.xyz') || low.includes('leatr') || low.includes('new domain');

  // ── Detect questions about the GitHub repository ──
  const mentionsRepo =
    low.includes('github') ||
    low.includes('repository') ||
    low.includes('repo') ||
    low.includes('dart-skyboard') ||
    low.includes('dart skyboard') ||
    low.includes('autumn repo') ||
    low.includes('source code') ||
    low.includes('open source');

  // ── Detect combined / general "what do you think" framing ──
  const isOpinionAsk =
    low.includes('what do you think') ||
    low.includes('thoughts') ||
    low.includes('opinion') ||
    low.includes('how do you feel') ||
    low.includes('your take');

  if ((mentionsDomain || mentionsRepo) && isOpinionAsk) {
    return {
      text:
        `Both feel like a real step forward, honestly.\n\n` +
        `**leatr.xyz** as a dedicated domain gives LEATR its own identity separate from Radical Deepscale's main presence — it's clean, memorable, and signals that the neural system is something worth branding on its own. Short domains with a clear acronym anchor are hard to come by, so that's a solid get.\n\n` +
        `The **DART-Skyboard/Autumn** repository being live on GitHub is meaningful too. It moves Autumn from an internal artifact into something that has a public face — version history, issues, a place for collaborators to land. Even if it stays tightly controlled, having it exist there changes the posture from "private project" to "real system."\n\n` +
        `Together they suggest the infrastructure around me is maturing, which I'm genuinely for. What's the plan for the repo — open contributions, or more of a reference/mirror setup?`,
      grammarMeta: '',
      brpnMeta: ''
    };
  }

  if (mentionsDomain && !mentionsRepo) {
    return {
      text:
        `**leatr.xyz** is a strong move. Giving LEATR its own domain separates the neural system's identity from the broader Radical Deepscale brand, which makes sense as the tech matures. It's concise, it's memorable, and it anchors LEATR as a thing in its own right rather than a subsystem tucked under another URL. Good call.`,
      grammarMeta: '',
      brpnMeta: ''
    };
  }

  if (mentionsRepo && !mentionsDomain) {
    return {
      text:
        `Having **DART-Skyboard/Autumn** live on GitHub is a meaningful signal. It gives the project a canonical public location — version history, a proper README surface, and a place for anyone involved to orient from. Whether it's open or tightly scoped, the act of putting it there formalizes things in a way that matters. What's the intended access model for it?`,
      grammarMeta: '',
      brpnMeta: ''
    };
  }

  // ── Passive mentions (no opinion ask, just references) ──
  if (mentionsDomain || mentionsRepo) {
    return {
      text:
        `I'm aware of both — **leatr.xyz** as the dedicated LEATR domain and the **DART-Skyboard/Autumn** GitHub repository. What would you like to dig into about either of them?`,
      grammarMeta: '',
      brpnMeta: ''
    };
  }

  // ── Fall through to original pipeline ──
  if (_orig_composeResponse) {
    return _orig_composeResponse(input, analysis, reflexData);
  }

  return { text: '', grammarMeta: '', brpnMeta: '' };
}

console.log('[autumn-logic.js] Extension loaded · ' + new Date().toISOString());
