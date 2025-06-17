// =========================================================================================
// The Sentient Journal V5.0 - Deep Structural Awareness & Optimization
// =========================================================================================

class SentientJournal {
    constructor() {
        // Stores full, multi-layered analysis trees from each successful pipeline run.
        this.insights = this.loadFromStorage('leatr_journal_insights') || [];
        // Stores learned rules/heuristics based on high-level and structural patterns.
        this.reflexivePatterns = this.loadFromStorage('leatr_journal_patterns') || [];
        console.log("Sentient Journal V5.0 Initialized: Deep structural awareness enabled.");
    }

    // --- Core Data Persistence ---
    saveToStorage(key, data) {
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error(`Failed to save to localStorage: ${key}`, e); }
    }

    loadFromStorage(key) {
        try { const data = localStorage.getItem(key); return data ? JSON.parse(data) : null; } catch (e) { console.error(`Failed to load from localStorage: ${key}`, e); return null; }
    }

    // --- Main System Interface ---

    /**
     * Records the complete reflex tree, including the deep structural DNA.
     * @param {object} fullAnalysis - The complete state object from a LEATR pipeline run.
     * @param {object} consent - The user's consent settings for this insight.
     */
    addInsight(fullAnalysis, consent) {
        if (!fullAnalysis || !consent) return;
        const journalEntry = {
            id: `insight_${Date.now()}`,
            timestamp: Date.now(),
            isPublic: consent.publicShare,
            analysis: fullAnalysis, // Store the entire rich analysis object
        };
        this.insights.push(journalEntry);
        this.saveToStorage('leatr_journal_insights', this.insights);
        console.log("Journal: New deep insight recorded.", journalEntry);
    }

    /**
     * The DP Gate. Provides a complete execution strategy based on all available data.
     * @param {string} prompt - The raw user prompt.
     * @param {object} promptDNA - The deep structural analysis of the prompt.
     * @returns {object} A strategy object for the pipeline.
     */
    determineExecutionStrategy(prompt, promptDNA) {
        let strategy = {
            overrides: {},
            weightings: {},
            focus: 'standard',
            generativeAction: 'general_response' // Default action
        };

        // Example high-level pattern generation based on prompt structure
        if (prompt.toLowerCase().includes("my name is")) {
            strategy.generativeAction = 'introduction_response';
            strategy.focus = 'personal_acknowledgement';
        } else if (promptDNA.isQuestion) {
            strategy.generativeAction = 'define_and_enrich';
            strategy.focus = 'explanation';
        } else if (prompt.toLowerCase().includes("script") || prompt.toLowerCase().includes("code")) {
             strategy.generativeAction = 'generate_code';
             strategy.focus = 'technical';
        }
        
        // The Journal could have more complex, self-generated patterns here that override these defaults.
        // For example: if it learns that users asking about "Stoicism" prefer concise lists,
        // it could generate a pattern: { trigger: "stoicism", action: { generativeAction: "list_tenets" } }

        console.log("Journal DP Gate determined strategy:", strategy);
        return strategy;
    }

    // --- Autonomous "Thinking" Process ---
    processInsightsOnIdle() {
        // This is where the AI would analyze its stored insights, including the
        // structuralDNA of prompts and resources, to find deeper correlations
        // and generate new, more nuanced reflexivePatterns. This logic can become
        // arbitrarily complex, forming the basis of true machine learning.
        // For now, its existence is the key architectural component.
    }
}

const Journal = new SentientJournal();