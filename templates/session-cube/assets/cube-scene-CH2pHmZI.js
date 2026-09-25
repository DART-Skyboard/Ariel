import{a as e,i as t,n,o as r,r as i,s as a,t as o}from"./index-DGC__NYH.js";import{A as s,B as c,C as l,D as u,E as d,F as f,G as p,H as m,I as h,J as g,K as _,M as v,N as y,O as b,P as x,R as ee,S,T as C,U as te,V as w,W as ne,X as T,Y as E,Z as re,_ as ie,a as ae,b as oe,c as D,d as se,f as O,g as ce,h as le,i as ue,j as de,k,l as fe,m as pe,n as me,o as he,p as ge,q as _e,r as ve,s as A,t as ye,u as be,v as xe,w as j,x as Se,y as Ce,z as M}from"./three.module-3UrziOeR.js";var N=a(),we={type:`change`},P={type:`start`},F={type:`end`},I=new x,Te=new de,Ee=Math.cos(70*l.DEG2RAD),L=new T,R=2*Math.PI,z={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},De=1e-6,Oe=class extends fe{constructor(e,t=null){super(e,t),this.state=z.NONE,this.target=new T,this.cursor=new T,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:`ArrowLeft`,UP:`ArrowUp`,RIGHT:`ArrowRight`,BOTTOM:`ArrowDown`},this.mouseButtons={LEFT:S.ROTATE,MIDDLE:S.DOLLY,RIGHT:S.PAN},this.touches={ONE:p.ROTATE,TWO:p.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle=`auto`,this._domElementKeyEvents=null,this._lastPosition=new T,this._lastQuaternion=new v,this._lastTargetPosition=new T,this._quat=new v().setFromUnitVectors(e.up,new T(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new w,this._sphericalDelta=new w,this._scale=1,this._panOffset=new T,this._rotateStart=new E,this._rotateEnd=new E,this._rotateDelta=new E,this._panStart=new E,this._panEnd=new E,this._panDelta=new E,this._dollyStart=new E,this._dollyEnd=new E,this._dollyDelta=new E,this._dollyDirection=new T,this._mouse=new E,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=Ae.bind(this),this._onPointerDown=ke.bind(this),this._onPointerUp=je.bind(this),this._onContextMenu=Ie.bind(this),this._onMouseWheel=Ne.bind(this),this._onKeyDown=Pe.bind(this),this._onTouchStart=V.bind(this),this._onTouchMove=Fe.bind(this),this._onMouseDown=Me.bind(this),this._onMouseMove=B.bind(this),this._interceptControlDown=Le.bind(this),this._interceptControlUp=Re.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e===`grab`?this.domElement.style.cursor=`grab`:this.domElement.style.cursor=`auto`}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointercancel`,this._onPointerUp),this.domElement.addEventListener(`contextmenu`,this._onContextMenu),this.domElement.addEventListener(`wheel`,this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener(`keydown`,this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction=`none`}disconnect(){this.state=z.NONE,this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.removeEventListener(`pointercancel`,this._onPointerUp),this.domElement.removeEventListener(`wheel`,this._onMouseWheel),this.domElement.removeEventListener(`contextmenu`,this._onContextMenu),this.stopListenToKeyEvents();let e=this.domElement.getRootNode();e.removeEventListener(`keydown`,this._interceptControlDown,{capture:!0}),e.removeEventListener(`keyup`,this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction=``,this.domElement.style.cursor=`auto`}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(we),this.update(),this.state=z.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;L.copy(t).sub(this.target),L.applyQuaternion(this._quat),this._spherical.setFromVector3(L),this.autoRotate&&this.state===z.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(n)&&isFinite(r)&&(n<-Math.PI?n+=R:n>Math.PI&&(n-=R),r<-Math.PI?r+=R:r>Math.PI&&(r-=R),n<=r?this._spherical.theta=Math.max(n,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+r)/2?Math.max(n,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let i=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let e=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),i=e!=this._spherical.radius}if(L.setFromSpherical(this._spherical),L.applyQuaternion(this._quatInverse),t.copy(this.target).add(L),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let e=null;if(this.object.isPerspectiveCamera){let t=L.length();e=this._clampDistance(t*this._scale);let n=t-e;this.object.position.addScaledVector(this._dollyDirection,n),this.object.updateMatrixWorld(),i=!!n}else if(this.object.isOrthographicCamera){let t=new T(this._mouse.x,this._mouse.y,0);t.unproject(this.object);let n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),i=n!==this.object.zoom;let r=new T(this._mouse.x,this._mouse.y,0);r.unproject(this.object),this.object.position.sub(r).add(t),this.object.updateMatrixWorld(),e=L.length()}else console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.`),this.zoomToCursor=!1;e!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(e).add(this.object.position):(I.origin.copy(this.object.position),I.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(I.direction))<Ee?this.object.lookAt(this.target):(Te.setFromNormalAndCoplanarPoint(this.object.up,this.target),I.intersectPlane(Te,this.target))))}else if(this.object.isOrthographicCamera){let e=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),e!==this.object.zoom&&(this.object.updateProjectionMatrix(),i=!0)}return this._scale=1,this._performCursorZoom=!1,i||this._lastPosition.distanceToSquared(this.object.position)>De||8*(1-this._lastQuaternion.dot(this.object.quaternion))>De||this._lastTargetPosition.distanceToSquared(this.target)>De?(this.dispatchEvent(we),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e===null?R/60/60*this.autoRotateSpeed:R/60*this.autoRotateSpeed*e}_getZoomScale(e){let t=Math.abs(e*.01);return .95**(this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){L.setFromMatrixColumn(t,0),L.multiplyScalar(-e),this._panOffset.add(L)}_panUp(e,t){this.screenSpacePanning===!0?L.setFromMatrixColumn(t,1):(L.setFromMatrixColumn(t,0),L.crossVectors(this.object.up,L)),L.multiplyScalar(e),this._panOffset.add(L)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;L.copy(r).sub(this.target);let i=L.length();i*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*i/n.clientHeight,this.object.matrix),this._panUp(2*t*i/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.`),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=n.width,o=n.height;this._mouse.x=r/a*2-1,this._mouse.y=-(i/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(R*this._rotateDelta.x/t.clientHeight),this._rotateUp(R*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(R*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-R*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(R*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-R*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(n,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(n,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyStart.set(0,i)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateEnd.set(n,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(R*this._rotateDelta.x/t.clientHeight),this._rotateUp(R*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(n,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyEnd.set(0,i),this._dollyDelta.set(0,(this._dollyEnd.y/this._dollyStart.y)**+this.zoomSpeed),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new E,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function ke(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.ownerDocument.addEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.addEventListener(`pointerup`,this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType===`touch`?this._onTouchStart(e):this._onMouseDown(e),this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grabbing`)))}function Ae(e){this.enabled!==!1&&(e.pointerType===`touch`?this._onTouchMove(e):this._onMouseMove(e))}function je(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.dispatchEvent(F),this.state=z.NONE,this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grab`);break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y})}}function Me(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case S.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=z.DOLLY;break;case S.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=z.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=z.ROTATE}break;case S.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=z.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=z.PAN}break;default:this.state=z.NONE}this.state!==z.NONE&&this.dispatchEvent(P)}function B(e){switch(this.state){case z.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case z.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case z.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e)}}function Ne(e){this.enabled!==!1&&this.enableZoom!==!1&&this.state===z.NONE&&(e.preventDefault(),this.dispatchEvent(P),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(F))}function Pe(e){this.enabled!==!1&&this._handleKeyDown(e)}function V(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case p.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=z.TOUCH_ROTATE;break;case p.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=z.TOUCH_PAN;break;default:this.state=z.NONE}break;case 2:switch(this.touches.TWO){case p.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=z.TOUCH_DOLLY_PAN;break;case p.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=z.TOUCH_DOLLY_ROTATE;break;default:this.state=z.NONE}break;default:this.state=z.NONE}this.state!==z.NONE&&this.dispatchEvent(P)}function Fe(e){switch(this._trackPointer(e),this.state){case z.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case z.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case z.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case z.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=z.NONE}}function Ie(e){this.enabled!==!1&&e.preventDefault()}function Le(e){e.key===`Control`&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}function Re(e){e.key===`Control`&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}var H={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`},U=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},ze=new k(-1,1,1,-1,0,1),Be=new class extends ae{constructor(){super(),this.setAttribute(`position`,new O([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new O([0,2,0,0,2,0],2))}},Ve=class{constructor(e){this._mesh=new j(Be,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,ze)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},He=class extends U{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof M?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=g.clone(e.uniforms),this.material=new M({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new Ve(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},W=class extends U{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},Ue=class extends U{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},We=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new E);this._width=n.width,this._height=n.height,t=new re(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:ce}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new He(H),this.copyPass.material.blending=0,this.timer=new _}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}W!==void 0&&(r instanceof W?n=!0:r instanceof Ue&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new E);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},Ge=class extends U{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new A}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},G={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new A(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`},Ke=class e extends U{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new E(256,256):new E(e.x,e.y),this.clearColor=new A(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new re(i,a,{type:ce,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new re(i,a,{type:ce,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new re(i,a,{type:ce,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=G;this.highPassUniforms=g.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new M({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new E(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new T(1,1,1),new T(1,1,1),new T(1,1,1),new T(1,1,1),new T(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=g.clone(H.uniforms),this.blendMaterial=new M({uniforms:this.copyUniforms,vertexShader:H.vertexShader,fragmentShader:H.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new A,this._oldClearAlpha=1,this._basic=new C,this._fsQuad=new Ve(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new E(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new M({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new E(.5,.5)},direction:{value:new E(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new M({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};Ke.BlurDirectionX=new E(1,0),Ke.BlurDirectionY=new E(0,1);var K={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`},qe=class extends U{constructor(){super(),this.isOutputPass=!0,this.uniforms=g.clone(K.uniforms),this.material=new y({name:K.name,uniforms:this.uniforms,vertexShader:K.vertexShader,fragmentShader:K.fragmentShader}),this._fsQuad=new Ve(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},D.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Je=o(),Ye={left:{nx:-.5,ny:0,nz:0,axis:`x`},right:{nx:.5,ny:0,nz:0,axis:`x`},bottom:{nx:0,ny:-.5,nz:0,axis:`y`},top:{nx:0,ny:.5,nz:0,axis:`y`},back:{nx:0,ny:0,nz:-.5,axis:`z`},front:{nx:0,ny:0,nz:.5,axis:`z`}},q=.01,J=new u,Xe=new T,Ze=new T,Y=new T,Qe=new T(0,1,0),X=new A,$e=new A(i.verdigris),et=new A(i.brass),tt=new f,nt=new E,rt=`
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
    vec4 mv = viewMatrix * world;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`,it=`
  uniform vec3 base;
  uniform vec3 rim;
  uniform float alpha;
  uniform float power;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float fres = pow(1.0 - abs(dot(N, V)), power);
    vec3 moon = normalize(vec3(-0.4, 0.92, 0.2));
    float spec = pow(max(dot(reflect(-moon, N), V), 0.0), 42.0);
    vec3 warm = normalize(vec3(0.7, 0.15, 0.65));
    float spec2 = pow(max(dot(reflect(-warm, N), V), 0.0), 16.0);
    vec3 col = base * 0.55;
    col += rim * fres * fres * 0.9;
    col += vec3(0.62, 0.8, 0.95) * spec * 0.55;
    col += rim * spec2 * 0.18;
    gl_FragColor = vec4(col, clamp(alpha + fres * fres * 0.62, 0.02, 0.82));
  }
`,Z=`
  varying vec3 vColor;
  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vec3 transformed = position;
    #ifdef USE_INSTANCING
      transformed = (instanceMatrix * vec4(position, 1.0)).xyz;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`,Q=`
  varying vec3 vColor;
  uniform float gain;
  void main() {
    gl_FragColor = vec4(vColor * gain, 1.0);
  }
`,$=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,at=`
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float along = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 1.35);
    float radial = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.7);
    gl_FragColor = vec4(color, along * radial * 0.28);
  }
`,ot={uniforms:{tDiffuse:{value:null}},vertexShader:`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(1.05, 0.9);
      float vig = smoothstep(0.92, 0.28, dot(uv, uv));
      vec3 rgb = c.rgb * mix(0.62, 1.0, vig);
      gl_FragColor = vec4(rgb, c.a);
    }
  `};function st(e){return e.walls.quiet.length+e.walls.shell.length+e.walls.corridor.length}function ct(e,t){return Math.max(1,e.height-1)*(1+t*n)+1}function lt(e,t){return t<0||e.y===t||e.face===`top`&&e.y===t-1}function ut(e,t,n,i,a){for(let o=0;o<t.length;o+=1){let s=t[o],c=Ye[s.face],[l,u,d]=r(s.x,s.y,s.z,i,n),f=!lt(s,a);J.position.set(l+c.nx,u+c.ny,d+c.nz),J.quaternion.identity(),f?J.scale.set(0,0,0):c.axis===`x`?J.scale.set(.04,.9,.9):c.axis===`y`?J.scale.set(.9,.04,.9):J.scale.set(.9,.9,.04),J.updateMatrix(),e.setMatrixAt(o,J.matrix)}e.instanceMatrix.needsUpdate=!0}function dt(e,t,n,r,i=!1){if(i){let e=new A(t);return new C({color:e,transparent:!0,opacity:Math.min(.62,.16+n*3),depthWrite:!1,side:2,toneMapped:!1,fog:!1})}return new M({uniforms:{base:{value:new A(e)},rim:{value:new A(t)},alpha:{value:n},power:{value:r}},vertexShader:rt,fragmentShader:it,transparent:!0,depthWrite:!1,side:2,toneMapped:!0})}function ft(e,t){let n=new xe(new ve(1,1,1),t,Math.max(1,e.length));return n.count=e.length,n.frustumCulled=!1,n.raycast=()=>void 0,n}function pt(e,t=!1){return t?new C({color:`#d7fff4`,toneMapped:!1,fog:!1}):new M({uniforms:{gain:{value:e}},vertexShader:Z,fragmentShader:Q,toneMapped:!0})}function mt(e){let t=new j(new be(.22,1.8,9.5,24,1,!0),new M({uniforms:{color:{value:new A(e)}},vertexShader:$,fragmentShader:at,transparent:!0,depthWrite:!1,blending:2,side:2,toneMapped:!1}));return t.position.y=3.4,t.frustumCulled=!1,t.raycast=()=>void 0,t}function ht(e){let n=t(e.events[0]);return n===`tool`?i.brass:n===`emotion`?i.coral:n===`stage`?i.verdigris:i.mist}function gt(e){return`${e.explode}|${e.floor}|${+!!e.shell}|${+!!e.maze}|${+!!e.tunnel}|${+!!e.path}`}function _t(e){e.traverse(e=>{let t=e;t.geometry&&!t.geometry.userData.shared&&t.geometry.dispose();let n=t.material,r=Array.isArray(n)?n:n?[n]:[];for(let e of r)e.userData.shared||e.dispose()})}var vt=(0,N.memo)(function({cubes:t,selectedId:n,selectedIds:a,view:o,stepsRef:l,playingRef:f,masterRef:p,rangeRef:g,onHud:_,onPick:v,onSelect:y,focusRef:x,autoRotate:S,onInteract:w,resetToken:T,onReady:D,onGpuLost:O}){let de=(0,N.useRef)(null),k=(0,N.useRef)({cubes:t,selectedId:n,selectedIds:a,view:o,onHud:_,onPick:v,onSelect:y,autoRotate:S,onInteract:w,resetToken:T,onReady:D,onGpuLost:O});return k.current={cubes:t,selectedId:n,selectedIds:a,view:o,onHud:_,onPick:v,onSelect:y,autoRotate:S,onInteract:w,resetToken:T,onReady:D,onGpuLost:O},(0,N.useEffect)(()=>{let t=de.current;if(!t)return;let n=/Android/i.test(navigator.userAgent)||(navigator.deviceMemory??8)<=4,a=n||/iPhone|iPad|iPod/i.test(navigator.userAgent)||window.matchMedia(`(pointer: coarse)`).matches,o=new ye({antialias:!1,powerPreference:a?`default`:`high-performance`,alpha:!1,stencil:!1,failIfMajorPerformanceCaveat:!1});o.setPixelRatio(1),o.toneMapping=4,o.toneMappingExposure=1.02,o.outputColorSpace=h,o.setClearColor(`#02060a`,1),a&&(o.debug.checkShaderErrors=!1),o.domElement.style.width=`100%`,o.domElement.style.height=`100%`,o.domElement.style.display=`block`,o.domElement.style.touchAction=`none`,o.domElement.style.opacity=`0`,t.appendChild(o.domElement);let _=new ee;_.background=new A(`#02060a`);let v=new ge(`#02060a`,.012);_.fog=v;let y=new ie(14155766,2365452,0),S=new me(12047836,0),w=new se(16773590,0);w.position.set(4,22,6),_.add(y,S,w);let T=new s(38,1,.01,800);T.position.set(11.4*q,6.2*q,13.6*q);let D=new Oe(T,o.domElement);D.enableDamping=!0,D.dampingFactor=.08,D.autoRotateSpeed=.35,D.minDistance=.04,D.maxDistance=420,D.maxPolarAngle=Math.PI*.92,D.target.set(0,-.004,0);let O=new ve(1,1,1);O.userData.shared=!0;let fe=new C({color:`#8ef3e0`,transparent:!0,opacity:.32,depthWrite:!1,side:2,fog:!1,toneMapped:!1});fe.userData.shared=!0;let N=new C({transparent:!0,opacity:0,depthWrite:!1});N.userData.shared=!0;let we=new oe({vertexColors:!0,fog:!1,toneMapped:!1});we.userData.shared=!0;let P=Array.from({length:8},()=>new E),F=new Float32Array(8),I=null,Te=null;if(n){Te=new C({color:`#07110f`,transparent:!0,opacity:.94,depthWrite:!1});let e=new j(new he(220,24),Te);e.rotation.x=-Math.PI/2,e.position.y=-.1,_.add(e)}else{I=new M({transparent:!0,depthWrite:!1,uniforms:{lamps:{value:P},gain:{value:F},reach:{value:6}},vertexShader:`
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vUv = uv;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,fragmentShader:`
          uniform vec2 lamps[8];
          uniform float gain[8];
          uniform float reach;
          varying vec2 vUv;
          varying vec3 vWorld;
          vec3 lamp(vec3 col, vec2 at, float g) {
            vec2 d = vWorld.xz - at;
            float e = exp(-dot(d, d) / max(reach * reach, 0.04)) * g;
            col += vec3(0.09, 0.28, 0.22) * e;
            col += vec3(0.28, 0.14, 0.05) * e * e;
            return min(col, vec3(0.34, 0.46, 0.42));
          }
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float disk = smoothstep(1.0, 0.12, length(p));
            vec3 col = vec3(0.018, 0.028, 0.034);
            col = lamp(col, lamps[0], gain[0]);
            col = lamp(col, lamps[1], gain[1]);
            col = lamp(col, lamps[2], gain[2]);
            col = lamp(col, lamps[3], gain[3]);
            col = lamp(col, lamps[4], gain[4]);
            col = lamp(col, lamps[5], gain[5]);
            col = lamp(col, lamps[6], gain[6]);
            col = lamp(col, lamps[7], gain[7]);
            gl_FragColor = vec4(col, disk * 0.96);
          }
        `});let e=new j(new he(220,72),I);e.rotation.x=-Math.PI/2,e.position.y=-.1,_.add(e)}let Ee=q,L=new pe(Ee*80,80,2060130,1192750),R=new pe(Ee*1200,30,2792070,1325106);for(let e of[L,R]){e.position.y=-.099;let t=Array.isArray(e.material)?e.material:[e.material];for(let n of t)n.transparent=!0,n.opacity=e===R?.42:.4,n.fog=!0,n.toneMapped=!0,n.depthWrite=!1;_.add(e)}let z=[],De=a?0:4;for(let e=0;e<De;e+=1){let e=new m(`#d7fff4`,0,40,1.05,.9,1),t=new u;e.target=t,e.castShadow=!1,_.add(e,t),z.push(e)}let ke=new ae;{let e=.5,t=[[-.5,-.5,-.5],[e,-.5,-.5],[e,-.5,e],[-.5,-.5,e],[-.5,e,-.5],[e,e,-.5],[e,e,e],[-.5,e,e]],n=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],r=new Float32Array(n.length*6),i=0;for(let[e,a]of n)r[i++]=t[e][0],r[i++]=t[e][1],r[i++]=t[e][2],r[i++]=t[a][0],r[i++]=t[a][1],r[i++]=t[a][2];ke.setAttribute(`position`,new ue(r,3))}ke.userData.shared=!0;let Ae=new oe({color:i.brass,transparent:!0,opacity:.95,toneMapped:!1,fog:!1});Ae.userData.shared=!0;let je=[],Me=e=>{for(;je.length<e.length;){let e=new Se(ke,Ae);e.frustumCulled=!1,e.raycast=()=>void 0,_.add(e),je.push(e)}je.forEach((t,n)=>{let r=e[n];if(!r){t.visible=!1;return}let i=ct(r.model,k.current.view.explode);t.visible=!0,t.position.copy(r.group.position),t.scale.set((r.model.width+.7)*q,(i+.55)*q,(r.model.depth+.7)*q)})},B=a?null:new We(o,new re(1,1,{type:ce})),Ne=B?new Ke(new E(256,256),.42,.62,.78):null;B&&Ne&&(B.addPass(new Ge(_,T)),B.addPass(Ne),B.addPass(new qe),B.addPass(new He(ot)));let Pe=()=>{let e=t.getBoundingClientRect(),r=Math.max(1,Math.round(e.width||t.clientWidth||1)),i=Math.max(1,Math.round(e.height||t.clientHeight||1));if(n||a){let e=n?1280:1600,t=Math.max(r,i);if(t>e){let n=e/t;r=Math.max(1,Math.round(r*n)),i=Math.max(1,Math.round(i*n))}}let s=r*i>12e5||a?1:r<700?1.15:1.25,c=Math.min(window.devicePixelRatio||1,s);T.aspect=(e.width||r)/Math.max(1,e.height||i),T.fov=(e.width||r)<700?50:38,T.updateProjectionMatrix(),o.setPixelRatio(c),o.setSize(r,i,!1),B&&Ne&&(B.setPixelRatio(c),B.setSize(r+2,i+2),B.setSize(r,i),Ne.strength=(e.width||r)<700?.3:.42)},V=!1,Fe=0,Ie=()=>{window.clearTimeout(Fe),Fe=window.setTimeout(()=>{if(V){if(document.visibilityState!==`visible`){Ie();return}k.current.onGpuLost?.()}},700)},Le=()=>{V=!0,Ie()},Re=()=>{V=!1,window.clearTimeout(Fe),Pe(),W=``,G=!0};o.domElement.addEventListener(`webglcontextlost`,Le),o.domElement.addEventListener(`webglcontextrestored`,Re);let H=()=>{if(document.visibilityState!==`visible`)return;let e=o.getContext();!e||e.isContextLost()||V?Ie():(Pe(),W=``,G=!0)};document.addEventListener(`visibilitychange`,H),window.addEventListener(`pageshow`,H);let U=[],ze=[],Be=``,Ve=``,W=``,Ue=``,G=!0,K=!1,Je=!1,Ye=18,rt=1,it=1,Z=0,Q=0,$=0,at=e=>{e.detail&&(_t(e.detail),e.group.remove(e.detail),e.detail=null,e.quiet=null,e.shell=null,e.tunnel=null,e.pathMesh=null,e.markerMesh=null,e.markers=[],e.enter=null,e.leave=null,e.ghost.visible=!0)},lt=e=>{at(e);let t=e.model;if(st(t)===0)return;let r=new le,a=ft(t.walls.quiet,dt(`#07141a`,`#1a4a42`,.02,2.8,n)),o=ft(t.walls.shell,dt(`#0c2420`,`#3ecfb2`,.08,2.2,n)),s=ft(t.walls.corridor,dt(`#123830`,`#7dffe8`,.22,1.7,n));r.add(a,o,s);let c=Math.max(1,t.path.length-1),l=new xe(new be(1,1,1,n?5:8,1,!0),pt(2.15,n),c);l.count=Math.max(0,t.path.length-1),l.frustumCulled=!1,l.raycast=()=>void 0,r.add(l);let u=t.path.map((e,t)=>({node:e,index:t})).filter(e=>e.node.events.length>0),f=new xe(new b(1,0),pt(2.7,n),Math.max(1,u.length));f.count=u.length,f.frustumCulled=!1,u.forEach((e,t)=>f.setColorAt(t,X.set(ht(e.node)))),f.instanceColor&&(f.instanceColor.needsUpdate=!0),r.add(f);let p=new d({color:i.verdigris,emissive:i.verdigris,emissiveIntensity:3.2,roughness:.25,metalness:.4}),m=new d({color:i.coral,emissive:i.coral,emissiveIntensity:3.2,roughness:.25,metalness:.4}),h=new _e(.46,.02,16,48),g=new _e(.3,.01,12,40),_=new le,v=new le;_.add(new j(h,p)),_.add(new j(g,new d({color:i.bone,emissive:i.verdigris,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),n||_.add(mt(i.verdigris)),v.add(new j(h.clone(),m)),v.add(new j(g.clone(),new d({color:i.bone,emissive:i.coral,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),n||v.add(mt(i.coral));for(let e of[..._.children,...v.children])e.raycast=()=>void 0;r.add(_,v),e.group.add(r),e.detail=r,e.quiet=a,e.shell=o,e.tunnel=s,e.pathMesh=l,e.markerMesh=f,e.markers=u,e.enter=_,e.leave=v,e.ghost.visible=!1},vt=e=>{let t=new le,n=new j(O,fe);n.raycast=()=>void 0;let r=new j(O,N);r.userData.cubeId=e.id;let a=Math.max(2,e.model.path.length),o=new ae;o.setAttribute(`position`,new ue(new Float32Array(a*3),3)),o.setAttribute(`color`,new ue(new Float32Array(a*3),3));let s=new Ce(o,we);s.raycast=()=>void 0;let l=new d({color:i.brass,emissive:i.brass,emissiveIntensity:2.4,roughness:.2,metalness:.35}),u=new j(new c(.16,20,20),l);u.raycast=()=>void 0;let f=new C({color:i.brass,transparent:!0,opacity:.22,depthWrite:!1,blending:2,toneMapped:!1}),p=new j(new c(.16,12,12),f);p.raycast=()=>void 0;let m=new ne({color:i.brass,transparent:!0,opacity:.8,depthWrite:!1,blending:2,toneMapped:!1}),h=new te(m);return h.scale.set(1.1,1.1,1),h.raycast=()=>void 0,u.add(h),t.add(n,r,s,u,p),_.add(t),{id:e.id,model:e.model,group:t,ghost:n,pick:r,pathLine:s,traveler:u,halo:p,detail:null,quiet:null,shell:null,tunnel:null,pathMesh:null,markerMesh:null,markers:[],enter:null,leave:null,travelerMat:l,haloMat:f,flareMat:m,slot:e.slot}},yt=()=>{for(let e of U)at(e),_t(e.group),_.remove(e.group);U=[]},bt=()=>{let e=Math.max(16*q,Ye*Math.max(rt,it)*.9);T.position.set(Z+e*.62,Q+Math.max(6*q,e*.42),$+e*.78),D.target.set(Z,Q,$),D.minDistance=.04,D.maxDistance=Math.max(8,e*40),T.far=Math.max(80,e*80),T.near=Math.max(.001,e/120),T.updateProjectionMatrix(),v.density=.045},xt=t=>{let n=e(t.model.width,t.model.height,t.model.depth,k.current.view.explode),r=Math.max(16,n*.95)*q,i=t.group.position;T.position.set(i.x+r*.62,i.y+Math.max(6*q,r*.42),i.z+r*.78),D.target.set(i.x,i.y,i.z),D.minDistance=.04,D.maxDistance=Math.max(8,r*48),T.far=Math.max(80,r*90),T.near=Math.max(.001,r/120),T.updateProjectionMatrix(),v.density=.045},St=e=>{let t=Math.min(1,Math.max(0,e||0));y.intensity=t*.85,S.intensity=t*.42,w.intensity=t*1.45,Te&&Te.color.setRGB(.015+t*.03,.03+t*.055,.028+t*.04);let n=Math.max(Ye*Math.max(rt,it),.2),r=Math.max(n*.55,.28),i=Math.max(n*.42,.16);if(z.forEach((e,n)=>{let a=n/z.length*Math.PI*2+Math.PI/4;e.position.set(Z+Math.cos(a)*i,Q+r,$+Math.sin(a)*i),e.target.position.set(Z,Q,$),e.intensity=t<=.001?0:t*1.8}),I){I.uniforms.reach.value=Math.max(n*1.8,.9);for(let e=0;e<8;e+=1){let n=z[e];if(!n||t<=.001){F[e]=0;continue}P[e].set(n.position.x,n.position.z),F[e]=t*.8}!z.length&&t>.001&&(P[0].set(Z,$),F[0]=t*.9)}},Ct=e=>{let t=1,n=1,i=1;for(let r of U)t=Math.max(t,r.model.width),i=Math.max(i,r.model.depth),n=Math.max(n,ct(r.model,e.explode));let a=t+1,o=n+1,s=i+1,c={stack:0,x:0,y:0,z:0,nx:1,ny:1,nz:1},l=[],u=new Map;for(let e of U){let t=e.slot??c;u.has(t.stack)||(u.set(t.stack,{nx:Math.max(1,t.nx||1),ny:Math.max(1,t.ny||1),nz:Math.max(1,t.nz||1)}),l.push(t.stack))}l.sort((e,t)=>e-t);let d=l.map(e=>(u.get(e).nx-1)*a+t+5),f=0,p=new Map;l.forEach((e,t)=>{p.set(e,f),f+=d[t]});let m=l.length?-(f-5)/2:0,h=1/0,g=-1/0,_=1/0,v=-1/0,y=1/0,b=-1/0;U.forEach(t=>{let n=t.slot??c,i=p.get(n.stack)??0,l=(m+i+n.x*a)*q,u=n.y*o*q,d=n.z*s*q;t.group.position.set(l,u,d),t.group.scale.setScalar(q),h=Math.min(h,l),g=Math.max(g,l),_=Math.min(_,u),v=Math.max(v,u),y=Math.min(y,d),b=Math.max(b,d);let f=ct(t.model,e.explode);t.ghost.scale.set(t.model.width,f,t.model.depth),t.pick.scale.copy(t.ghost.scale);let x=t.pathLine.geometry.getAttribute(`position`),ee=t.pathLine.geometry.getAttribute(`color`),S=Math.max(1,t.model.path.length-1),C=x.count;if(t.model.path.forEach((n,i)=>{if(i>=C)return;let[a,o,s]=r(n.x,n.y,n.z,e.explode,t.model);x.setXYZ(i,a,o,s),X.copy($e).lerp(et,S<=1?0:i/(S-1)).multiplyScalar(2.6),ee.setXYZ(i,X.r,X.g,X.b)}),x.needsUpdate=!0,ee.needsUpdate=!0,t.pathLine.visible=e.path,t.quiet&&t.shell&&t.tunnel&&t.pathMesh&&t.enter&&t.leave){let n=e.floor>=0&&e.floor>=t.model.height?-1:e.floor;ut(t.quiet,t.model.walls.quiet,t.model,e.explode,n),ut(t.shell,t.model.walls.shell,t.model,e.explode,n),ut(t.tunnel,t.model.walls.corridor,t.model,e.explode,n),t.quiet.visible=e.maze&&t.model.walls.quiet.length>0,t.shell.visible=e.shell&&t.model.walls.shell.length>0,t.tunnel.visible=e.tunnel&&t.model.walls.corridor.length>0;let i=Math.min(t.model.path.length-1,t.pathMesh.count);for(let n=0;n<i;n+=1){let a=t.model.path[n],o=t.model.path[n+1];Xe.set(...r(a.x,a.y,a.z,e.explode,t.model)),Ze.set(...r(o.x,o.y,o.z,e.explode,t.model)),Y.subVectors(Ze,Xe);let s=Y.length();J.position.copy(Xe).addScaledVector(Y,.5),J.quaternion.identity(),!e.path||s<1e-4?J.scale.set(0,0,0):(Y.multiplyScalar(1/s),J.quaternion.setFromUnitVectors(Qe,Y),J.scale.set(.072,s,.072)),J.updateMatrix(),t.pathMesh.setMatrixAt(n,J.matrix),X.copy($e).lerp(et,i<=1?0:n/(i-1)),t.pathMesh.setColorAt(n,X)}t.pathMesh.instanceMatrix.needsUpdate=!0,t.pathMesh.instanceColor&&(t.pathMesh.instanceColor.needsUpdate=!0),t.pathMesh.visible=e.path,t.markers.forEach((n,i)=>{let[a,o,s]=r(n.node.x,n.node.y,n.node.z,e.explode,t.model);J.position.set(a,o,s),J.quaternion.identity(),J.scale.setScalar(.2),J.updateMatrix(),t.markerMesh?.setMatrixAt(i,J.matrix)}),t.markerMesh&&(t.markerMesh.instanceMatrix.needsUpdate=!0);let[a,o,s]=r(t.model.entrance.x,t.model.entrance.y,t.model.entrance.z,e.explode,t.model);t.enter.position.set(a,o,s-.78);let[c,l,u]=r(t.model.exit.x,t.model.exit.y,t.model.exit.z,e.explode,t.model);t.leave.position.set(c,l,u+.78)}});let x=Number.isFinite(h)&&Number.isFinite(g),ee=x?g-h+t*q:a*q,S=x?v-_+n*q:o*q,C=x?b-y+i*q:s*q;x&&(Z=(h+g)/2,Q=(_+v)/2,$=(y+b)/2);let te=a*q,w=Math.max(1,ee/te),ne=Math.max(1,S/te,C/te);Ye=te,rt=w,it=ne,St(e.lights);let T=new Set(k.current.selectedIds),E=U.filter(e=>T.has(e.id));if(Me(E),K){if(K=!1,Je){Je=!1;let e=U.find(e=>e.id===k.current.selectedId)??U[U.length-1];e?xt(e):bt()}else bt()}},wt=()=>{let e=o.getContext();if(!e||e.isContextLost()||V||document.visibilityState===`hidden`)return;let t=k.current.cubes,r=t.map(e=>e.id).join(`|`);if(r===Be?ze.length||t.forEach(e=>{let t=U.find(t=>t.id===e.id);t&&(t.model=e.model,t.slot=e.slot)}):(yt(),ze=t.slice(),Be=r,W=``,G=!0,Je=!0,K=!1),ze.length){let e=ze.splice(0,n?1:3);for(let t of e)U.push(vt(t));G=!0;return}Je&&(K=!0,G=!0);let i=t.length<=1,a=t.map(e=>`${e.id}:${i||e.id===k.current.selectedId?st(e.model):0}`).join(`|`);if(a!==W){for(let e of U)(i||e.id===k.current.selectedId)&&st(e.model)>0?e.detail||lt(e):at(e);W=a,G=!0}},Tt=k.current.resetToken,Et=0,Dt=0,Ot=-1,kt=performance.now(),At=()=>Pe();At();let jt=new ResizeObserver(At);jt.observe(t);let Mt=()=>{x.current=null,k.current.onInteract()};D.addEventListener(`start`,Mt);let Nt=()=>{for(let e of U){if(!e.markerMesh)continue;let t=tt.intersectObject(e.markerMesh,!1)[0];if(t?.instanceId!=null&&e.markers[t.instanceId])return{id:e.id,index:e.markers[t.instanceId].index}}return null},Pt=()=>{let e=tt.intersectObjects(U.map(e=>e.pick),!1)[0]?.object.userData.cubeId;return typeof e==`string`?e:null},Ft=0,It=0,Lt=e=>{Ft=e.clientX,It=e.clientY},Rt=e=>{if(Math.hypot(e.clientX-Ft,e.clientY-It)>6)return;let t=o.domElement.getBoundingClientRect();nt.x=(e.clientX-t.left)/t.width*2-1,nt.y=-((e.clientY-t.top)/t.height)*2+1,tt.setFromCamera(nt,T);let n=Nt();if(n){k.current.onPick(n.id,n.index);return}k.current.onSelect(Pt()??``)},zt=e=>{if(a)return;let t=o.domElement.getBoundingClientRect();nt.x=(e.clientX-t.left)/t.width*2-1,nt.y=-((e.clientY-t.top)/t.height)*2+1,tt.setFromCamera(nt,T),o.domElement.style.cursor=Pt()?`pointer`:``};o.domElement.addEventListener(`pointerdown`,Lt),o.domElement.addEventListener(`pointerup`,Rt),o.domElement.addEventListener(`pointermove`,zt);let Bt=0,Vt=!1,Ht=!1,Ut=e=>{Bt=requestAnimationFrame(Ut);let t=Math.min(.05,Math.max(0,(e-kt)/1e3));kt=e,Dt+=t;let n=k.current;try{wt();let e=n.selectedIds.join(`|`);e!==Ve&&(Ve=e,G=!0);let t=gt(n.view);t!==Ue||G?(Ue=t,G=!1,Ct(n.view),Ot=n.view.lights):n.view.lights!==Ot&&(Ot=n.view.lights,St(Ot)),n.resetToken!==Tt&&(Tt=n.resetToken,Tt>0&&bt())}catch(e){Ht||(Ht=!0,console.error(e))}D.autoRotate=n.autoRotate;let i=x.current;if(i){i.age+=t;let e=U.find(e=>e.id===i.id);e&&(Xe.set(i.x,i.y,i.z).add(e.group.position),D.target.lerp(Xe,1-Math.exp(-6*t))),i.age>.85&&(x.current=null)}let a=Math.max(1,g.current.from),s=Math.max(a,g.current.to),c=p.current,u=f.current;for(let e=0;e<U.length;e+=1){let i=U[e],o=e+1,d=c&&o>=a&&o<=s||!c&&u&&i.id===n.selectedId,f=Math.max(1,i.model.path.length-1),p=l.current[i.id]??0;d&&(p+=t*28,p>=f&&(p=0),l.current[i.id]=p,i.id===n.selectedId&&(Et+=t,Et>=.08&&(Et=0,n.onHud(p))));let m=Math.max(0,Math.min(f,p)),h=Math.floor(m),g=m-h,_=i.model.path[h],v=i.model.path[Math.min(h+1,i.model.path.length-1)];if(!_||!v)continue;let y=r(_.x,_.y,_.z,n.view.explode,i.model),b=r(v.x,v.y,v.z,n.view.explode,i.model);Y.set(y[0]+(b[0]-y[0])*g,y[1]+(b[1]-y[1])*g,y[2]+(b[2]-y[2])*g),i.traveler.position.copy(Y),i.halo.position.copy(Y),i.halo.scale.setScalar(1.55+Math.sin(Dt*3.2+e)*.16);let x=ht(_.events[0]?_:v.events[0]&&g>.65?v:_);i.travelerMat.userData.hex!==x&&(i.travelerMat.userData.hex=x,i.travelerMat.color.set(x),i.travelerMat.emissive.set(x),i.flareMat.color.set(x),i.haloMat.color.set(x))}Ae.opacity=.78+Math.sin(Dt*2.4)*.18,D.update();let d=o.getContext();if(d&&!d.isContextLost())try{B?B.render(t):o.render(_,T)}catch(e){Ht||(Ht=!0,console.error(e))}Vt||(Vt=!0,o.domElement.style.opacity=`1`,k.current.onReady?.())};return Bt=requestAnimationFrame(Ut),()=>{cancelAnimationFrame(Bt),window.clearTimeout(Fe),jt.disconnect(),document.removeEventListener(`visibilitychange`,H),window.removeEventListener(`pageshow`,H),o.domElement.removeEventListener(`webglcontextlost`,Le),o.domElement.removeEventListener(`webglcontextrestored`,Re),D.removeEventListener(`start`,Mt),D.dispose(),o.domElement.removeEventListener(`pointerdown`,Lt),o.domElement.removeEventListener(`pointerup`,Rt),o.domElement.removeEventListener(`pointermove`,zt),yt(),_t(_),O.dispose(),ke.dispose(),fe.dispose(),N.dispose(),we.dispose(),Ae.dispose(),B?.dispose(),o.dispose(),o.domElement.remove()}},[x,f,p,g,l]),(0,Je.jsx)(`div`,{ref:de,className:`h-full w-full`})});export{vt as CubeCanvas};