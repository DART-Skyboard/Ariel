// --- core/gestureManager.js ---

// Ensure Core namespace exists
const Core = window.Core || {};

Core.GestureManager = (function() {
    let hammerManager = null; // Hammer.js instance
    let activeToolMode = 'select'; // Current interaction mode ('select', 'translate', 'rotate', 'scale', 'draw', etc.)

    // Callbacks for different gesture events
    const gestureCallbacks = {
        pan: [],
        pinch: [],
        rotate: [],
        tap: [],
        doubletap: [],
        press: [],
        // Add more gesture types as needed
    };

    function init() {
        const canvas = Core.ThreeManager.getRenderer().domElement;
        if (!canvas) {
            console.error("Gesture Manager Error: Canvas element not found!");
            return;
        }

        // Initialize Hammer.js on the canvas
        hammerManager = new Hammer.Manager(canvas, {
            recognizers: [
                [Hammer.Pan, { direction: Hammer.DIRECTION_ALL }],
                [Hammer.Pinch, { enable: true }],
                [Hammer.Rotate, { enable: true }],
                [Hammer.Tap],
                [Hammer.DoubleTap],
                [Hammer.Press]
            ],
            // Enable touch action to prevent default browser scrolling etc.
            touchAction: 'manipulation'
        });

        // Register event listeners for gestures
        hammerManager.on('pan', (e) => notifyGestureCallbacks('pan', e));
        hammerManager.on('pinch', (e) => notifyGestureCallbacks('pinch', e));
        hammerManager.on('rotate', (e) => notifyGestureCallbacks('rotate', e));
        hammerManager.on('tap', (e) => notifyGestureCallbacks('tap', e));
        hammerManager.on('doubletap', (e) => notifyGestureCallbacks('doubletap', e));
        hammerManager.on('press', (e) => notifyGestureCallbacks('press', e));

        console.log("Gesture Manager initialized.");
    }

    // Register a callback for a specific gesture type
    function addGestureListener(gestureType, callback) {
        if (gestureCallbacks[gestureType]) {
            gestureCallbacks[gestureType].push(callback);
        } else {
            console.warn(`Unsupported gesture type: ${gestureType}`);
        }
    }

    // Notify all registered callbacks for a given gesture
    function notifyGestureCallbacks(gestureType, eventData) {
        if (!gestureCallbacks[gestureType]) return;

        // Process event data to be more Three.js friendly if needed
        // e.g., converting screen coordinates to Three.js world coordinates

        gestureCallbacks[gestureType].forEach(callback => {
            callback(eventData);
        });
    }

    // Set the current tool mode which might affect gesture handling
    function setToolMode(mode) {
        activeToolMode = mode;
        console.log(`Tool mode set to: ${activeToolMode}`);
        // Potentially reconfigure Hammer.js recognizers based on mode if needed
    }

    function getToolMode() {
        return activeToolMode;
    }

    // Handle resize events for gesture input
    function onResize() {
        // If gesture recognition depends on screen dimensions, update here.
        // For basic pan/pinch/rotate, Hammer.js usually handles it well.
    }

    return {
        init,
        addGestureListener,
        setToolMode,
        getToolMode,
        onResize
    };
})();