const puppeteer = require('puppeteer');
const path = require('path');
// const { existsSync } = require('fs'); // Not used, remove

const HTML_FILE_PATH = path.resolve(process.cwd(), 'templates/livemockup.html');
const GRID_SIZE = 60; // From livemockup.html
const NODE_WIDTH = 50;
const NODE_HEIGHT = 50;
const NODE_CENTER_OFFSET = 25; // NODE_WIDTH / 2

async function runTests() {
  let browser;
  let page;
  const results = {};
  let testCounter = 1;

  const logTestResult = (name, passed, details = '') => {
    results[`Test ${testCounter++}: ${name}`] = { passed, details };
  };

  try {
    console.log('Launching Puppeteer...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath: puppeteer.executablePath(), 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    page = await browser.newPage();
    console.log(`Navigating to ${HTML_FILE_PATH}...`);
    await page.goto(`file://${HTML_FILE_PATH}`, { waitUntil: 'networkidle0' });
    console.log('Page loaded.');

    // Helper function to create a node
    const createNode = async (type, x, y) => {
      return await page.evaluate((nodeType, nodeX, nodeY) => {
        window.createNode(nodeType, nodeX, nodeY);
        const nodes = Array.from(document.querySelectorAll('.panzoom .node'));
        return nodes.pop().id; 
      }, type, x, y);
    };
    
    const getNodeDetails = async (nodeId) => {
        return await page.evaluate((id) => {
            const node = document.getElementById(id);
            if (!node) return null;
            return {
                id: node.id,
                textContent: node.textContent,
                styleLeft: node.style.left,
                styleTop: node.style.top,
                width: node.offsetWidth, 
                height: node.offsetHeight, 
            };
        }, nodeId);
    };

    const getLinkDetails = async (nodeAId, nodeBId) => {
      return await page.evaluate((idA, idB) => {
        const polyline = document.querySelector(`polyline[data-a="${idA}"][data-b="${idB}"], polyline[data-a="${idB}"][data-b="${idA}"]`);
        if (!polyline) return null;
        return {
          points: polyline.getAttribute('points'),
          markerEnd: polyline.getAttribute('marker-end'),
          datasetA: polyline.dataset.a,
          datasetB: polyline.dataset.b,
        };
      }, nodeAId, nodeBId);
    };
    
    const getAllPolylines = async () => {
        return await page.evaluate(() => {
            return Array.from(document.querySelectorAll('svg polyline')).map(pl => ({
                points: pl.getAttribute('points'),
                markerEnd: pl.getAttribute('marker-end'),
                datasetA: pl.dataset.a,
                datasetB: pl.dataset.b,
            }));
        });
    };

    console.log('Running Scenario 1: Node Creation and Initial State');
    const node1X = GRID_SIZE * 2, node1Y = GRID_SIZE * 2;
    const node2X = GRID_SIZE * 5, node2Y = GRID_SIZE * 2;
    
    const node1Id = await createNode('M', node1X, node1Y);
    const node2Id = await createNode('P', node2X, node2Y);

    const node1Details = await getNodeDetails(node1Id);
    const node2Details = await getNodeDetails(node2Id);
    
    let scenario1Passed = true;
    let scenario1Details = '';

    if (!node1Details || node1Details.textContent !== 'M' || node1Details.styleLeft !== `${node1X}px` || node1Details.styleTop !== `${node1Y}px`) {
      scenario1Passed = false;
      scenario1Details += 'Node 1 ("M") creation or properties incorrect. ';
    }
    if (!node2Details || node2Details.textContent !== 'P' || node2Details.styleLeft !== `${node2X}px` || node2Details.styleTop !== `${node2Y}px`) {
      scenario1Passed = false;
      scenario1Details += 'Node 2 ("P") creation or properties incorrect. ';
    }
    const initialPolylines = await getAllPolylines();
    if (initialPolylines.length !== 0) {
      scenario1Passed = false;
      scenario1Details += `SVG should initially have 0 polylines, but found ${initialPolylines.length}.`;
    }
    logTestResult('Node Creation and Initial State', scenario1Passed, scenario1Details);

    console.log('Running Scenario 2: Link Creation with Arrowhead and Path');
    await page.click('#linkBtn'); 
    await page.click(`#${node1Id}`);
    await page.click(`#${node2Id}`);

    const link1Details = await getLinkDetails(node1Id, node2Id);
    let scenario2Passed = true;
    let scenario2Details = '';

    if (!link1Details) {
      scenario2Passed = false;
      scenario2Details += 'Polyline not created. ';
    } else {
      if (link1Details.markerEnd !== 'url(#arrowhead)') {
        scenario2Passed = false;
        scenario2Details += `Polyline marker-end incorrect: ${link1Details.markerEnd}. `;
      }
      const points = link1Details.points.split(' ');
      if (points.length !== 3) { 
        scenario2Passed = false;
        scenario2Details += `Polyline path does not have 3 points (L-shape): ${points.length} points found. `;
      }
      if (!((link1Details.datasetA === node1Id && link1Details.datasetB === node2Id) || 
            (link1Details.datasetA === node2Id && link1Details.datasetB === node1Id))) {
        scenario2Passed = false;
        scenario2Details += `Polyline dataset attributes incorrect: a=${link1Details.datasetA}, b=${link1Details.datasetB}. `;
      }
    }
    const polylinesAfterLink = await getAllPolylines();
    if (polylinesAfterLink.length !== 1) {
        scenario2Passed = false;
        scenario2Details += `Expected 1 polyline, found ${polylinesAfterLink.length}. `;
    }
    logTestResult('Link Creation with Arrowhead and Path', scenario2Passed, scenario2Details);
    await page.click('#linkBtn'); 

    console.log('Running Scenario 3: Dynamic Update on Node Drag');
    const initialLinkPoints = link1Details ? link1Details.points : '';
    const newNode2X = node2X + GRID_SIZE * 2;
    const newNode2Y = node2Y + GRID_SIZE * 1;

    await page.evaluate((id, x, y) => {
      const node = document.getElementById(id);
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      window.updateLinks(node); 
    }, node2Id, newNode2X, newNode2Y);
    
    const link1DetailsAfterDrag = await getLinkDetails(node1Id, node2Id);
    let scenario3Passed = true;
    let scenario3Details = '';

    if (!link1DetailsAfterDrag) {
        scenario3Passed = false;
        scenario3Details = 'Link details not found after drag. ';
    } else if (link1DetailsAfterDrag.points === initialLinkPoints) {
      scenario3Passed = false;
      scenario3Details = 'Polyline points did not change after node drag. ';
    } else {
      const points = link1DetailsAfterDrag.points.split(' ');
      if (points.length !== 3) { 
        scenario3Passed = false;
        scenario3Details += `Polyline path does not have 3 points after drag: ${points.length} points found. `;
      }
    }
    logTestResult('Dynamic Update on Node Drag', scenario3Passed, scenario3Details);

    console.log('Running Scenario 4: Obstacle Avoidance');
    const linkPointsBeforeObstacle = link1DetailsAfterDrag ? link1DetailsAfterDrag.points : '';
    const obstacleX = Math.round((node1X + newNode2X) / 2 / GRID_SIZE) * GRID_SIZE;
    const obstacleY = node1Y; 
    
    const obstacleNodeId = await createNode('O', obstacleX, obstacleY); 
    await page.waitForTimeout(250); // Increased timeout for recalculation

    const link1DetailsAfterObstacle = await getLinkDetails(node1Id, node2Id);
    let scenario4Passed = true;
    let scenario4Details = '';

    if (!link1DetailsAfterObstacle) {
        scenario4Passed = false;
        scenario4Details = 'Link details not found after obstacle. ';
    } else if (link1DetailsAfterObstacle.points === linkPointsBeforeObstacle) {
      scenario4Passed = false;
      scenario4Details = 'Polyline points did not change after obstacle node creation. This might indicate recalculation did not happen or pathing logic chose the same path (which is possible but less likely with a direct obstacle). ';
    }
    const obstacleDetails = await getNodeDetails(obstacleNodeId);
     if (!obstacleDetails) {
      scenario4Passed = false;
      scenario4Details += 'Obstacle node not found. ';
    }
    logTestResult('Dynamic Update on New Node Creation (Obstacle Avoidance)', scenario4Passed, scenario4Details);

    console.log('Running Scenario 5: Undo/Redo Link Creation');
    await page.click('#clearCanvas');
    await page.waitForTimeout(100);
    const node3Id = await createNode('U', GRID_SIZE, GRID_SIZE);
    const node4Id = await createNode('V', GRID_SIZE * 4, GRID_SIZE);
    await page.click('#linkBtn');
    await page.click(`#${node3Id}`);
    await page.click(`#${node4Id}`);
    await page.click('#linkBtn'); 
    
    let linkForUndoRedo = await getLinkDetails(node3Id, node4Id);
    let scenario5Passed = true;
    let scenario5Details = '';

    if (!linkForUndoRedo) {
      scenario5Passed = false;
      scenario5Details += 'Link for undo/redo test not created. ';
    } else {
      await page.click('#undoBtn');
      await page.waitForTimeout(100);
      linkForUndoRedo = await getLinkDetails(node3Id, node4Id);
      if (linkForUndoRedo) {
        scenario5Passed = false;
        scenario5Details += 'Polyline not removed after undo. ';
      }

      await page.click('#redoBtn');
      await page.waitForTimeout(100);
      linkForUndoRedo = await getLinkDetails(node3Id, node4Id);
      if (!linkForUndoRedo) {
        scenario5Passed = false;
        scenario5Details += 'Polyline not restored after redo. ';
      } else if (linkForUndoRedo.markerEnd !== 'url(#arrowhead)') {
        scenario5Passed = false;
        scenario5Details += `Polyline marker-end incorrect after redo: ${linkForUndoRedo.markerEnd}. `;
      }
    }
    logTestResult('Undo/Redo Link Creation', scenario5Passed, scenario5Details);

    console.log('Running Scenario 6: Undo/Redo Link Deletion');
    let linkForDeleteUndoRedo = await getLinkDetails(node3Id, node4Id);
    let scenario6Passed = true;
    let scenario6Details = '';

    if (!linkForDeleteUndoRedo) {
      scenario6Passed = false;
      scenario6Details += 'Link for delete undo/redo test not present. ';
    } else {
      await page.click('#unlinkBtn'); 
      await page.click(`#${node3Id}`); 
      await page.waitForTimeout(100);
      linkForDeleteUndoRedo = await getLinkDetails(node3Id, node4Id);
      if (linkForDeleteUndoRedo) {
        scenario6Passed = false;
        scenario6Details += 'Polyline not removed after unlink. ';
      }
      await page.click('#unlinkBtn');

      await page.click('#undoBtn');
      await page.waitForTimeout(100);
      linkForDeleteUndoRedo = await getLinkDetails(node3Id, node4Id);
      if (!linkForDeleteUndoRedo) {
        scenario6Passed = false;
        scenario6Details += 'Polyline not restored after undoing delete. ';
      } else if (linkForDeleteUndoRedo.markerEnd !== 'url(#arrowhead)') {
        scenario6Passed = false;
        scenario6Details += `Polyline marker-end incorrect after undoing delete: ${linkForDeleteUndoRedo.markerEnd}. `;
      }

      await page.click('#redoBtn');
      await page.waitForTimeout(100);
      linkForDeleteUndoRedo = await getLinkDetails(node3Id, node4Id);
      if (linkForDeleteUndoRedo) {
        scenario6Passed = false;
        scenario6Details += 'Polyline not removed again after redoing delete. ';
      }
    }
    logTestResult('Undo/Redo Link Deletion', scenario6Passed, scenario6Details);

  } catch (error) {
    console.error('Error during Puppeteer tests:', error);
    logTestResult('Global Error', false, `Test execution failed: ${error.message}`);
  } finally {
    if (browser) {
      console.log('Closing Puppeteer...');
      await browser.close();
    }
    console.log('\n--- Test Results ---');
    for (const [testName, result] of Object.entries(results)) {
      console.log(`${testName}: ${result.passed ? 'PASS' : 'FAIL'}${result.details ? ` - ${result.details}` : ''}`);
    }
    const overallSuccess = Object.values(results).every(r => r.passed);
    console.log(`\nOverall Test Result: ${overallSuccess ? 'ALL PASS' : 'SOME FAILURES'}`);
    process.exit(overallSuccess ? 0 : 1);
  }
}

runTests();
