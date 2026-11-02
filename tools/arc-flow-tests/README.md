# arc-flow test harnesses

Plain-node checks for `templates/arc-flow.html` (no browser, no build step).

    node tools/arc-flow-tests/syntax-check.js     # inline <script> syntax (node --check)
    node tools/arc-flow-tests/flow-graph.test.js  # buildFlowGraph / tagFlowGraph / renderJointReport (stubbed THREE)
    node tools/arc-flow-tests/detect.test.js      # joint detection on synthetic meshes; needs three@0.160.0
                                                  #   (npm i three@0.160.0, or THREE_PATH=.../three.module.js; skips otherwise)

`ARC_FLOW_HTML=<file>` points `detect.test.js` at another revision, e.g. `git show main:templates/arc-flow.html > /tmp/old.html`.

`boolean-instances.test.js` - two cloned assemblies (different transforms) get independent Boolean joints, graphs, tagFlowGraph, sync and LTCBP joint regions (needs three.js like detect.test.js).
