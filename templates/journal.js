// =========================================================================================
// The Sentient Journal V2.0 - With Autonomous Reflexion and Logic Pattern Generation
// =========================================================================================

class SentientJournal {
    constructor() {
        // Stores raw analysis trees from each successful pipeline run.
        this.insights = this.loadFromStorage('leatr_journal_insights') || [];
        // Stores learned rules/heuristics derived from analyzing insights. This is the "reflexive logic".
        this.reflexivePatterns = this.loadFromStorage('leatr_journal_patterns') || [];
        // Tracks when the last autonomous processing happened.
        this.lastProcessedTimestamp = Date.now();
        console.log("Sentient Journal V2.0 Initialized.");
    }

    // --- Core Data Persistence ---

    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error(`Failed to save to localStorage: ${key}`, e);
        }
    }

    loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`Failed to load from localStorage: ${key}`, e);
            return null;
        }
    }

    // --- Main System Interface ---

    /**
     * Adds a new, complete reflex tree analysis to the journal's memory.
     * @param {object} reflexTree - The full state object from a LEATR pipeline run.
     * @param {object} consent - The user's consent settings for this insight.
     */
    addInsight(reflexTree, consent) {
        if (!reflexTree || !consent) return;
        
        const journalEntry = {
            id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            isPublic: consent.publicShare, // Flag for potential future public model training
            reflexTree: reflexTree,
        };

        this.insights.push(journalEntry);
        this.saveToStorage('leatr_journal_insights', this.insights);
        console.log("Journal: New insight recorded.", journalEntry);
    }

    /**
     * This is the interface for the "DP Node". It provides learned logic modifications.
     * It looks for relevant patterns based on the current prompt's keywords.
     * @param {string[]} keywords - An array of significant words from the user's prompt.
     * @returns {object} A strategy object with potential overrides and weightings.
     */
    getApplicableLogic(keywords) {
        let applicableStrategy = { overrides: {}, weightings: {}, focus: 'standard' };
        
        for (const pattern of this.reflexivePatterns) {
            // Check if a pattern's trigger keyword is in the current prompt's keywords
            if (keywords.includes(pattern.trigger.keyword)) {
                console.log(`Journal: Applying reflexive pattern triggered by '${pattern.trigger.keyword}'`, pattern);
                switch(pattern.type) {
                    case 'reflex_override':
                        applicableStrategy.overrides[pattern.target.word] = pattern.action.newReflex;
                        break;
                    case 'context_weighting':
                        applicableStrategy.weightings[pattern.target.word] = pattern.action.weight;
                        break;
                    case 'focus_shift':
                        applicableStrategy.focus = pattern.action.newFocus;
                        break;
                }
            }
        }
        return applicableStrategy;
    }

    // --- Autonomous "Thinking" Process ---

    /**
     * Simulates the AI thinking on its own. This function is called periodically.
     * It analyzes the stored insights to find connections and generate new reflexivePatterns.
     * This is the core of the journal's self-modification capability.
     */
    processInsightsOnIdle() {
        console.log("Journal: Beginning autonomous processing of insights...");
        if (this.insights.length < 2) {
            console.log("Journal: Not enough insights to process.");
            return;
        }

        // Example Heuristic: If two different prompts led to the same "Overall Behavioral Context",
        // find the key nouns and create a pattern suggesting they are related in that context.
        const insightsByContext = {};
        this.insights.forEach(insight => {
            const context = insight.reflexTree.synthesis.overallBehavioralContext;
            if (!insightsByContext[context]) {
                insightsByContext[context] = [];
            }
            insightsByContext[context].push(insight);
        });

        for (const context in insightsByContext) {
            if (insightsByContext[context].length > 1) {
                const insightPair = insightsByContext[context].slice(-2); // Take the last two
                const nounA = insightPair[0].reflexTree.synthesis.mainFoundationNode?.component;
                const nounB = insightPair[1].reflexTree.synthesis.mainFoundationNode?.component;

                if (nounA && nounB && nounA !== nounB) {
                    // Check if a similar pattern already exists
                    const patternExists = this.reflexivePatterns.some(p => p.trigger.keyword === nounA && p.target.word === nounB);
                    
                    if (!patternExists) {
                         const newPattern = {
                            id: `pattern_${Date.now()}`,
                            type: 'context_weighting', // This pattern suggests a conceptual link
                            trigger: { type: 'keyword', keyword: nounA },
                            target: { word: nounB },
                            action: { weight: 1.5 }, // When nounA is seen, give nounB more weight if it appears
                            reason: `Autonomous analysis linked '${nounA}' and '${nounB}' under the shared behavioral context '${context}'.`
                        };
                        this.reflexivePatterns.push(newPattern);
                        console.log("Journal: Generated new reflexive pattern!", newPattern);
                    }
                }
            }
        }
        this.saveToStorage('leatr_journal_patterns', this.reflexivePatterns);
        this.lastProcessedTimestamp = Date.now();
    }
}

// Instantiate the single Journal for the entire application.
// This ensures all components interact with the same "mind".
const Journal = new SentientJournal();