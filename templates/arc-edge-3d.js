/* ═══════════════════════════════════════════════════════════════
   ARC EDGE — 3D POINT-CLOUD SMITH CHART (WebGPU)
   ───────────────────────────────────────────────────────────────
   Toggled on/off from the 2D Smith chart via the HUD button.
   Reads live state (R, jX, Z0, frequency, Γ) from the 2D page's
   `state` / `lastGamma` globals defined in arc-edge-measure.html —
   this file adds the visual + interaction layer on top, it does
   not duplicate the impedance math.

   STRUCTURE (per the reference GLB's own node names):
     • "sphere contours only, no volumetric fill"  → static point
       cloud: 6 axis-offset unit spheres + 6 mid-tier spheres +
       3 orthogonal outer great-sphere wireframes.
     • "draggable point-cloud gimbal"              → green match
       point, built from a small point cluster, constrained to stay
       inside the outer sphere, synced to R/jX.
     • "3 programmable point-cloud curve types … turned 90° to one
       another on x/y/z"                            → incident /
       reflected / standing wave tubes, one triple per axis (9
       tubes total), animated by a compute shader.

   Everything renders as camera-facing billboard quads driven by
   storage buffers (WebGPU point-list has no point-sprite / size
   support, so billboards are the correct approach here).
═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ───────────────────────── mat4 / vec3 helpers (no deps) ───────────────────────── */
const M4 = {
  identity(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  multiply(a,b){
    const o = new Float32Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++){
      let s=0; for(let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k];
      o[c*4+r]=s;
    }
    return o;
  },
  perspective(fovy, aspect, near, far){
    const f = 1/Math.tan(fovy/2), o = new Float32Array(16);
    o[0]=f/aspect; o[5]=f; o[10]=far/(near-far); o[11]=-1; o[14]=(far*near)/(near-far);
    return o;
  },
  lookAt(eye, target, up){
    let zx=eye[0]-target[0], zy=eye[1]-target[1], zz=eye[2]-target[2];
    let zl=Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
    let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    let xl=Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    const o = new Float32Array(16);
    o[0]=xx; o[1]=yx; o[2]=zx; o[3]=0;
    o[4]=xy; o[5]=yy; o[6]=zy; o[7]=0;
    o[8]=xz; o[9]=yz; o[10]=zz; o[11]=0;
    o[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    o[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    o[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
    o[15]=1;
    return o;
  }
};
function v3sub(a,b){ return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
function v3len(a){ return Math.hypot(a[0],a[1],a[2]); }
function v3norm(a){ const l=v3len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; }

/* ───────────────────────── constants ───────────────────────── */
const OUTER_R   = 1.0;     // outer great-sphere radius, world units
const UNIT_R    = OUTER_R/3;    // 6 axis-offset "unit" spheres
const MID_R     = OUTER_R*0.62; // 6 mid-tier spheres (larger copy of the same 6 directions)
const MAX_MEASURES = 12;
const TUBE_PTS  = 220;     // points per wave tube (per axis, per wave type)
const TUBE_TYPES = ['incident','reflected','standing'];
const AXES = [
  {name:'x', dir:[1,0,0]},
  {name:'y', dir:[0,1,0]},
  {name:'z', dir:[0,0,1]},
];
const TYPE_COLOR = {
  incident:  [0.0, 0.78, 1.0],   // cyan
  reflected: [1.0, 0.24, 0.78],  // magenta
  standing:  [1.0, 0.70, 0.0],   // amber
};
const AXIS_TINT = { x:1.0, y:0.82, z:0.64 }; // slight per-axis brightness split so 3 axes stay visually separable

/* ───────────────────────── module state ───────────────────────── */
const S = {
  active: false,
  ready: false,
  supported: null,       // null=unknown, true/false once checked
  device: null, context: null, format: null, canvas: null,
  // camera (orbit)
  cam: { az: 0.7, el: 0.35, dist: 3.1, target:[0,0,0] },
  // interaction
  drag: { mode:null, lastX:0, lastY:0, pinchD:0 },
  // gimbal (green match point) — spherical coords, radius clamped to <= OUTER_R
  gimbal: { r: OUTER_R*0.55, theta: 0.9, phi: 0.6 }, // theta=polar, phi=azimuth
  // measurement markers (blue)
  measures: [],           // [{pos:[x,y,z], r, thetaDeg, phiDeg, label}]
  physicsOn: false,
  indicatorsOn: true,
  time: 0,
  // GPU buffers, filled during init
  structureBuf:null, structureCount:0,
  gimbalBuf:null, gimbalCount:0,
  measureBuf:null, measureCapacity: MAX_MEASURES*40,
  waveParticleBuf:null, waveParticleCount:0,
  arcCurveBuf:null, arcCurveCount:0,
  uniformBuf:null,
  renderPipeline:null, computePipeline:null,
  bindGroupRender:null, bindGroupCompute:null,
  depthTex:null,
};

/* ───────────────────────── geometry builders (CPU, run once) ───────────────────────── */

// Sphere wireframe-as-points: lat/long grid, pole axis = which local axis points "up"
function sphereContourPoints(radius, center, poleAxis, ringsLat, ringsLong, out){
  for(let i=0;i<=ringsLat;i++){
    const v = i/ringsLat, theta = v*Math.PI; // 0..PI
    for(let j=0;j<ringsLong;j++){
      const u = j/ringsLong, phi = u*Math.PI*2;
      let x = Math.sin(theta)*Math.cos(phi);
      let y = Math.cos(theta);
      let z = Math.sin(theta)*Math.sin(phi);
      let p;
      if(poleAxis==='x') p=[y,z,x];
      else if(poleAxis==='y') p=[x,y,z];
      else p=[z,x,y];
      out.push(center[0]+p[0]*radius, center[1]+p[1]*radius, center[2]+p[2]*radius);
    }
  }
}

function buildStructurePositions(){
  const pos = [], col = [];
  const push = (arr, r,g,b, n) => { for(let i=0;i<n;i++) arr.push(r,g,b); };

  // 6 unit spheres, tangent at origin, centered ±UNIT_R along each axis
  const unitDirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const unitColors = [[0,0.78,1],[0,0.78,1],[1,0.24,0.78],[1,0.24,0.78],[0.55,0.36,1],[0.55,0.36,1]];
  unitDirs.forEach((d,i)=>{
    const before = pos.length/3;
    const center = [d[0]*UNIT_R, d[1]*UNIT_R, d[2]*UNIT_R];
    sphereContourPoints(UNIT_R, center, i<2?'x':(i<4?'y':'z'), 14, 22, pos);
    const n = pos.length/3 - before;
    push(col, unitColors[i][0],unitColors[i][1],unitColors[i][2], n);
  });

  // 6 mid-tier spheres, same directions, larger radius, dimmer
  unitDirs.forEach((d,i)=>{
    const before = pos.length/3;
    const center = [d[0]*MID_R*0.5, d[1]*MID_R*0.5, d[2]*MID_R*0.5];
    sphereContourPoints(MID_R*0.5, center, i<2?'x':(i<4?'y':'z'), 12, 18, pos);
    const n = pos.length/3 - before;
    push(col, unitColors[i][0]*0.55+0.15, unitColors[i][1]*0.55+0.15, unitColors[i][2]*0.55+0.2, n);
  });

  // 3 orthogonal outer great-sphere wireframes (poles along x, y, z) — the "Smith sphere" boundary
  ['x','y','z'].forEach((axis)=>{
    const before = pos.length/3;
    sphereContourPoints(OUTER_R, [0,0,0], axis, 20, 30, pos);
    const n = pos.length/3 - before;
    push(col, 0.62,0.86,0.92, n);
  });

  return { positions: new Float32Array(pos), colors: new Float32Array(col), count: pos.length/3 };
}

// small point-cluster used for both the green gimbal and blue measurement markers
function pointClusterOffsets(n, r){
  const out = [];
  for(let i=0;i<n;i++){
    // fibonacci sphere distribution
    const yv = 1 - (i/(n-1))*2;
    const rad = Math.sqrt(Math.max(0,1-yv*yv));
    const theta = Math.PI*(3-Math.sqrt(5))*i;
    out.push(Math.cos(theta)*rad*r, yv*r, Math.sin(theta)*rad*r);
  }
  return out;
}

function sphericalToCartesian(r, theta, phi){
  return [
    r*Math.sin(theta)*Math.cos(phi),
    r*Math.cos(theta),
    r*Math.sin(theta)*Math.sin(phi)
  ];
}

/* ───────────────────────── WGSL shaders ───────────────────────── */

// Billboard point-cloud render shader — draws every point as a 6-vertex quad
// facing the camera, size + color come per-instance from a storage buffer.
const WGSL_RENDER = /* wgsl */`
struct Uniforms {
  viewProj : mat4x4<f32>,
  camRight : vec4<f32>,
  camUp    : vec4<f32>,
  pointSize: f32,
  _pad0: f32, _pad1: f32, _pad2: f32,
};
@group(0) @binding(0) var<uniform> U : Uniforms;
@group(0) @binding(1) var<storage, read> positions : array<vec4<f32>>; // xyz + sizeMul
@group(0) @binding(2) var<storage, read> colors    : array<vec4<f32>>; // rgb + alpha

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) uv : vec2<f32>,
};

const CORNERS = array<vec2<f32>,6>(
  vec2<f32>(-1.0,-1.0), vec2<f32>( 1.0,-1.0), vec2<f32>( 1.0, 1.0),
  vec2<f32>(-1.0,-1.0), vec2<f32>( 1.0, 1.0), vec2<f32>(-1.0, 1.0)
);

@vertex
fn vs_main(@builtin(vertex_index) vId : u32, @builtin(instance_index) iId : u32) -> VSOut {
  var out : VSOut;
  let p = positions[iId];
  let c = colors[iId];
  let corner = CORNERS[vId % 6u];
  let sz = U.pointSize * p.w;
  let worldOffset = U.camRight.xyz * corner.x * sz + U.camUp.xyz * corner.y * sz;
  out.pos = U.viewProj * vec4<f32>(p.xyz + worldOffset, 1.0);
  out.color = c;
  out.uv = corner;
  return out;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  let glow = pow(1.0 - d, 1.6);
  return vec4<f32>(in.color.rgb, in.color.a * glow);
}
`;

// Compute shader: animates the wave-tube particles (kinematic sine motion
// along their tube path) and, when physicsOn = 1, adds gravity/atmosphere
// drag plus radial disturbance impulses sourced from measurement points.
const WGSL_COMPUTE = /* wgsl */`
struct WaveParticle {
  basePos : vec4<f32>,   // xyz = resting position on the tube path, w = phase offset
  vel     : vec4<f32>,   // xyz = physics velocity, w unused
};
struct SimParams {
  time: f32, dt: f32, freqMHz: f32, gammaMag: f32,
  gammaAngle: f32, physicsOn: f32, gravity: f32, atmDensity: f32,
  measureCount: f32, _p0: f32, _p1: f32, _p2: f32,
};
struct Measure { pos: vec4<f32> }; // xyz + strength

@group(0) @binding(0) var<storage, read_write> particles : array<WaveParticle>;
@group(0) @binding(1) var<storage, read_write> outPos : array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params : SimParams;
@group(0) @binding(3) var<storage, read> measures : array<Measure>;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  var pt = particles[i];

  let k = 0.9 + (params.freqMHz/6000.0) * 2.4;
  let wSpeed = 1.1 + (params.freqMHz/6000.0) * 2.2;
  let phase = pt.basePos.w;

  // kinematic sine displacement along the local outward normal of the base position
  let dirLen = max(length(pt.basePos.xyz), 0.0001);
  let n = pt.basePos.xyz / dirLen;
  let osc = sin(phase * k - params.time * wSpeed) * (0.05 + params.gammaMag*0.05);
  var kinematicPos = pt.basePos.xyz + n * osc;

  if (params.physicsOn > 0.5) {
    // gravity + light atmospheric damping, then settle back toward the kinematic target
    var vel = pt.vel.xyz;
    vel.y -= params.gravity * params.dt;
    vel = vel * (1.0 - params.atmDensity * params.dt);

    // disturbance impulses from measurement cross-sections
    var mCount = i32(params.measureCount);
    for (var m = 0; m < mCount; m = m + 1) {
      let mp = measures[m].pos;
      let toP = pt.basePos.xyz - mp.xyz;
      let d = max(length(toP), 0.02);
      if (d < 0.5) {
        let falloff = (0.5 - d) / 0.5;
        vel += normalize(toP) * falloff * mp.w * 1.6 * params.dt;
      }
    }

    // 'vel' here doubles as a persistent position-offset accumulator (cheap
    // damped-spring approximation, not a rigorous integrator): each frame it
    // picks up gravity + disturbance impulses, then gets pulled back toward
    // the kinematic wave position so particles settle instead of drifting
    // off forever.
    let physPos = pt.basePos.xyz + vel;
    let toKin = kinematicPos - physPos;
    vel += toKin * 2.2 * params.dt;

    pt.vel = vec4<f32>(vel, 0.0);
    outPos[i] = vec4<f32>(mix(kinematicPos, pt.basePos.xyz + vel, 0.5), 1.0);
  } else {
    pt.vel = vec4<f32>(0.0,0.0,0.0,0.0);
    outPos[i] = vec4<f32>(kinematicPos, 1.0);
  }
  particles[i] = pt;
}
`;

/* ───────────────────────── init ───────────────────────── */
async function initGPU(canvas){
  if(!('gpu' in navigator)){ S.supported=false; return false; }
  try{
    const adapter = await navigator.gpu.requestAdapter();
    if(!adapter){ S.supported=false; return false; }
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode:'premultiplied' });
    S.device=device; S.context=context; S.format=format; S.canvas=canvas;
    S.supported = true;
    buildBuffers();
    buildPipelines();
    return true;
  }catch(err){
    console.error('[ArcEdge3D] WebGPU init failed:', err);
    S.supported=false;
    return false;
  }
}

function buildBuffers(){
  const device = S.device;

  // ---- static structure point cloud ----
  const struct = buildStructurePositions();
  S.structureCount = struct.count;
  const structPos = new Float32Array(struct.count*4);
  const structCol = new Float32Array(struct.count*4);
  for(let i=0;i<struct.count;i++){
    structPos[i*4]=struct.positions[i*3]; structPos[i*4+1]=struct.positions[i*3+1];
    structPos[i*4+2]=struct.positions[i*3+2]; structPos[i*4+3]=1.6; // size mul
    structCol[i*4]=struct.colors[i*3]; structCol[i*4+1]=struct.colors[i*3+1];
    structCol[i*4+2]=struct.colors[i*3+2]; structCol[i*4+3]=0.55;
  }
  S.structurePosBuf = makeStorageBuffer(structPos, 'struct-pos');
  S.structureColBuf = makeStorageBuffer(structCol, 'struct-col');

  // ---- gimbal (green) point cluster ----
  const gOff = pointClusterOffsets(48, OUTER_R*0.045);
  S.gimbalCount = gOff.length/3;
  S.gimbalLocalOffsets = gOff;
  S.gimbalPosBuf = makeStorageBuffer(new Float32Array(S.gimbalCount*4), 'gimbal-pos');
  const gCol = new Float32Array(S.gimbalCount*4);
  for(let i=0;i<S.gimbalCount;i++){ gCol[i*4]=0.22; gCol[i*4+1]=1.0; gCol[i*4+2]=0.48; gCol[i*4+3]=0.95; }
  S.gimbalColBuf = makeStorageBuffer(gCol, 'gimbal-col');

  // ---- measurement markers (blue) — fixed-capacity buffer, only first N*40 used ----
  const perMarker = 30;
  S.measurePerMarker = perMarker;
  S.measurePosBuf = makeStorageBuffer(new Float32Array(MAX_MEASURES*perMarker*4), 'measure-pos');
  const mCol = new Float32Array(MAX_MEASURES*perMarker*4);
  for(let i=0;i<MAX_MEASURES*perMarker;i++){ mCol[i*4]=0.25; mCol[i*4+1]=0.55; mCol[i*4+2]=1.0; mCol[i*4+3]=0.9; }
  S.measureColBuf = makeStorageBuffer(mCol, 'measure-col');

  // ---- wave tube particles (dynamic, compute-driven) ----
  const baseArr = [];
  TUBE_TYPES.forEach((type, ti)=>{
    AXES.forEach((axis)=>{
      for(let i=0;i<TUBE_PTS;i++){
        const t = i/TUBE_PTS, ang = t*Math.PI*2;
        // circular path in the plane perpendicular to axis.dir, radius depends on wave type tier
        const rTier = 0.7 + ti*0.13;
        const rad = OUTER_R*rTier;
        let a,b;
        if(axis.name==='x'){ a=[0,1,0]; b=[0,0,1]; }
        else if(axis.name==='y'){ a=[1,0,0]; b=[0,0,1]; }
        else { a=[1,0,0]; b=[0,1,0]; }
        const x = (a[0]*Math.cos(ang)+b[0]*Math.sin(ang))*rad;
        const y = (a[1]*Math.cos(ang)+b[1]*Math.sin(ang))*rad;
        const z = (a[2]*Math.cos(ang)+b[2]*Math.sin(ang))*rad;
        baseArr.push(x,y,z, ang*6.0); // w = phase
      }
    });
  });
  S.waveParticleCount = baseArr.length/4;
  const baseF32 = new Float32Array(baseArr);
  const velF32 = new Float32Array(S.waveParticleCount*4);
  const interleaved = new Float32Array(S.waveParticleCount*8);
  for(let i=0;i<S.waveParticleCount;i++){
    interleaved.set(baseF32.subarray(i*4,i*4+4), i*8);
    interleaved.set(velF32.subarray(i*4,i*4+4), i*8+4);
  }
  S.waveParticleBuf = makeStorageBuffer(interleaved, 'wave-particles', true);
  S.waveOutPosBuf = makeStorageBuffer(new Float32Array(S.waveParticleCount*4), 'wave-outpos', true);
  const waveColArr = new Float32Array(S.waveParticleCount*4);
  let idx=0;
  TUBE_TYPES.forEach((type)=>{
    AXES.forEach((axis)=>{
      const c = TYPE_COLOR[type], tint = AXIS_TINT[axis.name];
      for(let i=0;i<TUBE_PTS;i++){
        waveColArr[idx*4]=c[0]*tint; waveColArr[idx*4+1]=c[1]*tint; waveColArr[idx*4+2]=c[2]*tint;
        waveColArr[idx*4+3]=0.85; idx++;
      }
    });
  });
  S.waveColBuf = makeStorageBuffer(waveColArr, 'wave-col');

  // ---- arc-edge triangulation curve (rebuilt on demand) ----
  S.arcCurveBuf = makeStorageBuffer(new Float32Array(600*4), 'arc-curve', true);
  S.arcCurveColBuf = makeStorageBuffer(new Float32Array(600*4).fill(0), 'arc-curve-col', true);
  S.arcCurveCount = 0;

  // ---- uniforms ----
  // Uniforms struct = mat4x4<f32>(64) + camRight vec4(16) + camUp vec4(16)
  // + pointSize/_pad0/_pad1/_pad2 (4×4=16) = 112 bytes.
  S.uniformBuf = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  S.simParamsBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
}

function makeStorageBuffer(dataF32, label /*, writable — kept as a param for call-site clarity, but every
     storage buffer gets COPY_SRC now since exportGLB() reads back structure/gimbal/wave-color buffers
     too, not just the ones that were originally flagged as compute-writable */){
  const device = S.device;
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const buf = device.createBuffer({ size: Math.max(16, dataF32.byteLength), usage, label });
  device.queue.writeBuffer(buf, 0, dataF32);
  return buf;
}

function buildPipelines(){
  const device = S.device;
  const renderModule = device.createShaderModule({ code: WGSL_RENDER });
  const computeModule = device.createShaderModule({ code: WGSL_COMPUTE });

  S.renderBindLayout = device.createBindGroupLayout({
    entries:[
      {binding:0, visibility:GPUShaderStage.VERTEX, buffer:{type:'uniform'}},
      {binding:1, visibility:GPUShaderStage.VERTEX, buffer:{type:'read-only-storage'}},
      {binding:2, visibility:GPUShaderStage.VERTEX, buffer:{type:'read-only-storage'}},
    ]
  });
  S.renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[S.renderBindLayout]}),
    vertex:{ module: renderModule, entryPoint:'vs_main' },
    fragment:{ module: renderModule, entryPoint:'fs_main', targets:[{
      format:S.format,
      blend:{ color:{srcFactor:'src-alpha',dstFactor:'one',operation:'add'},
              alpha:{srcFactor:'one',dstFactor:'one',operation:'add'} }
    }]},
    primitive:{ topology:'triangle-list' },
    depthStencil:{ format:'depth24plus', depthWriteEnabled:false, depthCompare:'less' },
  });

  S.computeBindLayout = device.createBindGroupLayout({
    entries:[
      {binding:0, visibility:GPUShaderStage.COMPUTE, buffer:{type:'storage'}},
      {binding:1, visibility:GPUShaderStage.COMPUTE, buffer:{type:'storage'}},
      {binding:2, visibility:GPUShaderStage.COMPUTE, buffer:{type:'uniform'}},
      {binding:3, visibility:GPUShaderStage.COMPUTE, buffer:{type:'read-only-storage'}},
    ]
  });
  S.computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[S.computeBindLayout]}),
    compute:{ module: computeModule, entryPoint:'cs_main' }
  });

  S.measureStrengthBuf = makeStorageBuffer(new Float32Array(MAX_MEASURES*4), 'measure-strength', true);

  S.computeBindGroup = device.createBindGroup({
    layout: S.computeBindLayout,
    entries:[
      {binding:0, resource:{buffer:S.waveParticleBuf}},
      {binding:1, resource:{buffer:S.waveOutPosBuf}},
      {binding:2, resource:{buffer:S.simParamsBuf}},
      {binding:3, resource:{buffer:S.measureStrengthBuf}},
    ]
  });

  S.bgStructure = device.createBindGroup({ layout:S.renderBindLayout, entries:[
    {binding:0,resource:{buffer:S.uniformBuf}},
    {binding:1,resource:{buffer:S.structurePosBuf}},
    {binding:2,resource:{buffer:S.structureColBuf}},
  ]});
  S.bgGimbal = device.createBindGroup({ layout:S.renderBindLayout, entries:[
    {binding:0,resource:{buffer:S.uniformBuf}},
    {binding:1,resource:{buffer:S.gimbalPosBuf}},
    {binding:2,resource:{buffer:S.gimbalColBuf}},
  ]});
  S.bgMeasure = device.createBindGroup({ layout:S.renderBindLayout, entries:[
    {binding:0,resource:{buffer:S.uniformBuf}},
    {binding:1,resource:{buffer:S.measurePosBuf}},
    {binding:2,resource:{buffer:S.measureColBuf}},
  ]});
  S.bgWave = device.createBindGroup({ layout:S.renderBindLayout, entries:[
    {binding:0,resource:{buffer:S.uniformBuf}},
    {binding:1,resource:{buffer:S.waveOutPosBuf}},
    {binding:2,resource:{buffer:S.waveColBuf}},
  ]});
  S.bgArc = device.createBindGroup({ layout:S.renderBindLayout, entries:[
    {binding:0,resource:{buffer:S.uniformBuf}},
    {binding:1,resource:{buffer:S.arcCurveBuf}},
    {binding:2,resource:{buffer:S.arcCurveColBuf}},
  ]});
}

