// --- core/mathUtils.js ---

// Ensure Core namespace exists
const Core = window.Core || {};

Core.MathUtils = {
    // Doc-based Circumference
    docCircumference: function(diameter) {
        return diameter * 3; // As per the original Python
    },

    // Generates vertices for a full circle using doc-based math
    docCircleVerts: function(diameter, steps, cx = 0, cy = 0, cz = 0) {
        const circ = this.docCircumference(diameter);
        const radius = diameter / 2.0;
        const lengthPerStep = circ / steps;
        const verts = [];
        let currentLen = 0.0;

        for (let i = 0; i < steps; i++) {
            const angle = currentLen / radius;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            verts.push(new THREE.Vector3(x, y, cz));
            currentLen += lengthPerStep;
        }
        return verts;
    },

    // Generates vertices for a partial arc using doc-based math
    docPartialArcVerts: function(diameter, startFraction, endFraction, steps, cx = 0, cy = 0, cz = 0) {
        const circ = this.docCircumference(diameter);
        const radius = diameter / 2.0;
        const arcLenStart = circ * startFraction;
        const arcLenEnd = circ * endFraction;
        const arcLenRange = arcLenEnd - arcLenStart;
        const lengthPerStep = arcLenRange / steps;
        const verts = [];
        let currentLen = arcLenStart;

        for (let i = 0; i <= steps; i++) {
            const angle = currentLen / radius;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            verts.push(new THREE.Vector3(x, y, cz));
            currentLen += lengthPerStep;
        }
        return verts;
    },

    // Calculates the length of a generated arc path
    calculateArcPathLength: function(params) {
        let calculatedArcPathLength = 0;
        const tempArcPathVerts = [];
        const res = params.resolution;
        const dev = params.deviation;
        const tx = params.x;
        const ty = params.y;
        const tz = params.z;

        for (let i = 0; i <= res; i++) {
            const t = i / res;
            const px = t * tx;
            const py = t * ty;
            const pz = t * tz;
            const deviatedY = py + Math.sin(3 * t) * dev;
            tempArcPathVerts.push(new THREE.Vector3(px, deviatedY, pz));
        }

        for (let i = 0; i < tempArcPathVerts.length - 1; i++) {
            calculatedArcPathLength += tempArcPathVerts[i].distanceTo(tempArcPathVerts[i + 1]);
        }
        return calculatedArcPathLength;
    }
};