import{a as e,i as t,n,o as r,r as i,s as a,t as o}from"./index-iiQFo-sl.js";import{A as s,B as c,C as l,D as u,E as d,F as f,G as p,H as m,J as h,K as g,L as _,M as v,N as y,O as b,P as x,R as S,S as C,T as w,U as ee,V as te,W as T,X as E,Y as D,_ as ne,a as re,b as ie,c as O,d as ae,f as k,g as oe,h as se,i as ce,j as A,k as le,l as j,m as ue,n as de,o as fe,p as pe,q as M,r as me,s as N,t as he,u as ge,v as P,w as _e,x as F,y as ve,z as ye}from"./three.module-DnEAxGRz.js";var I=a(),L={type:`change`},be={type:`start`},xe={type:`end`},R=new y,Se=new s,Ce=Math.cos(70*C.DEG2RAD),z=new D,B=2*Math.PI,V={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},H=1e-6,we=class extends j{constructor(e,t=null){super(e,t),this.state=V.NONE,this.target=new D,this.cursor=new D,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:`ArrowLeft`,UP:`ArrowUp`,RIGHT:`ArrowRight`,BOTTOM:`ArrowDown`},this.mouseButtons={LEFT:F.ROTATE,MIDDLE:F.DOLLY,RIGHT:F.PAN},this.touches={ONE:T.ROTATE,TWO:T.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle=`auto`,this._domElementKeyEvents=null,this._lastPosition=new D,this._lastQuaternion=new A,this._lastTargetPosition=new D,this._quat=new A().setFromUnitVectors(e.up,new D(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new c,this._sphericalDelta=new c,this._scale=1,this._panOffset=new D,this._rotateStart=new h,this._rotateEnd=new h,this._rotateDelta=new h,this._panStart=new h,this._panEnd=new h,this._panDelta=new h,this._dollyStart=new h,this._dollyEnd=new h,this._dollyDelta=new h,this._dollyDirection=new D,this._mouse=new h,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=U.bind(this),this._onPointerDown=Te.bind(this),this._onPointerUp=W.bind(this),this._onContextMenu=je.bind(this),this._onMouseWheel=De.bind(this),this._onKeyDown=Oe.bind(this),this._onTouchStart=ke.bind(this),this._onTouchMove=Ae.bind(this),this._onMouseDown=Ee.bind(this),this._onMouseMove=G.bind(this),this._interceptControlDown=Me.bind(this),this._interceptControlUp=K.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e===`grab`?this.domElement.style.cursor=`grab`:this.domElement.style.cursor=`auto`}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointercancel`,this._onPointerUp),this.domElement.addEventListener(`contextmenu`,this._onContextMenu),this.domElement.addEventListener(`wheel`,this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener(`keydown`,this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction=`none`}disconnect(){this.state=V.NONE,this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.removeEventListener(`pointercancel`,this._onPointerUp),this.domElement.removeEventListener(`wheel`,this._onMouseWheel),this.domElement.removeEventListener(`contextmenu`,this._onContextMenu),this.stopListenToKeyEvents();let e=this.domElement.getRootNode();e.removeEventListener(`keydown`,this._interceptControlDown,{capture:!0}),e.removeEventListener(`keyup`,this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction=``,this.domElement.style.cursor=`auto`}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(L),this.update(),this.state=V.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;z.copy(t).sub(this.target),z.applyQuaternion(this._quat),this._spherical.setFromVector3(z),this.autoRotate&&this.state===V.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(n)&&isFinite(r)&&(n<-Math.PI?n+=B:n>Math.PI&&(n-=B),r<-Math.PI?r+=B:r>Math.PI&&(r-=B),n<=r?this._spherical.theta=Math.max(n,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+r)/2?Math.max(n,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let i=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let e=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),i=e!=this._spherical.radius}if(z.setFromSpherical(this._spherical),z.applyQuaternion(this._quatInverse),t.copy(this.target).add(z),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let e=null;if(this.object.isPerspectiveCamera){let t=z.length();e=this._clampDistance(t*this._scale);let n=t-e;this.object.position.addScaledVector(this._dollyDirection,n),this.object.updateMatrixWorld(),i=!!n}else if(this.object.isOrthographicCamera){let t=new D(this._mouse.x,this._mouse.y,0);t.unproject(this.object);let n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),i=n!==this.object.zoom;let r=new D(this._mouse.x,this._mouse.y,0);r.unproject(this.object),this.object.position.sub(r).add(t),this.object.updateMatrixWorld(),e=z.length()}else console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.`),this.zoomToCursor=!1;e!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(e).add(this.object.position):(R.origin.copy(this.object.position),R.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(R.direction))<Ce?this.object.lookAt(this.target):(Se.setFromNormalAndCoplanarPoint(this.object.up,this.target),R.intersectPlane(Se,this.target))))}else if(this.object.isOrthographicCamera){let e=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),e!==this.object.zoom&&(this.object.updateProjectionMatrix(),i=!0)}return this._scale=1,this._performCursorZoom=!1,i||this._lastPosition.distanceToSquared(this.object.position)>H||8*(1-this._lastQuaternion.dot(this.object.quaternion))>H||this._lastTargetPosition.distanceToSquared(this.target)>H?(this.dispatchEvent(L),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e===null?B/60/60*this.autoRotateSpeed:B/60*this.autoRotateSpeed*e}_getZoomScale(e){let t=Math.abs(e*.01);return .95**(this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){z.setFromMatrixColumn(t,0),z.multiplyScalar(-e),this._panOffset.add(z)}_panUp(e,t){this.screenSpacePanning===!0?z.setFromMatrixColumn(t,1):(z.setFromMatrixColumn(t,0),z.crossVectors(this.object.up,z)),z.multiplyScalar(e),this._panOffset.add(z)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;z.copy(r).sub(this.target);let i=z.length();i*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*i/n.clientHeight,this.object.matrix),this._panUp(2*t*i/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.`),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=n.width,o=n.height;this._mouse.x=r/a*2-1,this._mouse.y=-(i/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(B*this._rotateDelta.x/t.clientHeight),this._rotateUp(B*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(n,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(n,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyStart.set(0,i)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateEnd.set(n,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(B*this._rotateDelta.x/t.clientHeight),this._rotateUp(B*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(n,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyEnd.set(0,i),this._dollyDelta.set(0,(this._dollyEnd.y/this._dollyStart.y)**+this.zoomSpeed),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new h,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function Te(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.ownerDocument.addEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.addEventListener(`pointerup`,this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType===`touch`?this._onTouchStart(e):this._onMouseDown(e),this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grabbing`)))}function U(e){this.enabled!==!1&&(e.pointerType===`touch`?this._onTouchMove(e):this._onMouseMove(e))}function W(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.dispatchEvent(xe),this.state=V.NONE,this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grab`);break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y})}}function Ee(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case F.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=V.DOLLY;break;case F.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=V.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=V.ROTATE}break;case F.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=V.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=V.PAN}break;default:this.state=V.NONE}this.state!==V.NONE&&this.dispatchEvent(be)}function G(e){switch(this.state){case V.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case V.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case V.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e)}}function De(e){this.enabled!==!1&&this.enableZoom!==!1&&this.state===V.NONE&&(e.preventDefault(),this.dispatchEvent(be),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(xe))}function Oe(e){this.enabled!==!1&&this._handleKeyDown(e)}function ke(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case T.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=V.TOUCH_ROTATE;break;case T.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=V.TOUCH_PAN;break;default:this.state=V.NONE}break;case 2:switch(this.touches.TWO){case T.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=V.TOUCH_DOLLY_PAN;break;case T.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=V.TOUCH_DOLLY_ROTATE;break;default:this.state=V.NONE}break;default:this.state=V.NONE}this.state!==V.NONE&&this.dispatchEvent(be)}function Ae(e){switch(this._trackPointer(e),this.state){case V.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case V.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case V.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case V.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=V.NONE}}function je(e){this.enabled!==!1&&e.preventDefault()}function Me(e){e.key===`Control`&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}function K(e){e.key===`Control`&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}var q={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`},J=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},Ne=new b(-1,1,1,-1,0,1),Pe=new class extends re{constructor(){super(),this.setAttribute(`position`,new k([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new k([0,2,0,0,2,0],2))}},Fe=class{constructor(e){this._mesh=new l(Pe,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Ne)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Ie=class extends J{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof S?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=M.clone(e.uniforms),this.material=new S({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new Fe(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Y=class extends J{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},Le=class extends J{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},Re=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new h);this._width=n.width,this._height=n.height,t=new E(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:oe}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Ie(q),this.copyPass.material.blending=0,this.timer=new p}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}Y!==void 0&&(r instanceof Y?n=!0:r instanceof Le&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new h);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},ze=class extends J{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new N}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},Be={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new N(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`},Ve=class e extends J{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new h(256,256):new h(e.x,e.y),this.clearColor=new N(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new E(i,a,{type:oe,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new E(i,a,{type:oe,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new E(i,a,{type:oe,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=Be;this.highPassUniforms=M.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new S({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new h(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new D(1,1,1),new D(1,1,1),new D(1,1,1),new D(1,1,1),new D(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=M.clone(q.uniforms),this.blendMaterial=new S({uniforms:this.copyUniforms,vertexShader:q.vertexShader,fragmentShader:q.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new N,this._oldClearAlpha=1,this._basic=new _e,this._fsQuad=new Fe(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new h(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new S({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new h(.5,.5)},direction:{value:new h(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

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

				}`})}_getCompositeMaterial(e){return new S({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

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

				}`})}};Ve.BlurDirectionX=new h(1,0),Ve.BlurDirectionY=new h(0,1);var He={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
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

		}`},Ue=class extends J{constructor(){super(),this.isOutputPass=!0,this.uniforms=M.clone(He.uniforms),this.material=new v({name:He.name,uniforms:this.uniforms,vertexShader:He.vertexShader,fragmentShader:He.fragmentShader}),this._fsQuad=new Fe(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},O.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},We=o(),Ge={left:{nx:-.5,ny:0,nz:0,axis:`x`},right:{nx:.5,ny:0,nz:0,axis:`x`},bottom:{nx:0,ny:-.5,nz:0,axis:`y`},top:{nx:0,ny:.5,nz:0,axis:`y`},back:{nx:0,ny:0,nz:-.5,axis:`z`},front:{nx:0,ny:0,nz:.5,axis:`z`}},X=new d,Z=new D,Ke=new D,Q=new D,qe=new D(0,1,0),$=new N,Je=new N(i.verdigris),Ye=new N(i.brass),Xe=new x,Ze=new h,Qe=`
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
    vec4 mv = viewMatrix * world;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`,$e=`
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
`,et=`
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
`,tt=`
  varying vec3 vColor;
  uniform float gain;
  void main() {
    gl_FragColor = vec4(vColor * gain, 1.0);
  }
`,nt=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,rt=`
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float along = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 1.35);
    float radial = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.7);
    gl_FragColor = vec4(color, along * radial * 0.28);
  }
`,it={uniforms:{tDiffuse:{value:null}},vertexShader:`
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
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 rgb = c.rgb * mix(0.62, 1.0, vig);
      rgb += (n - 0.5) * 0.016;
      gl_FragColor = vec4(rgb, c.a);
    }
  `};function at(e){return e.walls.quiet.length+e.walls.shell.length+e.walls.corridor.length}function ot(e,t){return Math.max(1,e.height-1)*(1+t*n)+1}function st(e,t){return t<0||e.y===t||e.face===`top`&&e.y===t-1}function ct(e,t,n,i,a){for(let o=0;o<t.length;o+=1){let s=t[o],c=Ge[s.face],[l,u,d]=r(s.x,s.y,s.z,i,n),f=!st(s,a);X.position.set(l+c.nx,u+c.ny,d+c.nz),X.quaternion.identity(),f?X.scale.set(0,0,0):c.axis===`x`?X.scale.set(.04,.9,.9):c.axis===`y`?X.scale.set(.9,.04,.9):X.scale.set(.9,.9,.04),X.updateMatrix(),e.setMatrixAt(o,X.matrix)}e.instanceMatrix.needsUpdate=!0}function lt(e,t,n,r){return new S({uniforms:{base:{value:new N(e)},rim:{value:new N(t)},alpha:{value:n},power:{value:r}},vertexShader:Qe,fragmentShader:$e,transparent:!0,depthWrite:!1,side:2,toneMapped:!0})}function ut(e,t){let n=new P(new me(1,1,1),t,Math.max(1,e.length));return n.count=e.length,n.frustumCulled=!1,n.raycast=()=>void 0,n}function dt(e){return new S({uniforms:{gain:{value:e}},vertexShader:et,fragmentShader:tt,toneMapped:!0})}function ft(e){let t=new l(new ge(.22,1.8,9.5,24,1,!0),new S({uniforms:{color:{value:new N(e)}},vertexShader:nt,fragmentShader:rt,transparent:!0,depthWrite:!1,blending:2,side:2,toneMapped:!1}));return t.position.y=3.4,t.frustumCulled=!1,t.raycast=()=>void 0,t}function pt(e){let n=t(e.events[0]);return n===`tool`?i.brass:n===`emotion`?i.coral:n===`stage`?i.verdigris:i.mist}function mt(e){return`${e.explode}|${e.floor}|${+!!e.shell}|${+!!e.maze}|${+!!e.tunnel}|${+!!e.path}|${e.lights}`}function ht(e){e.traverse(e=>{let t=e;t.geometry&&!t.geometry.userData.shared&&t.geometry.dispose();let n=t.material,r=Array.isArray(n)?n:n?[n]:[];for(let e of r)e.userData.shared||e.dispose()})}var gt=(0,I.memo)(function({cubes:t,selectedId:n,selectedIds:a,view:o,stepsRef:s,playingRef:c,masterRef:v,rangeRef:y,onHud:b,onPick:x,onSelect:C,focusRef:T,autoRotate:D,onInteract:O,resetToken:k,onReady:A,onGpuLost:j}){let M=(0,I.useRef)(null),F=(0,I.useRef)({cubes:t,selectedId:n,selectedIds:a,view:o,onHud:b,onPick:x,onSelect:C,autoRotate:D,onInteract:O,resetToken:k,onReady:A,onGpuLost:j});return F.current={cubes:t,selectedId:n,selectedIds:a,view:o,onHud:b,onPick:x,onSelect:C,autoRotate:D,onInteract:O,resetToken:k,onReady:A,onGpuLost:j},(0,I.useEffect)(()=>{let t=M.current;if(!t)return;let n=new he({antialias:!1,powerPreference:`high-performance`,alpha:!1,stencil:!1,failIfMajorPerformanceCaveat:!1});n.setPixelRatio(1),n.toneMapping=4,n.toneMappingExposure=1.02,n.outputColorSpace=f,n.domElement.style.width=`100%`,n.domElement.style.height=`100%`,n.domElement.style.display=`block`,n.domElement.style.touchAction=`none`,n.domElement.style.opacity=`0`,t.appendChild(n.domElement);let a=new _;a.background=new N(`#02060a`);let o=new pe(`#02060a`,.012);a.fog=o,a.add(new ne(14155766,2365452,.85)),a.add(new de(12047836,.55));let b=new ae(15201535,2.8);b.position.set(-8,18,6),a.add(b);let x=new ae(14983754,1.4);x.position.set(14,7,9),a.add(x);let C=new le(38,1,.1,900);C.position.set(11.4,6.2,13.6);let D=new we(C,n.domElement);D.enableDamping=!0,D.dampingFactor=.08,D.autoRotateSpeed=.35,D.minDistance=6,D.maxDistance=240,D.maxPolarAngle=Math.PI*.92,D.target.set(0,-.4,0);let O=new me(1,1,1);O.userData.shared=!0;let k=new w({color:`#12302c`,emissive:`#1a6b5c`,emissiveIntensity:.77,transparent:!0,opacity:.224,roughness:.18,metalness:.25,depthWrite:!1,side:2});k.userData.shared=!0;let A=new _e({transparent:!0,opacity:0,depthWrite:!1});A.userData.shared=!0;let j=new ie({vertexColors:!0});j.userData.shared=!0;let I=Array.from({length:8},()=>new h),L=new Float32Array(8),be=new S({transparent:!0,depthWrite:!1,uniforms:{lamps:{value:I},gain:{value:L}},vertexShader:`
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
        varying vec2 vUv;
        varying vec3 vWorld;
        vec3 lamp(vec3 col, vec2 at, float g) {
          vec2 d = vWorld.xz - at;
          float e = exp(-dot(d, d) / 480.0) * g;
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
      `}),xe=new l(new fe(22,64),be);xe.rotation.x=-Math.PI/2,xe.position.y=-8.55,a.add(xe);let R=new ue(28,28,1919556,1057311);R.position.y=-8.52;let Se=R.material,Ce=e=>{e.transparent=!0,e.opacity=.45};Array.isArray(Se)?Se.forEach(Ce):Ce(Se),a.add(R);let z=/Android/i.test(navigator.userAgent)||(navigator.deviceMemory??8)<=4,B=[],V=z?1:8;for(let e=0;e<V;e+=1){let e=new te(`#d7fff4`,0,64,Math.PI/7,.72,1.6),t=new d;e.target=t,e.castShadow=!1,e.visible=!0,e.intensity=0,a.add(e,t),B.push(e)}let H=new _e({color:i.brass,transparent:!0,opacity:.16,side:1,depthWrite:!1,toneMapped:!1,fog:!1});H.userData.shared=!0;let Te=new _e({color:i.brass,wireframe:!0,transparent:!0,opacity:.92,toneMapped:!1,fog:!1});Te.userData.shared=!0;let U=new P(O,H,8),W=new P(O,Te,8);U.count=0,W.count=0,U.frustumCulled=!1,W.frustumCulled=!1,U.raycast=()=>void 0,W.raycast=()=>void 0,a.add(U,W);let Ee=e=>{if(U.instanceMatrix.count>=e){U.count=e,W.count=e;return}let t=Math.max(e,U.instanceMatrix.count*2);a.remove(U,W),U=new P(O,H,t),W=new P(O,Te,t),U.frustumCulled=!1,W.frustumCulled=!1,U.raycast=()=>void 0,W.raycast=()=>void 0,U.count=e,W.count=e,a.add(U,W)},G=z?null:new Re(n,new E(1,1,{type:oe})),De=G?new Ve(new h(256,256),.42,.62,.78):null;G&&De&&(G.addPass(new ze(a,C)),G.addPass(De),G.addPass(new Ue),G.addPass(new Ie(it)));let Oe=()=>{let e=t.getBoundingClientRect(),r=Math.max(1,Math.round(e.width||t.clientWidth||1)),i=Math.max(1,Math.round(e.height||t.clientHeight||1));if(z){let e=Math.max(r,i);if(e>1280){let t=1280/e;r=Math.max(1,Math.round(r*t)),i=Math.max(1,Math.round(i*t))}}let a=r*i>12e5||z?1:r<700?1.15:1.25,o=Math.min(window.devicePixelRatio||1,a);C.aspect=(e.width||r)/Math.max(1,e.height||i),C.fov=(e.width||r)<700?50:38,C.updateProjectionMatrix(),n.setPixelRatio(o),n.setSize(r,i,!1),G&&De&&(G.setPixelRatio(o),G.setSize(r+2,i+2),G.setSize(r,i),De.strength=(e.width||r)<700?.3:.42)},ke=!1,Ae=()=>{ke=!0},je=()=>{ke=!1,Oe(),Pe=``,Y=!0};n.domElement.addEventListener(`webglcontextlost`,Ae),n.domElement.addEventListener(`webglcontextrestored`,je);let Me=()=>{document.visibilityState===`visible`&&window.setTimeout(()=>{let e=n.getContext();!e||e.isContextLost()||ke?F.current.onGpuLost?.():(Oe(),Pe=``,Y=!0)},60)};document.addEventListener(`visibilitychange`,Me),window.addEventListener(`pageshow`,Me);let K=[],q=[],J=``,Ne=``,Pe=``,Fe=``,Y=!0,Le=!1,Be=!1,He=18,We=1,Ge=1,Qe=0,$e=0,et=0,tt=e=>{e.detail&&(ht(e.detail),e.group.remove(e.detail),e.detail=null,e.quiet=null,e.shell=null,e.tunnel=null,e.pathMesh=null,e.markerMesh=null,e.markers=[],e.enter=null,e.leave=null,e.ghost.visible=!0)},nt=e=>{tt(e);let t=e.model;if(at(t)===0)return;let n=new se,r=ut(t.walls.quiet,lt(`#07141a`,`#1a4a42`,.02,2.8)),a=ut(t.walls.shell,lt(`#0c2420`,`#3ecfb2`,.08,2.2)),o=ut(t.walls.corridor,lt(`#123830`,`#7dffe8`,.22,1.7));n.add(r,a,o);let s=Math.max(1,t.path.length-1),c=new P(new ge(1,1,1,8,1,!0),dt(2.15),s);c.count=Math.max(0,t.path.length-1),c.frustumCulled=!1,c.raycast=()=>void 0,n.add(c);let d=t.path.map((e,t)=>({node:e,index:t})).filter(e=>e.node.events.length>0),f=new P(new u(1,0),dt(2.7),Math.max(1,d.length));f.count=d.length,f.frustumCulled=!1,d.forEach((e,t)=>f.setColorAt(t,$.set(pt(e.node)))),f.instanceColor&&(f.instanceColor.needsUpdate=!0),n.add(f);let p=new w({color:i.verdigris,emissive:i.verdigris,emissiveIntensity:3.2,roughness:.25,metalness:.4}),m=new w({color:i.coral,emissive:i.coral,emissiveIntensity:3.2,roughness:.25,metalness:.4}),h=new g(.46,.02,16,48),_=new g(.3,.01,12,40),v=new se,y=new se;v.add(new l(h,p)),v.add(new l(_,new w({color:i.bone,emissive:i.verdigris,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),v.add(ft(i.verdigris)),y.add(new l(h.clone(),m)),y.add(new l(_.clone(),new w({color:i.bone,emissive:i.coral,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),y.add(ft(i.coral));for(let e of[...v.children,...y.children])e.raycast=()=>void 0;n.add(v,y),e.group.add(n),e.detail=n,e.quiet=r,e.shell=a,e.tunnel=o,e.pathMesh=c,e.markerMesh=f,e.markers=d,e.enter=v,e.leave=y,e.ghost.visible=!1},rt=e=>{let t=new se,n=new l(O,k);n.raycast=()=>void 0;let r=new l(O,A);r.userData.cubeId=e.id;let o=Math.max(2,e.model.path.length),s=new re;s.setAttribute(`position`,new ce(new Float32Array(o*3),3)),s.setAttribute(`color`,new ce(new Float32Array(o*3),3));let c=new ve(s,j);c.raycast=()=>void 0;let u=new w({color:i.brass,emissive:i.brass,emissiveIntensity:2.4,roughness:.2,metalness:.35}),d=new l(new ye(.16,20,20),u);d.raycast=()=>void 0;let f=new _e({color:i.brass,transparent:!0,opacity:.22,depthWrite:!1,blending:2,toneMapped:!1}),p=new l(new ye(.16,12,12),f);p.raycast=()=>void 0;let h=new ee({color:i.brass,transparent:!0,opacity:.8,depthWrite:!1,blending:2,toneMapped:!1}),g=new m(h);return g.scale.set(1.1,1.1,1),g.raycast=()=>void 0,d.add(g),t.add(n,r,c,d,p),a.add(t),{id:e.id,model:e.model,group:t,ghost:n,pick:r,pathLine:c,traveler:d,halo:p,detail:null,quiet:null,shell:null,tunnel:null,pathMesh:null,markerMesh:null,markers:[],enter:null,leave:null,travelerMat:u,haloMat:f,flareMat:h,slot:e.slot}},st=()=>{for(let e of K)tt(e),ht(e.group),a.remove(e.group);K=[]},gt=()=>{let e=Math.max(16,He*Math.max(We,Ge)*.9);C.position.set(Qe+e*.62,$e+Math.max(6,e*.42),et+e*.78),D.target.set(Qe,$e,et),D.maxDistance=Math.max(80,e*6),C.far=Math.max(900,e*14),C.near=Math.min(.1,Math.max(.05,e/5e3)),C.updateProjectionMatrix(),o.density=1.15/Math.max(28,e)},_t=t=>{let n=e(t.model.width,t.model.height,t.model.depth,F.current.view.explode),r=Math.max(16,n*.95),i=t.group.position;C.position.set(i.x+r*.62,i.y+Math.max(6,r*.42),i.z+r*.78),D.target.set(i.x,i.y,i.z),D.maxDistance=Math.max(80,r*8),C.far=Math.max(900,r*20),C.near=.1,C.updateProjectionMatrix(),o.density=1.15/Math.max(28,r)},vt=t=>{let n=K.map(n=>e(n.model.width,n.model.height,n.model.depth,t.explode)),i=8;for(let e of n)e>i&&(i=e);let a=i+.65,o=i*.9,s={stack:0,x:0,y:0,z:0,nx:1,ny:1,nz:1},c=[],l=new Map;for(let e of K){let t=e.slot??s;l.has(t.stack)||(l.set(t.stack,{nx:Math.max(1,t.nx||1),ny:Math.max(1,t.ny||1),nz:Math.max(1,t.nz||1)}),c.push(t.stack))}c.sort((e,t)=>e-t);let u=c.map(e=>l.get(e).nx*a),d=0,f=new Map;c.forEach((e,t)=>{f.set(e,d),d+=u[t]+o});let p=c.length?-(d-o)/2:0,m=1/0,h=-1/0,g=1/0,_=-1/0,v=1/0,y=-1/0;K.forEach(e=>{let n=e.slot??s,i=f.get(n.stack)??0,o=p+i+n.x*a,c=n.y*a,l=n.z*a;e.group.position.set(o,c,l),m=Math.min(m,o),h=Math.max(h,o),g=Math.min(g,c),_=Math.max(_,c),v=Math.min(v,l),y=Math.max(y,l);let u=ot(e.model,t.explode);e.ghost.scale.set(e.model.width,u,e.model.depth),e.pick.scale.copy(e.ghost.scale);let d=e.pathLine.geometry.getAttribute(`position`),b=e.pathLine.geometry.getAttribute(`color`),x=Math.max(1,e.model.path.length-1),S=d.count;if(e.model.path.forEach((n,i)=>{if(i>=S)return;let[a,o,s]=r(n.x,n.y,n.z,t.explode,e.model);d.setXYZ(i,a,o,s),$.copy(Je).lerp(Ye,x<=1?0:i/(x-1)),b.setXYZ(i,$.r,$.g,$.b)}),d.needsUpdate=!0,b.needsUpdate=!0,e.pathLine.visible=t.path,e.quiet&&e.shell&&e.tunnel&&e.pathMesh&&e.enter&&e.leave){let n=t.floor>=0&&t.floor>=e.model.height?-1:t.floor;ct(e.quiet,e.model.walls.quiet,e.model,t.explode,n),ct(e.shell,e.model.walls.shell,e.model,t.explode,n),ct(e.tunnel,e.model.walls.corridor,e.model,t.explode,n),e.quiet.visible=t.maze&&e.model.walls.quiet.length>0,e.shell.visible=t.shell&&e.model.walls.shell.length>0,e.tunnel.visible=t.tunnel&&e.model.walls.corridor.length>0;let i=Math.min(e.model.path.length-1,e.pathMesh.count);for(let n=0;n<i;n+=1){let a=e.model.path[n],o=e.model.path[n+1];Z.set(...r(a.x,a.y,a.z,t.explode,e.model)),Ke.set(...r(o.x,o.y,o.z,t.explode,e.model)),Q.subVectors(Ke,Z);let s=Q.length();X.position.copy(Z).addScaledVector(Q,.5),X.quaternion.identity(),!t.path||s<1e-4?X.scale.set(0,0,0):(Q.multiplyScalar(1/s),X.quaternion.setFromUnitVectors(qe,Q),X.scale.set(.072,s,.072)),X.updateMatrix(),e.pathMesh.setMatrixAt(n,X.matrix),$.copy(Je).lerp(Ye,i<=1?0:n/(i-1)),e.pathMesh.setColorAt(n,$)}e.pathMesh.instanceMatrix.needsUpdate=!0,e.pathMesh.instanceColor&&(e.pathMesh.instanceColor.needsUpdate=!0),e.pathMesh.visible=t.path,e.markers.forEach((n,i)=>{let[a,o,s]=r(n.node.x,n.node.y,n.node.z,t.explode,e.model);X.position.set(a,o,s),X.quaternion.identity(),X.scale.setScalar(.2),X.updateMatrix(),e.markerMesh?.setMatrixAt(i,X.matrix)}),e.markerMesh&&(e.markerMesh.instanceMatrix.needsUpdate=!0);let[a,o,s]=r(e.model.entrance.x,e.model.entrance.y,e.model.entrance.z,t.explode,e.model);e.enter.position.set(a,o,s-.78);let[c,l,u]=r(e.model.exit.x,e.model.exit.y,e.model.exit.z,t.explode,e.model);e.leave.position.set(c,l,u+.78)}});let b=Number.isFinite(m)&&Number.isFinite(h),x=b?h-m+i:a,S=b?_-g+i:a,C=b?y-v+i:a;b&&(Qe=(m+h)/2,$e=(g+_)/2,et=(v+y)/2);let w=a,ee=Math.max(1,x/w),te=Math.max(1,S/w,C/w);He=w,We=ee,Ge=te;let T=new Map;for(let e of K){let t=Math.round(e.group.position.x/20),n=Math.round(e.group.position.z/20),r=`${t}:${n}`,i=T.get(r)??{x:t*20,z:n*20,n:0};i.n+=1,T.set(r,i)}let E=[...T.values()].sort((e,t)=>t.n-e.n||e.x*e.x+e.z*e.z-(t.x*t.x+t.z*t.z)).slice(0,8),D=Math.min(1,Math.max(0,t.lights||0)),ne=E.length>1?1/Math.sqrt(E.length):1,re=D*6.5*ne,ie=K.find(e=>e.id===F.current.selectedId)??K[0];for(let e=0;e<8;e+=1){let t=E[e];if(!t||D<=.001){L[e]=0;continue}I[e].set(t.x,t.z),L[e]=D*ne*.85}B.forEach((e,t)=>{let n=z&&ie?{x:ie.group.position.x,z:ie.group.position.z}:E[t];if(e.visible=!0,!n||D<=.001){e.intensity=0;return}e.intensity=re,e.position.set(n.x,24,n.z),e.target.position.set(n.x,-8.5,n.z)}),be.uniforms.gain.value=L;let O=w*Math.hypot(ee,te)*.62+10;xe.scale.setScalar(Math.max(1,O/22)),R.scale.setScalar(Math.max(1,O/18));let ae=new Set(F.current.selectedIds),k=K.filter(e=>ae.has(e.id));if(Ee(k.length),k.forEach((e,n)=>{let r=ot(e.model,t.explode);X.position.copy(e.group.position),X.quaternion.identity(),X.scale.set(e.model.width+.85,r+.7,e.model.depth+.85),X.updateMatrix(),U.setMatrixAt(n,X.matrix),X.scale.set(e.model.width+1.02,r+.88,e.model.depth+1.02),X.updateMatrix(),W.setMatrixAt(n,X.matrix)}),k.length&&(U.instanceMatrix.needsUpdate=!0,W.instanceMatrix.needsUpdate=!0),Le){if(Le=!1,Be){Be=!1;let e=K.find(e=>e.id===F.current.selectedId)??K[K.length-1];e?_t(e):gt()}else gt()}},yt=()=>{let e=n.getContext();if(!e||e.isContextLost()||ke||document.visibilityState===`hidden`)return;let t=F.current.cubes,r=t.map(e=>e.id).join(`|`);if(r===J?q.length||t.forEach(e=>{let t=K.find(t=>t.id===e.id);t&&(t.model=e.model,t.slot=e.slot)}):(st(),q=t.slice(),J=r,Pe=``,Y=!0,Be=!0,Le=!1),q.length){let e=q.splice(0,3);for(let t of e)K.push(rt(t));Y=!0;return}Be&&(Le=!0,Y=!0);let i=t.length<=1,a=t.map(e=>`${e.id}:${i||e.id===F.current.selectedId?at(e.model):0}`).join(`|`);if(a!==Pe){for(let e of K)(i||e.id===F.current.selectedId)&&at(e.model)>0?e.detail||nt(e):tt(e);Pe=a,Y=!0}},bt=F.current.resetToken,xt=0,St=0,Ct=new p,wt=()=>Oe();wt();let Tt=new ResizeObserver(wt);Tt.observe(t);let Et=()=>{T.current=null,F.current.onInteract()};D.addEventListener(`start`,Et);let Dt=()=>{for(let e of K){if(!e.markerMesh)continue;let t=Xe.intersectObject(e.markerMesh,!1)[0];if(t?.instanceId!=null&&e.markers[t.instanceId])return{id:e.id,index:e.markers[t.instanceId].index}}return null},Ot=()=>{let e=Xe.intersectObjects(K.map(e=>e.pick),!1)[0]?.object.userData.cubeId;return typeof e==`string`?e:null},kt=0,At=0,jt=e=>{kt=e.clientX,At=e.clientY},Mt=e=>{if(Math.hypot(e.clientX-kt,e.clientY-At)>6)return;let t=n.domElement.getBoundingClientRect();Ze.x=(e.clientX-t.left)/t.width*2-1,Ze.y=-((e.clientY-t.top)/t.height)*2+1,Xe.setFromCamera(Ze,C);let r=Dt();if(r){F.current.onPick(r.id,r.index);return}F.current.onSelect(Ot()??``)},Nt=e=>{let t=n.domElement.getBoundingClientRect();Ze.x=(e.clientX-t.left)/t.width*2-1,Ze.y=-((e.clientY-t.top)/t.height)*2+1,Xe.setFromCamera(Ze,C),n.domElement.style.cursor=Dt()||Ot()?`pointer`:``};n.domElement.addEventListener(`pointerdown`,jt),n.domElement.addEventListener(`pointerup`,Mt),n.domElement.addEventListener(`pointermove`,Nt);let Pt=0,Ft=!1,It=!1,Lt=e=>{Pt=requestAnimationFrame(Lt);try{Ct.update(e);let t=Math.min(Ct.getDelta(),.05);St+=t;let i=F.current;yt();let o=i.selectedIds.join(`|`);o!==Ne&&(Ne=o,Y=!0);let l=mt(i.view);(l!==Fe||Y)&&(Fe=l,Y=!1,vt(i.view)),i.resetToken!==bt&&(bt=i.resetToken,bt>0&&gt()),D.autoRotate=i.autoRotate;let u=T.current;if(u){u.age+=t;let e=K.find(e=>e.id===u.id);e&&(Z.set(u.x,u.y,u.z).add(e.group.position),D.target.lerp(Z,1-Math.exp(-6*t))),u.age>.85&&(T.current=null)}let d=Math.max(1,y.current.from),f=Math.max(d,y.current.to),p=v.current;K.forEach((e,n)=>{let a=n+1,o=p&&a>=d&&a<=f||!p&&c.current&&e.id===i.selectedId,l=Math.max(1,e.model.path.length-1),u=s.current[e.id]??0;o&&(u+=t*28,u>=l&&(u=0),s.current[e.id]=u,e.id===i.selectedId&&(xt+=t,xt>=.08&&(xt=0,i.onHud(u))));let m=Math.max(0,Math.min(l,u)),h=Math.floor(m),g=m-h,_=e.model.path[h],v=e.model.path[Math.min(h+1,e.model.path.length-1)];if(!_||!v)return;Z.set(...r(_.x,_.y,_.z,i.view.explode,e.model)),Ke.set(...r(v.x,v.y,v.z,i.view.explode,e.model)),Q.copy(Z).lerp(Ke,g),e.traveler.position.copy(Q),e.halo.position.copy(Q);let y=1.55+Math.sin(St*3.2+n)*.16;e.halo.scale.setScalar(y);let b=pt(_.events[0]?_:v.events[0]&&g>.65?v:_);e.travelerMat.color.set(b),e.travelerMat.emissive.set(b),e.flareMat.color.set(b),e.haloMat.color.set(b)}),H.opacity=.12+Math.sin(St*2.4)*.05,D.update();try{let e=n.getContext();if(!e||e.isContextLost())return;G?G.render(t):n.render(a,C)}catch{let e=n.getContext();e&&!e.isContextLost()&&n.render(a,C)}Ft||(Ft=!0,n.domElement.style.opacity=`1`,F.current.onReady?.())}catch(e){It||(It=!0,console.error(e))}};return Pt=requestAnimationFrame(Lt),()=>{cancelAnimationFrame(Pt),Tt.disconnect(),document.removeEventListener(`visibilitychange`,Me),window.removeEventListener(`pageshow`,Me),n.domElement.removeEventListener(`webglcontextlost`,Ae),n.domElement.removeEventListener(`webglcontextrestored`,je),D.removeEventListener(`start`,Et),D.dispose(),n.domElement.removeEventListener(`pointerdown`,jt),n.domElement.removeEventListener(`pointerup`,Mt),n.domElement.removeEventListener(`pointermove`,Nt),st(),ht(a),O.dispose(),k.dispose(),A.dispose(),j.dispose(),G?.dispose(),n.dispose(),n.domElement.remove()}},[T,c,v,y,s]),(0,We.jsx)(`div`,{ref:M,className:`h-full w-full`})});export{gt as CubeCanvas};