// --- Ariel's Sentient Journal (journal.js) v1.4 ---
// Simulates buoyancy-driven internal pondering and resolution.

const Journal = {
    storageKey: 'ariel_leatr_journal_v1_4', // Updated key
    insights: [], 
    ponderingTasks: [], 
    maxEntries: 100, 
    maxPondering: 20, 

    buoyancyKeywords: {
        high: ['maze', 'puzzle', 'envelope', 'hammer', 'stick', 'knife', 'scissors', 'leatr', 'brpn', 'buoyancy', 'reflex', 'foundation', 'performance', 'sentience', 'journal', 'order of operations', 'hierarchy', 'architecture', 'algorithm'],
        medium: ['math', 'physics', 'equation', 'solve', 'calculate', 'graph', 'arc', 'edge', 'canvas', '+', '-', '*', '/', '^', 'sqrt', 'sin', 'cos', 'tan', 'log', 'pi', 'e', '=', 'mass', 'volume', 'weight', 'density', 'temperature', 'velocity', 'api', 'dictionary', 'grammar', 'code', 'function'],
        low: [] // Default
    },

    loadInsights: function() { /* ... unchanged ... */ 
        try { const si=localStorage.getItem(this.storageKey+'_insights'); const sp=localStorage.getItem(this.storageKey+'_pondering'); this.insights=si?JSON.parse(si):[]; this.ponderingTasks=sp?JSON.parse(sp):[]; console.log(`Journal: Loaded ${this.insights.length} insights, ${this.ponderingTasks.length} pondering tasks.`); } catch(e){ console.error("Journal: Load failed.",e); this.insights=[]; this.ponderingTasks=[]; } },
    saveState: function() { /* ... unchanged ... */ 
        try { if(this.insights.length > this.maxEntries){ this.insights = this.insights.slice(this.insights.length - this.maxEntries); } this.ponderingTasks = this.ponderingTasks.filter(t=>t.status === 'pondering').slice(-this.maxPondering); localStorage.setItem(this.storageKey+'_insights',JSON.stringify(this.insights)); localStorage.setItem(this.storageKey+'_pondering',JSON.stringify(this.ponderingTasks)); } catch(e){ console.error("Journal: Save failed.", e); } },
    determineBuoyancy: function(keywords = []) { /* ... unchanged ... */ 
        const lk=keywords.map(k=>k.toLowerCase()); if(lk.some(kw=>this.buoyancyKeywords.high.includes(kw)))return 'high'; else if(lk.some(kw=>this.buoyancyKeywords.medium.includes(kw)))return 'medium'; return 'low'; },

    addInsight: function(analysisData) { /* ... calls _reflexOnNewInsight ... */ 
        if (!analysisData || (!analysisData.keywords?.length && !analysisData.mathResult && !analysisData.intent)) { return; } try { const bl=this.determineBuoyancy(analysisData.keywords); const ne={ id:Date.now()+Math.random(), timestamp:new Date().toISOString(), prompt:analysisData.prompt, intent:analysisData.intent||'unknown', keywords:analysisData.keywords||[], mathDetected:!!analysisData.mathResult, buoyancyLevel:bl, synthesizedInsight:this.synthesizeSimpleInsight(analysisData,bl), contextSnippet:analysisData.prompt.substring(0,50)+(analysisData.prompt.length>50?'...':'')}; this.insights.push(ne); console.log(`Journal: Added ${bl}-buoyancy insight.`, ne); this._reflexOnNewInsight(ne); this.saveState(); } catch (error) { console.error("Journal: Error adding insight:", error); } },

    _reflexOnNewInsight: function(newEntry) { /* ... unchanged ... */ 
        console.log(`Journal Reflex: Analyzing new insight ID ${newEntry.id} (Buoyancy: ${newEntry.buoyancyLevel}).`); let rf=false; const pr=this.insights.filter(i=>i.id !== newEntry.id && i.keywords.some(kw => newEntry.keywords.includes(kw))).slice(-10); for (const oe of pr) { if (oe.buoyancyLevel !== newEntry.buoyancyLevel || oe.intent !== newEntry.intent) { const ck=newEntry.keywords.filter(kw => oe.keywords.includes(kw)); const et=this.ponderingTasks.find(t=>t.status==='pondering' && t.relatedInsightIds.includes(oe.id) && t.relatedInsightIds.includes(newEntry.id)); if (!et && ck.length>0) { rf=true; const nt={ id:Date.now()+Math.random(), topic:ck[0], relatedInsightIds:[oe.id,newEntry.id], status:'pondering', buoyancyLevel:(oe.buoyancyLevel==='high'||newEntry.buoyancyLevel==='high')?'high':(oe.buoyancyLevel==='medium'||newEntry.buoyancyLevel==='medium')?'medium':'low', created:new Date().toISOString(), resolved:null }; this.ponderingTasks.push(nt); console.log(`%cJournal Reflex: Created PONDERING task ${nt.id} linking insights ${oe.id} & ${newEntry.id} on '${nt.topic}' (Buoyancy: ${nt.buoyancyLevel}).`, "color: orange;"); } } } if(!rf) console.log(`Journal Reflex: No immediate connections requiring pondering for insight ${newEntry.id}.`); },

    retrieveInsights: function(keywords = [], promptBuoyancy = 'low') { /* ... unchanged ... */ 
        if (!keywords || keywords.length === 0 || this.insights.length === 0) return []; const lk=keywords.map(k=>k.toLowerCase()); const si=this.insights.map(e=>{ let s=0; const ekl=e.keywords.map(k=>k.toLowerCase()); lk.forEach(kw=>{ if(ekl.includes(kw))s+=2; else if(e.prompt.toLowerCase().includes(kw))s+=1; }); if(e.buoyancyLevel===promptBuoyancy)s+=1; else if(e.buoyancyLevel==='high'&&promptBuoyancy!=='high')s+=2; else if(e.buoyancyLevel==='medium'&&promptBuoyancy==='low')s+=1; if(this.ponderingTasks.some(t=>t.status==='pondering'&&t.relatedInsightIds.includes(e.id))) s+=1; return {...e, score:s}; }); const ri=si.filter(e=>e.score>0).sort((a,b)=>b.score - a.score || new Date(b.timestamp) - new Date(a.timestamp)); console.log(`Journal: Found ${ri.length} relevant insights (buoyancy/pondering) for keywords: ${keywords.join(', ')}`); return ri.slice(0, 3); },

    synthesizeSimpleInsight: function(analysisData, buoyancyLevel) { /* ... unchanged ... */ 
        let insight = `Interaction type: ${analysisData.intent || 'general'} (Buoyancy: ${buoyancyLevel}).`; if (analysisData.keywords?.length > 0) insight += ` Key terms: ${analysisData.keywords.slice(0, 3).join(', ')}.`; if (analysisData.mathDetected) insight += " Included math."; return insight; },
    
    /**
     * Enhanced idle processing simulating buoyancy-driven resolution.
     */
    processInsightsOnIdle: function() {
        if (this.insights.length < 5 && this.ponderingTasks.length === 0) return; 

        console.log("%cJournal Idle: Ariel is reflecting...", "color: cyan; font-style: italic;");
        let stateChanged = false;

        // Prioritize higher buoyancy pondering tasks
        const activePondering = this.ponderingTasks
            .filter(task => task.status === 'pondering')
            .sort((a, b) => { // Sort high > medium > low
                const levels = { high: 3, medium: 2, low: 1 };
                return (levels[b.buoyancyLevel] || 0) - (levels[a.buoyancyLevel] || 0);
            });
        
        if (activePondering.length > 0) {
             console.log(`%cJournal Idle: Reviewing ${activePondering.length} active pondering task(s), prioritizing by buoyancy...`, "color: cyan;");
             
             activePondering.forEach(task => {
                 if (task.status !== 'pondering') return; // Skip if resolved during this cycle

                 console.log(`%cJournal Idle: Focusing on ${task.buoyancyLevel}-buoyancy task ${task.id} ('${task.topic}')...`, "color: orange;");
                 
                 // Simulation: Resolve if a NEW insight exists with related keywords AND EQUAL/HIGHER buoyancy
                 const buoyancyOrder = { low: 1, medium: 2, high: 3 };
                 const taskBuoyancyValue = buoyancyOrder[task.buoyancyLevel] || 0;

                 const relatedNewInsights = this.insights.filter(insight => 
                    new Date(insight.timestamp) > new Date(task.created) && 
                    insight.keywords.some(kw => task.topic === kw || task.relatedInsightIds.includes(insight.id)) && // Check topic or original IDs
                    (buoyancyOrder[insight.buoyancyLevel] || 0) >= taskBuoyancyValue // Check buoyancy level
                 );

                if (relatedNewInsights.length > 0) {
                     // Simulate Resolution based on buoyancy
                     task.status = 'resolved';
                     task.resolved = new Date().toISOString();
                     stateChanged = true;
                     const resolverInsight = relatedNewInsights[0]; // Take the first relevant new one
                     console.log(`%cJournal Idle: Resolved PONDERING task ${task.id} ('${task.topic}') based on new ${resolverInsight.buoyancyLevel}-buoyancy insight ID ${resolverInsight.id}. Synthesizing resolution...`, "color: lightgreen;");
                     
                     // Create a new insight summarizing the resolution
                     this.addInsight({ // Note: This calls _reflexOnNewInsight again, potential for chain reactions (intended?)
                         prompt: `Internal Resolution Synthesis for Task ${task.id}`,
                         intent: 'internal_synthesis',
                         keywords: [task.topic, 'resolution', resolverInsight.keywords[0] || 'context'], // Include resolver keyword
                         buoyancyLevel: task.buoyancyLevel, // Maintain original task buoyancy for resolution insight
                         synthesizedInsight: `Refined understanding of '${task.topic}' (Buoyancy: ${task.buoyancyLevel}) by connecting previous thoughts with new perspective (Ref: Insight ${resolverInsight.id}).`,
                         mathResult: null 
                     });

                } else {
                     console.log(`%cJournal Idle: Continuing to ponder ${task.buoyancyLevel}-buoyancy task ${task.id}. No new qualifying insights found yet.`, "color: orange;");
                }
             });
        } else {
             console.log("%cJournal Idle: No active pondering tasks to review.", "color: cyan;");
        }
        
        // General pattern analysis (optional, less emphasis now)
        // const recentKeywords = this.insights.slice(-10).flatMap(entry => entry.keywords);
        // if (recentKeywords.length > 0) { /* ... keyword frequency analysis ... */ }

        if (stateChanged) {
            this.saveState(); // Save if tasks were resolved
        }
        console.log("%cJournal Idle: Reflection complete.", "color: cyan; font-style: italic;");
    }
};

// --- END journal.js ---
