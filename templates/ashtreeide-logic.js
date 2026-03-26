// ============================================================
//  ashtreeide-logic.js — Ash Tree IDE Logic Extension
//  DART-Skyboard/Ariel · templates/ashtreeide-logic.js
//  Radical Deepscale LLC
//
//  Runs via new Function(code) on top of ashtreeide.html.
//  Full global scope available:
//    LEMAC_ENGINE       — planar/cubic maze generation + solving
//    MAZE_VISUALIZER    — Three.js IDE maze viewport
//    CRYPTOLOGY_MAZE_VISUALIZER — multi-viewport crypto maze
//    AshTreeCrypto      — encrypt/decrypt/generateMazeBasedKeys
//    strongAcronisHash  — SubtleCrypto SHA-256
//    deriveKeyHash      — double-round SHA-256 key derivation
// ============================================================

// ── Example: override maze wall color ────────────────────────
// const _orig_getWallMaterial = LEMAC_ENGINE.getWallMaterial.bind(LEMAC_ENGINE);
// LEMAC_ENGINE.getWallMaterial = function() {
//   const m = _orig_getWallMaterial();
//   m.color.setHex(0xff4466);
//   return m;
// };

// ── Your extensions go below this line ───────────────────────


console.log('[ashtreeide-logic.js] Extension loaded · ' + new Date().toISOString());