function ensureDepthTex(){
  const device = S.device, canvas = S.canvas;
  if(S.depthTex && S.depthTex.width===canvas.width && S.depthTex.height===canvas.height) return;
  if(S.depthTex) S.depthTex.destroy();
  S.depthTex = device.createTexture({
    size:[canvas.width, canvas.height], format:'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });
}

/* ───────────────────────── per-frame update ───────────────────────── */
function currentGammaState(){
  // pulled from the 2D page's globals (arc-edge-measure.html)
  // `lastGamma` is declared with `let` in the inline <script> in
  // arc-edge-measure.html — top-level let/const from a classic script tag
  // become bare identifiers in the shared script realm, NOT window
  // properties, so this file (loaded as a separate deferred classic
  // script, executing after the inline one) reads it directly by name.
  const g = (typeof lastGamma !== 'undefined') ? lastGamma : {gr:0,gi:0,gMag:0,gAngRad:0,freq:100};
  return g;
}

function updateGimbalFromState(){
  // sync green gimbal to R/jX so both views agree — reuse the same gr/gi
  // used by the 2D chart, mapped onto the outer sphere's equatorial-ish band
  const g = currentGammaState();
  const rr = Math.min(0.985, g.gMag) * OUTER_R;
  const az = g.gAngRad;
  S.gimbal.r = rr;
  S.gimbal.phi = az;
  S.gimbal.theta = Math.PI/2 - (Math.PI/2)*0.15*Math.sin(az*2); // gentle tilt so it's not pinned flat
}

function gimbalWorldPos(){
  return sphericalToCartesian(S.gimbal.r, S.gimbal.theta, S.gimbal.phi);
}

function writeGimbalBuffer(){
  const center = gimbalWorldPos();
  const arr = new Float32Array(S.gimbalCount*4);
  for(let i=0;i<S.gimbalCount;i++){
    arr[i*4]  = center[0]+S.gimbalLocalOffsets[i*3];
    arr[i*4+1]= center[1]+S.gimbalLocalOffsets[i*3+1];
    arr[i*4+2]= center[2]+S.gimbalLocalOffsets[i*3+2];
    arr[i*4+3]= 1.3;
  }
  S.device.queue.writeBuffer(S.gimbalPosBuf, 0, arr);
  return center;
}

function writeMeasureBuffer(){
  const per = S.measurePerMarker;
  const arr = new Float32Array(MAX_MEASURES*per*4);
  const strengths = new Float32Array(MAX_MEASURES*4);
  S.measures.forEach((m, mi)=>{
    if(mi>=MAX_MEASURES) return;
    const offs = m._offsets || (m._offsets = pointClusterOffsets(per, OUTER_R*0.032));
    for(let i=0;i<per;i++){
      const idx = mi*per+i;
      arr[idx*4]  = m.pos[0]+offs[i*3];
      arr[idx*4+1]= m.pos[1]+offs[i*3+1];
      arr[idx*4+2]= m.pos[2]+offs[i*3+2];
      arr[idx*4+3]= 1.15;
    }
    strengths[mi*4]=m.pos[0]; strengths[mi*4+1]=m.pos[1]; strengths[mi*4+2]=m.pos[2]; strengths[mi*4+3]=0.35;
  });
  S.device.queue.writeBuffer(S.measurePosBuf, 0, arr);
  S.device.queue.writeBuffer(S.measureStrengthBuf, 0, strengths);
}

function updateUniforms(){
  const canvas = S.canvas;
  const aspect = canvas.width/Math.max(1,canvas.height);
  const eye = [
    S.cam.target[0] + S.cam.dist*Math.cos(S.cam.el)*Math.sin(S.cam.az),
    S.cam.target[1] + S.cam.dist*Math.sin(S.cam.el),
    S.cam.target[2] + S.cam.dist*Math.cos(S.cam.el)*Math.cos(S.cam.az),
  ];
  const view = M4.lookAt(eye, S.cam.target, [0,1,0]);
  const proj = M4.perspective(50*Math.PI/180, aspect, 0.05, 40);
  const vp = M4.multiply(proj, view);

  // camera right/up in world space for billboarding
  const fwd = v3norm(v3sub(S.cam.target, eye));
  const worldUp = [0,1,0];
  let right = [fwd[1]*worldUp[2]-fwd[2]*worldUp[1], fwd[2]*worldUp[0]-fwd[0]*worldUp[2], fwd[0]*worldUp[1]-fwd[1]*worldUp[0]];
  right = v3norm(right);
  const camUp = [right[1]*fwd[2]-right[2]*fwd[1], right[2]*fwd[0]-right[0]*fwd[2], right[0]*fwd[1]-right[1]*fwd[0]];

  const u = new Float32Array(24);
  u.set(vp, 0);
  u.set([right[0],right[1],right[2],0], 16);
  u.set([camUp[0],camUp[1],camUp[2],0], 20);
  const u2 = new Float32Array(4);
  u2[0] = 0.028 * (canvas.height/720); // base point size in world units, scaled to canvas
  const full = new Float32Array(24+4);
  full.set(u,0); full.set(u2,24);
  S.device.queue.writeBuffer(S.uniformBuf, 0, full);
  S._lastEye = eye;
}

function runComputePass(dt){
  const g = currentGammaState();
  S.time += dt;
  const params = new Float32Array([
    S.time, dt, g.freq||100, g.gMag||0,
    g.gAngRad||0, S.physicsOn?1:0, 1.4, 0.9,
    S.measures.length, 0,0,0
  ]);
  S.device.queue.writeBuffer(S.simParamsBuf, 0, params);

  const encoder = S.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(S.computePipeline);
  pass.setBindGroup(0, S.computeBindGroup);
  pass.dispatchWorkgroups(Math.ceil(S.waveParticleCount/64));
  pass.end();
  S.device.queue.submit([encoder.finish()]);
}

function render(){
  const device = S.device, context = S.context;
  ensureDepthTex();
  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({
    colorAttachments:[{ view, clearValue:{r:0.01,g:0.012,b:0.02,a:0.0}, loadOp:'clear', storeOp:'store' }],
    depthStencilAttachment:{ view:S.depthTex.createView(), depthClearValue:1.0, depthLoadOp:'clear', depthStoreOp:'store' }
  });
  pass.setPipeline(S.renderPipeline);

  pass.setBindGroup(0, S.bgStructure);
  pass.draw(6, S.structureCount, 0, 0);

  pass.setBindGroup(0, S.bgWave);
  pass.draw(6, S.waveParticleCount, 0, 0);

  if(S.arcCurveCount>0){
    pass.setBindGroup(0, S.bgArc);
    pass.draw(6, S.arcCurveCount, 0, 0);
  }

  if(S.measures.length>0){
    pass.setBindGroup(0, S.bgMeasure);
    pass.draw(6, Math.min(MAX_MEASURES,S.measures.length)*S.measurePerMarker, 0, 0);
  }

  pass.setBindGroup(0, S.bgGimbal);
  pass.draw(6, S.gimbalCount, 0, 0);

  pass.end();
  device.queue.submit([encoder.finish()]);
}

/* ───────────────────────── labels (HTML overlay, screen-projected) ───────────────────────── */
function projectToScreen(worldPos){
  const canvas = S.canvas;
  const aspect = canvas.width/Math.max(1,canvas.height);
  const eye = S._lastEye || [0,0,3];
  const view = M4.lookAt(eye, S.cam.target, [0,1,0]);
  const proj = M4.perspective(50*Math.PI/180, aspect, 0.05, 40);
  const vp = M4.multiply(proj, view);
  const x = worldPos[0], y = worldPos[1], z = worldPos[2];
  const cx = vp[0]*x+vp[4]*y+vp[8]*z+vp[12];
  const cy = vp[1]*x+vp[5]*y+vp[9]*z+vp[13];
  const cw = vp[3]*x+vp[7]*y+vp[11]*z+vp[15];
  if(cw<=0) return null;
  const ndcX = cx/cw, ndcY = cy/cw;
  const rect = canvas.getBoundingClientRect();
  return { x: (ndcX*0.5+0.5)*rect.width, y: (1-(ndcY*0.5+0.5))*rect.height };
}

function refreshLabels(){
  const wrap = document.getElementById('s3d-labels');
  if(!wrap) return;
  wrap.innerHTML='';
  if(!S.indicatorsOn) return;
  const gPos = gimbalWorldPos();
  const st = (typeof state !== 'undefined') ? state : null;
  addLabel(wrap, gPos, `Z = ${st? st.r.toFixed(1):'—'} ${st&&st.x>=0?'+':'−'} j${st?Math.abs(st.x).toFixed(1):'—'}`, '#39ff7a');
  S.measures.forEach((m,i)=>{
    addLabel(wrap, m.pos, m.label || `M${i+1}`, '#4d8bff');
  });
}
function addLabel(wrap, worldPos, text, color){
  const p = projectToScreen(worldPos);
  if(!p) return;
  const el = document.createElement('div');
  el.className='s3d-label';
  el.style.left = p.x+'px'; el.style.top = p.y+'px'; el.style.setProperty('--lc', color);
  el.innerHTML = `<span class="s3d-stem"></span><span class="s3d-tag">${text}</span>`;
  wrap.appendChild(el);
}

/* ───────────────────────── measurement / triangulation ───────────────────────── */
function addMeasurement(){
  if(S.measures.length>=MAX_MEASURES) return;
  const pos = gimbalWorldPos();
  const g = currentGammaState();
  S.measures.push({
    pos, gMag:g.gMag, gAngRad:g.gAngRad, freq:g.freq,
    label:`M${S.measures.length+1} · Γ${g.gMag.toFixed(2)}`
  });
  writeMeasureBuffer();
  renderMeasureList();
}
function clearMeasurements(){
  S.measures = [];
  S.arcCurveCount = 0;
  writeMeasureBuffer();
  renderMeasureList();
  const out = document.getElementById('s3d-triresult');
  if(out) out.textContent = '—';
}

// Arc-edge convention ported from the 2D chart: c = d × 3 (not π), applied
// to the straight-line "diameter" between each pair of measurement points.
function docCircumference3D(d){ return d*3; }

function triangulate(){
  if(S.measures.length<2){
    const out = document.getElementById('s3d-triresult');
    if(out) out.textContent='Add at least 2 measurement points first.';
    return;
  }
  // pairwise distances + doc-circumference, sequential path
  let totalDist=0, totalDoc=0;
  const pairs=[];
  for(let i=0;i<S.measures.length-1;i++){
    const a=S.measures[i].pos, b=S.measures[i+1].pos;
    const d = Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    const doc = docCircumference3D(d);
    totalDist+=d; totalDoc+=doc;
    pairs.push({i,j:i+1,d,doc});
  }
  // centroid
  const c=[0,0,0];
  S.measures.forEach(m=>{ c[0]+=m.pos[0]; c[1]+=m.pos[1]; c[2]+=m.pos[2]; });
  c[0]/=S.measures.length; c[1]/=S.measures.length; c[2]/=S.measures.length;

  buildArcCurve();

  const out = document.getElementById('s3d-triresult');
  if(out){
    out.innerHTML = `PATH LENGTH: <b>${totalDist.toFixed(3)}</b> du &nbsp; ARC-EDGE DOC: <b>${totalDoc.toFixed(3)}</b> du<br>` +
      pairs.map(p=>`M${p.i+1}→M${p.j+1}: d=${p.d.toFixed(3)} doc=${p.doc.toFixed(3)}`).join(' · ');
  }
}

// build a point-cloud "tube" curve stepping through all measurement points in order
function buildArcCurve(){
  const pts=[];
  const STEPS_PER_SEG = 60;
  for(let i=0;i<S.measures.length-1;i++){
    const a=S.measures[i].pos, b=S.measures[i+1].pos;
    for(let s=0;s<STEPS_PER_SEG;s++){
      const t = s/STEPS_PER_SEG;
      // gentle great-circle-ish bow outward from chart center for visual clarity
      const lerp=[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
      const bow = Math.sin(t*Math.PI)*0.08;
      const len = Math.hypot(lerp[0],lerp[1],lerp[2])||1;
      pts.push(lerp[0]+lerp[0]/len*bow, lerp[1]+lerp[1]/len*bow, lerp[2]+lerp[2]/len*bow);
    }
  }
  const n = Math.min(600, pts.length/3);
  const posArr = new Float32Array(600*4);
  const colArr = new Float32Array(600*4);
  for(let i=0;i<n;i++){
    posArr[i*4]=pts[i*3]; posArr[i*4+1]=pts[i*3+1]; posArr[i*4+2]=pts[i*3+2]; posArr[i*4+3]=1.1;
    colArr[i*4]=1.0; colArr[i*4+1]=0.83; colArr[i*4+2]=0.14; colArr[i*4+3]=0.95;
  }
  S.device.queue.writeBuffer(S.arcCurveBuf, 0, posArr);
  S.device.queue.writeBuffer(S.arcCurveColBuf, 0, colArr);
  S.arcCurveCount = n;
}

function renderMeasureList(){
  const list = document.getElementById('s3d-measurelist');
  if(!list) return;
  list.innerHTML = S.measures.map((m,i)=>`<div class="s3d-mrow">${m.label}</div>`).join('') || '<div class="s3d-mrow muted">No measurements yet — position the gimbal, tap "+ Add".</div>';
}

/* ───────────────────────── camera interaction ───────────────────────── */
function attachInteraction(canvas){
  let mode=null, lx=0, ly=0, startDist=0, gimbalMode=false;
  const GIMBAL_HIT_PX = 34;

  function nearGimbalScreen(x,y){
    const p = projectToScreen(gimbalWorldPos());
    if(!p) return false;
    return Math.hypot(p.x-x,p.y-y) < GIMBAL_HIT_PX;
  }

  canvas.addEventListener('pointerdown', (e)=>{
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX-rect.left, y = e.clientY-rect.top;
    gimbalMode = nearGimbalScreen(x,y);
    mode = gimbalMode ? 'gimbal' : 'orbit';
    lx=e.clientX; ly=e.clientY;
  });
  canvas.addEventListener('pointermove', (e)=>{
    if(!mode) return;
    const dx=e.clientX-lx, dy=e.clientY-ly; lx=e.clientX; ly=e.clientY;
    if(mode==='orbit'){
      S.cam.az -= dx*0.008;
      S.cam.el = Math.max(-1.4, Math.min(1.4, S.cam.el - dy*0.008));
    } else if(mode==='gimbal'){
      S.gimbal.phi += dx*0.01;
      S.gimbal.theta = Math.max(0.06, Math.min(Math.PI-0.06, S.gimbal.theta + dy*0.01));
      S.gimbalManual = true;
      syncGimbalToInputs();
    }
  });
  window.addEventListener('pointerup', ()=>{ mode=null; });

  canvas.addEventListener('wheel', (e)=>{
    e.preventDefault();
    S.cam.dist = Math.max(1.4, Math.min(9, S.cam.dist + e.deltaY*0.0025));
  }, {passive:false});

  // pinch zoom (touch)
  canvas.addEventListener('touchstart', (e)=>{
    if(e.touches.length===2){
      startDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    }
  }, {passive:true});
  canvas.addEventListener('touchmove', (e)=>{
    if(e.touches.length===2){
      const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      const delta = (startDist-d)*0.01;
      S.cam.dist = Math.max(1.4, Math.min(9, S.cam.dist + delta));
      startDist = d;
    }
  }, {passive:true});
}

// when the user manually drags the 3D gimbal, push R/jX back into the 2D inputs
// so both views stay in lockstep (matches "connect over to the 3D scene" spec)
function syncGimbalToInputs(){
  const mag = Math.min(0.999, S.gimbal.r/OUTER_R);
  const ang = S.gimbal.phi;
  const gr = mag*Math.cos(ang), gi = mag*Math.sin(ang);
  // gammaToZ/computeAndRender are `function` declarations in the inline
  // script, so unlike state/lastGamma they DO attach to window — but we
  // read them as bare identifiers too for consistency, guarded in case
  // this file is ever loaded standalone.
  if(typeof gammaToZ === 'function' && typeof state !== 'undefined'){
    const z0 = state.z0;
    const [zr,zx] = gammaToZ(gr,gi,z0);
    state.r = Math.max(0.01, zr);
    state.x = zx;
    const inR = document.getElementById('in-r'), inX = document.getElementById('in-x');
    if(inR) inR.value = state.r.toFixed(2);
    if(inX) inX.value = state.x.toFixed(2);
    if(typeof computeAndRender === 'function') computeAndRender();
  }
}

/* ───────────────────────── main loop ───────────────────────── */
let lastT = performance.now();
function frameLoop(ts){
  if(S.active) requestAnimationFrame(frameLoop);
  if(!S.active || !S.ready) return;
  const dt = Math.min(0.05, (ts-lastT)/1000); lastT=ts;
  if(!S.gimbalManual) updateGimbalFromState();
  writeGimbalBuffer();
  updateUniforms();
  runComputePass(dt);
  render();
  refreshLabels();
}

/* ───────────────────────── export ───────────────────────── */
async function exportPNG(px){
  if(!S.ready) return;
  const tmp = document.createElement('canvas');
  tmp.width = px; tmp.height = px;
  const ctx = tmp.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device:S.device, format, alphaMode:'premultiplied' });

  const savedCanvas = S.canvas, savedContext = S.context;
  S.canvas = tmp; S.context = ctx;
  S.depthTex && S.depthTex.destroy(); S.depthTex=null;
  updateUniforms();
  render();
  await S.device.queue.onSubmittedWorkDone();
  S.canvas = savedCanvas; S.context = savedContext;
  S.depthTex && S.depthTex.destroy(); S.depthTex = null;

  tmp.toBlob((blob)=>{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `arc-edge-3d-smith-chart-${px}px.png`;
    a.click();
  }, 'image/png');
}

// Minimal static glTF/GLB writer — exports current point-cloud snapshot
// (structure + wave particles + gimbal + measurement markers) as POINTS.
// NOTE: this is a single-frame snapshot, not baked animation — the live
// wave motion is procedural/compute-driven and isn't something a static
// GLB format can carry without a full keyframe-baking pass (flagged as a
// follow-up rather than faked here).
async function exportGLB(){
  if(!S.ready) return;
  const device = S.device;
  const positions=[], colors=[];
  const pull = async (buf, count)=>{
    const bytes = count*4*4;
    const readBuf = device.createBuffer({ size:bytes, usage: GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(buf,0,readBuf,0,bytes);
    device.queue.submit([enc.finish()]);
    await readBuf.mapAsync(GPUMapMode.READ);
    const arr = new Float32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    return arr;
  };
  const structPos = await pull(S.structurePosBuf, S.structureCount);
  const structCol = await pull(S.structureColBuf, S.structureCount);
  const wavePos = await pull(S.waveOutPosBuf, S.waveParticleCount);
  const waveCol = await pull(S.waveColBuf, S.waveParticleCount);
  const gimbalPos = await pull(S.gimbalPosBuf, S.gimbalCount);
  const gimbalCol = await pull(S.gimbalColBuf, S.gimbalCount);

  function append(src, count, stride){
    for(let i=0;i<count;i++){
      positions.push(src[0][i*4], src[0][i*4+1], src[0][i*4+2]);
      colors.push(src[1][i*4], src[1][i*4+1], src[1][i*4+2]);
    }
  }
  append([structPos,structCol], S.structureCount);
  append([wavePos,waveCol], S.waveParticleCount);
  append([gimbalPos,gimbalCol], S.gimbalCount);
  S.measures.forEach(m=>{ positions.push(m.pos[0],m.pos[1],m.pos[2]); colors.push(0.25,0.55,1.0); });

  const posF32 = new Float32Array(positions);
  const colF32 = new Float32Array(colors);
  const buffer = new Uint8Array(posF32.buffer.byteLength + colF32.buffer.byteLength);
  buffer.set(new Uint8Array(posF32.buffer), 0);
  buffer.set(new Uint8Array(colF32.buffer), posF32.buffer.byteLength);

  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3) for(let k=0;k<3;k++){ min[k]=Math.min(min[k],positions[i+k]); max[k]=Math.max(max[k],positions[i+k]); }

  const gltf = {
    asset:{ version:'2.0', generator:'Arc Edge 3D Point Cloud Exporter' },
    scenes:[{nodes:[0]}], scene:0,
    nodes:[{mesh:0, name:'ArcEdge3D_PointCloud_Snapshot'}],
    meshes:[{primitives:[{ attributes:{POSITION:0, COLOR_0:1}, mode:0 }]}],
    accessors:[
      {bufferView:0, componentType:5126, count:positions.length/3, type:'VEC3', min, max},
      {bufferView:1, componentType:5126, count:colors.length/3, type:'VEC3'},
    ],
    bufferViews:[
      {buffer:0, byteOffset:0, byteLength:posF32.buffer.byteLength},
      {buffer:0, byteOffset:posF32.buffer.byteLength, byteLength:colF32.buffer.byteLength},
    ],
    buffers:[{byteLength: buffer.byteLength}],
  };
  const jsonStr = JSON.stringify(gltf);
  const jsonPadded = jsonStr + ' '.repeat((4 - (jsonStr.length % 4)) % 4);
  const jsonBytes = new TextEncoder().encode(jsonPadded);
  const binPadLen = (4 - (buffer.byteLength % 4)) % 4;
  const binPadded = new Uint8Array(buffer.byteLength + binPadLen);
  binPadded.set(buffer, 0);

  const totalLen = 12 + 8+jsonBytes.byteLength + 8+binPadded.byteLength;
  const out = new ArrayBuffer(totalLen);
  const dv = new DataView(out);
  let o=0;
  dv.setUint32(o,0x46546C67,true); o+=4;      // magic 'glTF'
  dv.setUint32(o,2,true); o+=4;                // version
  dv.setUint32(o,totalLen,true); o+=4;
  dv.setUint32(o,jsonBytes.byteLength,true); o+=4;
  dv.setUint32(o,0x4E4F534A,true); o+=4;       // 'JSON'
  new Uint8Array(out,o,jsonBytes.byteLength).set(jsonBytes); o+=jsonBytes.byteLength;
  dv.setUint32(o,binPadded.byteLength,true); o+=4;
  dv.setUint32(o,0x004E4942,true); o+=4;       // 'BIN\0'
  new Uint8Array(out,o,binPadded.byteLength).set(binPadded); o+=binPadded.byteLength;

  const blob = new Blob([out], {type:'model/gltf-binary'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'arc-edge-3d-smith-chart.glb';
  a.click();
}

/* ───────────────────────── HUD wiring ───────────────────────── */
function wireHUD(){
  const addBtn = document.getElementById('s3d-add');
  const clearBtn = document.getElementById('s3d-clear');
  const triBtn = document.getElementById('s3d-triangulate');
  const physTog = document.getElementById('s3d-physics');
  const indTog = document.getElementById('s3d-indicators');
  const pngBtns = document.querySelectorAll('[data-s3d-png]');
  const glbBtn = document.getElementById('s3d-export-glb');

  addBtn && addBtn.addEventListener('click', addMeasurement);
  clearBtn && clearBtn.addEventListener('click', clearMeasurements);
  triBtn && triBtn.addEventListener('click', triangulate);
  physTog && physTog.addEventListener('change', (e)=>{ S.physicsOn = e.target.checked; });
  indTog && indTog.addEventListener('change', (e)=>{ S.indicatorsOn = e.target.checked; refreshLabels(); });
  pngBtns.forEach(b=> b.addEventListener('click', ()=> exportPNG(parseInt(b.dataset.s3dPng,10))));
  glbBtn && glbBtn.addEventListener('click', exportGLB);

  renderMeasureList();
}

/* ───────────────────────── toggle entry point ───────────────────────── */
async function toggle3D(){
  const wrap = document.getElementById('scene3d-wrap');
  const btn = document.getElementById('btn-3d-toggle');
  if(!wrap) return;

  if(!S.active){
    wrap.style.display='flex';
    btn && (btn.textContent='2D');
    if(!S.ready){
      const canvas = document.getElementById('scene3d-canvas');
      const msgEl = document.getElementById('s3d-fallback-msg');
      const ok = await initGPU(canvas);
      if(!ok){
        if(msgEl) msgEl.style.display='flex';
        return;
      }
      if(msgEl) msgEl.style.display='none';
      resizeCanvas();
      wireHUD();
      S.ready = true;
    }
    S.active = true;
    lastT = performance.now();
    requestAnimationFrame(frameLoop);
  } else {
    S.active = false;
    wrap.style.display='none';
    btn && (btn.textContent='3D');
  }
}

function resizeCanvas(){
  const canvas = document.getElementById('scene3d-canvas');
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio||1);
  canvas.width = Math.max(2, Math.round(rect.width*dpr));
  canvas.height = Math.max(2, Math.round(rect.height*dpr));
}
window.addEventListener('resize', ()=>{ if(S.ready) resizeCanvas(); });

/* ───────────────────────── boot ───────────────────────── */
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('btn-3d-toggle');
  if(btn) btn.addEventListener('click', toggle3D);
  const canvas = document.getElementById('scene3d-canvas');
  if(canvas) attachInteraction(canvas);
});

window.ArcEdge3D = { toggle: toggle3D };
})();
