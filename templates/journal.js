// =========================================================================================
// Sentient Journal Catalyst - V1
// Manages the AI's long-term memory and reflective capabilities.
// =========================================================================================

const Journal = (() => {
    // Use a unique key for localStorage to avoid conflicts.
    const JOURNAL_KEY = 'leatr-sentient-journal-v1';
    const MAX_INSIGHTS = 50; // Cap the journal size to prevent excessive storage use.
    
    // The in-memory array of the AI's past analyses ("insights").
    let insights = [];

    /**
     * Loads the journal from localStorage into the in-memory array.
     * This is called once when the script first loads.
     */
    const load = () => {
        try {
            const storedJournal = localStorage.getItem(JOURNAL_KEY);
            if (storedJournal) {
                insights = JSON.parse(storedJournal);
            }
        } catch (e) {
            console.error("Failed to load or parse sentient journal:", e);
            insights = [];
        }
    };

    /**
     * Saves the current in-memory journal to localStorage.
     */
    const save = () => {
        try {
            localStorage.setItem(JOURNAL_KEY, JSON.stringify(insights));
        } catch (e) {
            console.error("Failed to save sentient journal:", e);
        }
    };

    /**
     * Adds a new analysis (insight) to the journal and persists it.
     * @param {object} newInsight The complete reflexTree object from a LEATR analysis.
     */
    const addInsight = (newInsight) => {
        if (!newInsight || !newInsight.prompt) return; // Don't save empty insights.
        
        // Add the new insight to the end of the array.
        insights.push(newInsight);

        // If the journal exceeds the max size, remove the oldest entry.
        if (insights.length > MAX_INSIGHTS) {
            insights.shift();
        }
        
        save();
    };

    /**
     * Finds a relevant past insight based on the current prompt's content.
     * This is the core of the "reflective" capability.
     * @param {string[]} currentPromptWords An array of words from the current user prompt.
     * @returns {object|null} A relevant insight object from the journal, or null if none is found.
     */
    const getRelevantInsight = (currentPromptWords) => {
        if (insights.length === 0 || currentPromptWords.length === 0) {
            return null;
        }

        // To make the reflection feel less deterministic, we'll shuffle the journal
        // before searching. This prevents it from always picking the same memory for a given prompt.
        const shuffledInsights = [...insights].sort(() => 0.5 - Math.random());
        let bestMatch = null;
        let highestScore = 0;

        // Find the insight with the most keyword overlap.
        for (const insight of shuffledInsights) {
            // Extract significant words (longer than 3 chars) from the old prompt.
            const oldPromptWords = new Set((insight.prompt.match(/\b[\w']+\b/g) || []).filter(w => w.length > 3));
            if (oldPromptWords.size === 0) continue;

            let currentScore = 0;
            for (const word of currentPromptWords) {
                if (word.length > 3 && oldPromptWords.has(word)) {
                    currentScore++;
                }
            }

            if (currentScore > highestScore) {
                highestScore = currentScore;
                bestMatch = insight;
            }
        }

        // Only return a match if there's at least one significant overlapping word.
        return highestScore > 0 ? bestMatch : null;
    };

    // --- Initialization ---
    // Load the journal from storage as soon as the module is defined.
    load();

    // Expose the public API for the main application to use.
    return {
        addInsight,
        getRelevantInsight,
        getAll: () => insights // A helper for debugging, to see the whole journal.
    };
})();