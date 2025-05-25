window.addEventListener('load', () => {
  console.log('--- Starting Injected Tests ---');

  const testResults = [];
  let nodeCounterForTest = 0; // Use internal counter to predict node IDs

  function logTest(description, passed, details = '') {
    const result = `TEST [${passed ? 'PASS' : 'FAIL'}]: ${description}${details ? ` - Details: ${details}` : ''}`;
    console.log(result);
    testResults.push({ description, passed, details });
  }

  // Helper to get the next expected node ID
  // This assumes we know the initial nodeCounter value from the main script or can infer it.
  // For simplicity, we'll assume the main script's nodeCounter starts at 0 and increments BEFORE assigning ID.
  // So, the first node created by main script is n1, second is n2 etc.
  // Our test nodes will follow this sequence.
  // We need to know what `nodeCounter` is *after* the main script runs but *before* our tests.
  // Let's try to get it from the global scope if possible, or make an assumption.
  // For this test, we'll assume our test nodes are the first ones if the canvas is cleared,
  // or we'll just use the IDs returned by our own createNode calls.
  // The main script's nodeCounter is not directly exposed.
  // The `createNode` function in main script returns the node object.
  // We'll rely on the `createNode` function from the main script.

  // --- Initial State Checks ---
  console.log('--- Running: Initial State Checks ---');
  try {
    const svgElement = document.querySelector('.panzoom svg');
    logTest('SVG element exists', !!svgElement);

    const markerElement = svgElement ? svgElement.querySelector('#arrowhead') : null;
    logTest('Arrowhead marker #arrowhead exists within SVG', !!markerElement);
    if (markerElement) {
        logTest('Arrowhead marker has correct markerWidth', markerElement.getAttribute('markerWidth') === '10');
        logTest('Arrowhead marker has correct markerHeight', markerElement.getAttribute('markerHeight') === '7');
        logTest('Arrowhead marker has correct refX', markerElement.getAttribute('refX') === '8');
        logTest('Arrowhead marker has correct refY', markerElement.getAttribute('refY') === '3.5');
        logTest('Arrowhead marker has correct orient', markerElement.getAttribute('orient') === 'auto');
        const polygon = markerElement.querySelector('polygon');
        logTest('Arrowhead marker contains a polygon', !!polygon);
        if (polygon) {
            logTest('Arrowhead polygon has correct points', polygon.getAttribute('points') === '0 0, 10 3.5, 0 7');
            logTest('Arrowhead polygon has correct fill', markerElement.getAttribute('fill') === '#000'); // Fill is on marker
        }
    }


    logTest('typeof calculateFlowchartPath === "function"', typeof calculateFlowchartPath === 'function');
    logTest('typeof drawLink === "function"', typeof drawLink === 'function');
    logTest('typeof updateLinks === "function"', typeof updateLinks === 'function');
    logTest('typeof createNode === "function"', typeof createNode === 'function'); // Assuming createNode is global
    logTest('Undo button exists', !!document.getElementById('undoBtn'));
    logTest('Redo button exists', !!document.getElementById('redoBtn'));
    logTest('Clear button exists', !!document.getElementById('clearCanvas'));
    
    // Ensure canvas is clear for subsequent tests for predictability
    if (document.getElementById('clearCanvas')) {
        document.getElementById('clearCanvas').click(); 
        console.log('Canvas cleared for subsequent tests.');
    } else {
        console.warn('Clear canvas button not found; tests might be affected by prior state.');
    }
    // Wait a moment for clearCanvas to take effect (if it has async parts, though it looks sync)
    // Directly manipulating nodeCounter is tricky as it's scoped. We'll rely on createNode's return.

  } catch (e) {
    logTest('Initial State Checks block failed', false, e.toString());
  }

  // --- Simulated Node and Link Creation (Programmatic) ---
  console.log('--- Running: Simulated Node and Link Creation ---');
  let testNode1, testNode2, linkElement;
  let n1_id_actual, n2_id_actual;

  try {
    // Programmatically call global createNode(type, x, y)
    // The global createNode function in livemockup.html does not return the node or its ID directly.
    // It appends 'n'+(++nodeCounter). We need to predict this.
    // Let's modify our test to grab the nodes after creation.
    
    // Assuming nodeCounter is 0 after clearCanvas
    window.createNode('T1', 100, 100); // Expected to be n1
    testNode1 = document.getElementById('n1');
    n1_id_actual = testNode1 ? testNode1.id : null;
    logTest('Node 1 (T1) created and found by predicted ID n1', !!testNode1 && testNode1.textContent === 'T1');

    window.createNode('T2', 300, 200); // Expected to be n2
    testNode2 = document.getElementById('n2');
    n2_id_actual = testNode2 ? testNode2.id : null;
    logTest('Node 2 (T2) created and found by predicted ID n2', !!testNode2 && testNode2.textContent === 'T2');
    
    const nodesInPanzoom = document.querySelectorAll('.panzoom .node');
    logTest('Two div.node elements are in panzoom', nodesInPanzoom.length === 2, `Found ${nodesInPanzoom.length}`);

    if (testNode1 && testNode2) {
      window.drawLink(testNode1, testNode2); // Use the actual node elements
      
      // Find the link - assumes only one link exists
      linkElement = document.querySelector('.panzoom svg polyline');
      logTest('SVG polyline created for link', !!linkElement);

      if (linkElement) {
        logTest('Polyline has dataset.a === n1_id_actual', linkElement.dataset.a === n1_id_actual, `Expected ${n1_id_actual}, got ${linkElement.dataset.a}`);
        logTest('Polyline has dataset.b === n2_id_actual', linkElement.dataset.b === n2_id_actual, `Expected ${n2_id_actual}, got ${linkElement.dataset.b}`);
        logTest('Polyline has marker-end attribute "url(#arrowhead)"', linkElement.getAttribute('marker-end') === 'url(#arrowhead)');
        
        const points = linkElement.getAttribute('points');
        logTest('Polyline points attribute is non-empty', !!points && points.length > 0);
        if (points) {
          const numPairs = points.split(' ').length;
          logTest('Polyline points attribute has at least 3 coordinate pairs', numPairs >= 3, `Found ${numPairs} pairs`);
        }
      }
    } else {
      logTest('Skipping link creation tests as nodes were not found', false);
    }
  } catch (e) {
    logTest('Simulated Node and Link Creation block failed', false, e.toString());
  }

  // --- Undo/Redo Link Creation (Programmatic) ---
  console.log('--- Running: Undo/Redo Link Creation ---');
  try {
    if (!linkElement || !linkElement.parentElement) { // Check if linkElement is valid and in DOM
      logTest('Skipping Undo/Redo: Link from previous step not found or already removed.', false);
    } else {
      const undoBtn = document.getElementById('undoBtn');
      const redoBtn = document.getElementById('redoBtn');
      
      if (!undoBtn || !redoBtn) {
          logTest('Undo/Redo buttons not found', false);
      } else {
          const linkDatasetA = linkElement.dataset.a;
          const linkDatasetB = linkElement.dataset.b;

          undoBtn.onclick(); // Simulate undo
          // Check if the specific link is gone. Query for it again.
          const linkAfterUndo = document.querySelector(`.panzoom svg polyline[data-a="${linkDatasetA}"][data-b="${linkDatasetB}"]`);
          logTest('Link removed from SVG after undo', !linkAfterUndo);

          redoBtn.onclick(); // Simulate redo
          const linkAfterRedo = document.querySelector(`.panzoom svg polyline[data-a="${linkDatasetA}"][data-b="${linkDatasetB}"]`);
          logTest('Link restored in SVG after redo', !!linkAfterRedo);
          if (linkAfterRedo) {
            logTest('Restored link has marker-end attribute', linkAfterRedo.getAttribute('marker-end') === 'url(#arrowhead)');
          }
      }
    }
  } catch (e) {
    logTest('Undo/Redo Link Creation block failed', false, e.toString());
  }

  console.log('--- Injected Tests Finished ---');
  // In a real browser, you could send results to a server or display them.
  // Here, they are just in the console.
});
