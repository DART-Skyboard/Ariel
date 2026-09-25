import{a as e,i as t,n,o as r,r as i,s as a,t as o}from"./index-HZWEMrEe.js";import{A as s,B as c,C as l,D as u,E as d,F as f,G as p,H as m,I as h,J as g,K as _,M as v,N as y,O as b,P as x,Q as S,R as ee,S as C,T as w,U as te,V as T,W as ne,X as E,Y as re,Z as D,_ as ie,a as ae,b as oe,c as O,d as se,f as ce,g as le,h as ue,i as de,j as fe,k as pe,l as k,m as me,n as he,o as ge,p as _e,q as ve,r as ye,s as A,t as be,u as xe,v as j,w as Se,x as M,y as Ce,z as N}from"./three.module-ZBrg91hy.js";var P=a(),F={type:`change`},I={type:`start`},we={type:`end`},L=new x,R=new s,Te=Math.cos(70*C.DEG2RAD),z=new D,B=2*Math.PI,V={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},H=1e-6,Ee=class extends k{constructor(e,t=null){super(e,t),this.state=V.NONE,this.target=new D,this.cursor=new D,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:`ArrowLeft`,UP:`ArrowUp`,RIGHT:`ArrowRight`,BOTTOM:`ArrowDown`},this.mouseButtons={LEFT:M.ROTATE,MIDDLE:M.DOLLY,RIGHT:M.PAN},this.touches={ONE:p.ROTATE,TWO:p.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle=`auto`,this._domElementKeyEvents=null,this._lastPosition=new D,this._lastQuaternion=new v,this._lastTargetPosition=new D,this._quat=new v().setFromUnitVectors(e.up,new D(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new T,this._sphericalDelta=new T,this._scale=1,this._panOffset=new D,this._rotateStart=new E,this._rotateEnd=new E,this._rotateDelta=new E,this._panStart=new E,this._panEnd=new E,this._panDelta=new E,this._dollyStart=new E,this._dollyEnd=new E,this._dollyDelta=new E,this._dollyDirection=new D,this._mouse=new E,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=De.bind(this),this._onPointerDown=U.bind(this),this._onPointerUp=Oe.bind(this),this._onContextMenu=Ne.bind(this),this._onMouseWheel=G.bind(this),this._onKeyDown=Ae.bind(this),this._onTouchStart=je.bind(this),this._onTouchMove=Me.bind(this),this._onMouseDown=W.bind(this),this._onMouseMove=ke.bind(this),this._interceptControlDown=K.bind(this),this._interceptControlUp=Pe.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e===`grab`?this.domElement.style.cursor=`grab`:this.domElement.style.cursor=`auto`}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointercancel`,this._onPointerUp),this.domElement.addEventListener(`contextmenu`,this._onContextMenu),this.domElement.addEventListener(`wheel`,this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener(`keydown`,this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction=`none`}disconnect(){this.state=V.NONE,this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.removeEventListener(`pointercancel`,this._onPointerUp),this.domElement.removeEventListener(`wheel`,this._onMouseWheel),this.domElement.removeEventListener(`contextmenu`,this._onContextMenu),this.stopListenToKeyEvents();let e=this.domElement.getRootNode();e.removeEventListener(`keydown`,this._interceptControlDown,{capture:!0}),e.removeEventListener(`keyup`,this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction=``,this.domElement.style.cursor=`auto`}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(F),this.update(),this.state=V.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;z.copy(t).sub(this.target),z.applyQuaternion(this._quat),this._spherical.setFromVector3(z),this.autoRotate&&this.state===V.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(n)&&isFinite(r)&&(n<-Math.PI?n+=B:n>Math.PI&&(n-=B),r<-Math.PI?r+=B:r>Math.PI&&(r-=B),n<=r?this._spherical.theta=Math.max(n,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+r)/2?Math.max(n,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let i=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let e=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),i=e!=this._spherical.radius}if(z.setFromSpherical(this._spherical),z.applyQuaternion(this._quatInverse),t.copy(this.target).add(z),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let e=null;if(this.object.isPerspectiveCamera){let t=z.length();e=this._clampDistance(t*this._scale);let n=t-e;this.object.position.addScaledVector(this._dollyDirection,n),this.object.updateMatrixWorld(),i=!!n}else if(this.object.isOrthographicCamera){let t=new D(this._mouse.x,this._mouse.y,0);t.unproject(this.object);let n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),i=n!==this.object.zoom;let r=new D(this._mouse.x,this._mouse.y,0);r.unproject(this.object),this.object.position.sub(r).add(t),this.object.updateMatrixWorld(),e=z.length()}else console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.`),this.zoomToCursor=!1;e!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(e).add(this.object.position):(L.origin.copy(this.object.position),L.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(L.direction))<Te?this.object.lookAt(this.target):(R.setFromNormalAndCoplanarPoint(this.object.up,this.target),L.intersectPlane(R,this.target))))}else if(this.object.isOrthographicCamera){let e=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),e!==this.object.zoom&&(this.object.updateProjectionMatrix(),i=!0)}return this._scale=1,this._performCursorZoom=!1,i||this._lastPosition.distanceToSquared(this.object.position)>H||8*(1-this._lastQuaternion.dot(this.object.quaternion))>H||this._lastTargetPosition.distanceToSquared(this.target)>H?(this.dispatchEvent(F),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e===null?B/60/60*this.autoRotateSpeed:B/60*this.autoRotateSpeed*e}_getZoomScale(e){let t=Math.abs(e*.01);return .95**(this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){z.setFromMatrixColumn(t,0),z.multiplyScalar(-e),this._panOffset.add(z)}_panUp(e,t){this.screenSpacePanning===!0?z.setFromMatrixColumn(t,1):(z.setFromMatrixColumn(t,0),z.crossVectors(this.object.up,z)),z.multiplyScalar(e),this._panOffset.add(z)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;z.copy(r).sub(this.target);let i=z.length();i*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*i/n.clientHeight,this.object.matrix),this._panUp(2*t*i/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.`),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=n.width,o=n.height;this._mouse.x=r/a*2-1,this._mouse.y=-(i/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(B*this._rotateDelta.x/t.clientHeight),this._rotateUp(B*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-B*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(n,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(n,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyStart.set(0,i)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateEnd.set(n,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(B*this._rotateDelta.x/t.clientHeight),this._rotateUp(B*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(n,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyEnd.set(0,i),this._dollyDelta.set(0,(this._dollyEnd.y/this._dollyStart.y)**+this.zoomSpeed),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new E,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function U(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.ownerDocument.addEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.addEventListener(`pointerup`,this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType===`touch`?this._onTouchStart(e):this._onMouseDown(e),this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grabbing`)))}function De(e){this.enabled!==!1&&(e.pointerType===`touch`?this._onTouchMove(e):this._onMouseMove(e))}function Oe(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.dispatchEvent(we),this.state=V.NONE,this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grab`);break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y})}}function W(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case M.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=V.DOLLY;break;case M.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=V.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=V.ROTATE}break;case M.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=V.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=V.PAN}break;default:this.state=V.NONE}this.state!==V.NONE&&this.dispatchEvent(I)}function ke(e){switch(this.state){case V.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case V.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case V.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e)}}function G(e){this.enabled!==!1&&this.enableZoom!==!1&&this.state===V.NONE&&(e.preventDefault(),this.dispatchEvent(I),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(we))}function Ae(e){this.enabled!==!1&&this._handleKeyDown(e)}function je(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case p.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=V.TOUCH_ROTATE;break;case p.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=V.TOUCH_PAN;break;default:this.state=V.NONE}break;case 2:switch(this.touches.TWO){case p.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=V.TOUCH_DOLLY_PAN;break;case p.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=V.TOUCH_DOLLY_ROTATE;break;default:this.state=V.NONE}break;default:this.state=V.NONE}this.state!==V.NONE&&this.dispatchEvent(I)}function Me(e){switch(this._trackPointer(e),this.state){case V.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case V.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case V.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case V.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=V.NONE}}function Ne(e){this.enabled!==!1&&e.preventDefault()}function K(e){e.key===`Control`&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}function Pe(e){e.key===`Control`&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}var q={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`},J=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},Fe=new b(-1,1,1,-1,0,1),Ie=new class extends ae{constructor(){super(),this.setAttribute(`position`,new ce([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new ce([0,2,0,0,2,0],2))}},Y=class{constructor(e){this._mesh=new l(Ie,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Fe)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Le=class extends J{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof N?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=g.clone(e.uniforms),this.material=new N({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new Y(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Re=class extends J{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},ze=class extends J{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},Be=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new E);this._width=n.width,this._height=n.height,t=new S(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:le}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Le(q),this.copyPass.material.blending=0,this.timer=new _}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}Re!==void 0&&(r instanceof Re?n=!0:r instanceof ze&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new E);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},Ve=class extends J{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new A}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},He={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new A(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`},Ue=class e extends J{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new E(256,256):new E(e.x,e.y),this.clearColor=new A(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new S(i,a,{type:le,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new S(i,a,{type:le,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new S(i,a,{type:le,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=He;this.highPassUniforms=g.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new N({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new E(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new D(1,1,1),new D(1,1,1),new D(1,1,1),new D(1,1,1),new D(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=g.clone(q.uniforms),this.blendMaterial=new N({uniforms:this.copyUniforms,vertexShader:q.vertexShader,fragmentShader:q.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new A,this._oldClearAlpha=1,this._basic=new Se,this._fsQuad=new Y(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new E(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new N({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new E(.5,.5)},direction:{value:new E(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

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

				}`})}_getCompositeMaterial(e){return new N({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

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

				}`})}};Ue.BlurDirectionX=new E(1,0),Ue.BlurDirectionY=new E(0,1);var We={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
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

		}`},Ge=class extends J{constructor(){super(),this.isOutputPass=!0,this.uniforms=g.clone(We.uniforms),this.material=new y({name:We.name,uniforms:this.uniforms,vertexShader:We.vertexShader,fragmentShader:We.fragmentShader}),this._fsQuad=new Y(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},O.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Ke=o(),qe={left:{nx:-.5,ny:0,nz:0,axis:`x`},right:{nx:.5,ny:0,nz:0,axis:`x`},bottom:{nx:0,ny:-.5,nz:0,axis:`y`},top:{nx:0,ny:.5,nz:0,axis:`y`},back:{nx:0,ny:0,nz:-.5,axis:`z`},front:{nx:0,ny:0,nz:.5,axis:`z`}},X=new d,Z=new D,Je=new D,Q=new D,Ye=new D(0,1,0),$=new A,Xe=new A(i.verdigris),Ze=new A(i.brass),Qe=new f,$e=new E,et=`
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
    vec4 mv = viewMatrix * world;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`,tt=`
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
`,nt=`
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
`,rt=`
  varying vec3 vColor;
  uniform float gain;
  void main() {
    gl_FragColor = vec4(vColor * gain, 1.0);
  }
`,it=`
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
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 rgb = c.rgb * mix(0.62, 1.0, vig);
      rgb += (n - 0.5) * 0.016;
      gl_FragColor = vec4(rgb, c.a);
    }
  `};function st(e){return e.walls.quiet.length+e.walls.shell.length+e.walls.corridor.length}function ct(e,t){return Math.max(1,e.height-1)*(1+t*n)+1}function lt(e,t){return t<0||e.y===t||e.face===`top`&&e.y===t-1}function ut(e,t,n,i,a){for(let o=0;o<t.length;o+=1){let s=t[o],c=qe[s.face],[l,u,d]=r(s.x,s.y,s.z,i,n),f=!lt(s,a);X.position.set(l+c.nx,u+c.ny,d+c.nz),X.quaternion.identity(),f?X.scale.set(0,0,0):c.axis===`x`?X.scale.set(.04,.9,.9):c.axis===`y`?X.scale.set(.9,.04,.9):X.scale.set(.9,.9,.04),X.updateMatrix(),e.setMatrixAt(o,X.matrix)}e.instanceMatrix.needsUpdate=!0}function dt(e,t,n,r){return new N({uniforms:{base:{value:new A(e)},rim:{value:new A(t)},alpha:{value:n},power:{value:r}},vertexShader:et,fragmentShader:tt,transparent:!0,depthWrite:!1,side:2,toneMapped:!0})}function ft(e,t){let n=new j(new ye(1,1,1),t,Math.max(1,e.length));return n.count=e.length,n.frustumCulled=!1,n.raycast=()=>void 0,n}function pt(e){return new N({uniforms:{gain:{value:e}},vertexShader:nt,fragmentShader:rt,toneMapped:!0})}function mt(e){let t=new l(new xe(.22,1.8,9.5,24,1,!0),new N({uniforms:{color:{value:new A(e)}},vertexShader:it,fragmentShader:at,transparent:!0,depthWrite:!1,blending:2,side:2,toneMapped:!1}));return t.position.y=3.4,t.frustumCulled=!1,t.raycast=()=>void 0,t}function ht(e){let n=t(e.events[0]);return n===`tool`?i.brass:n===`emotion`?i.coral:n===`stage`?i.verdigris:i.mist}function gt(e){return`${e.explode}|${e.floor}|${+!!e.shell}|${+!!e.maze}|${+!!e.tunnel}|${+!!e.path}`}function _t(e){e.traverse(e=>{let t=e;t.geometry&&!t.geometry.userData.shared&&t.geometry.dispose();let n=t.material,r=Array.isArray(n)?n:n?[n]:[];for(let e of r)e.userData.shared||e.dispose()})}var vt=(0,P.memo)(function({cubes:t,selectedId:n,selectedIds:a,view:o,stepsRef:s,playingRef:f,masterRef:p,rangeRef:g,onHud:v,onPick:y,onSelect:b,focusRef:x,autoRotate:C,onInteract:T,resetToken:D,onReady:O}){let ce=(0,P.useRef)(null),k=(0,P.useRef)({cubes:t,selectedId:n,selectedIds:a,view:o,onHud:v,onPick:y,onSelect:b,autoRotate:C,onInteract:T,resetToken:D,onReady:O});return k.current={cubes:t,selectedId:n,selectedIds:a,view:o,onHud:v,onPick:y,onSelect:b,autoRotate:C,onInteract:T,resetToken:D,onReady:O},(0,P.useEffect)(()=>{let t=ce.current;if(!t)return;let n=new be({antialias:!1,powerPreference:`default`,alpha:!1});n.setPixelRatio(1),n.toneMapping=4,n.toneMappingExposure=1.02,n.outputColorSpace=h,n.domElement.style.width=`100%`,n.domElement.style.height=`100%`,n.domElement.style.display=`block`,n.domElement.style.touchAction=`none`,n.domElement.style.opacity=`0`,t.appendChild(n.domElement);let a=new ee;a.background=new A(`#02060a`);let o=new _e(`#02060a`,.012);a.fog=o,a.add(new ie(14155766,2365452,.85)),a.add(new he(12047836,.55));let v=new se(15201535,2.8);v.position.set(-8,18,6),a.add(v);let y=new se(14983754,1.4);y.position.set(14,7,9),a.add(y);let b=new pe(38,1,.1,900);b.position.set(11.4,6.2,13.6);let C=new Ee(b,n.domElement);C.enableDamping=!0,C.dampingFactor=.08,C.autoRotateSpeed=.35,C.minDistance=6,C.maxDistance=240,C.maxPolarAngle=Math.PI*.92,C.target.set(0,-.4,0);let T=new ye(1,1,1);T.userData.shared=!0;let D=new w({color:`#12302c`,emissive:`#1a6b5c`,emissiveIntensity:.77,transparent:!0,opacity:.224,roughness:.18,metalness:.25,depthWrite:!1,side:2});D.userData.shared=!0;let O=new Se({transparent:!0,opacity:0,depthWrite:!1});O.userData.shared=!0;let M=new oe({vertexColors:!0});M.userData.shared=!0;let P=Array.from({length:8},()=>new E),F=new Float32Array(8),I=[],we=new N({transparent:!0,depthWrite:!1,uniforms:{lamps:{value:P},gain:{value:F}},vertexShader:`
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
          float e = exp(-dot(d, d) / 420.0) * g;
          col += vec3(0.16, 0.55, 0.44) * e;
          col += vec3(0.72, 0.40, 0.12) * e * e;
          return col;
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
      `}),L=new l(new ge(22,64),we);L.rotation.x=-Math.PI/2,L.position.y=-8.55,a.add(L);let R=new me(28,28,1919556,1057311);R.position.y=-8.52;let Te=R.material,z=e=>{e.transparent=!0,e.opacity=.45};Array.isArray(Te)?Te.forEach(z):z(Te),a.add(R);let B=new Se({color:i.brass,transparent:!0,opacity:.16,side:1,depthWrite:!1,toneMapped:!1,fog:!1});B.userData.shared=!0;let V=new Se({color:i.brass,wireframe:!0,transparent:!0,opacity:.92,toneMapped:!1,fog:!1});V.userData.shared=!0;let H=new j(T,B,8),U=new j(T,V,8);H.count=0,U.count=0,H.frustumCulled=!1,U.frustumCulled=!1,H.raycast=()=>void 0,U.raycast=()=>void 0,a.add(H,U);let De=e=>{if(H.instanceMatrix.count>=e){H.count=e,U.count=e;return}let t=Math.max(e,H.instanceMatrix.count*2);a.remove(H,U),H=new j(T,B,t),U=new j(T,V,t),H.frustumCulled=!1,U.frustumCulled=!1,H.raycast=()=>void 0,U.raycast=()=>void 0,H.count=e,U.count=e,a.add(H,U)},Oe=/Android/i.test(navigator.userAgent)||(navigator.deviceMemory??8)<=4,W=new Be(n,new S(1,1,{type:Oe?re:le}));W.addPass(new Ve(a,b));let ke=new Ue(new E(256,256),.42,.62,.78);W.addPass(ke),W.addPass(new Ge),W.addPass(new Le(ot));let G=[],Ae=``,je=``,Me=``,Ne=``,K=!0,Pe=!1,q=!1,J=18,Fe=1,Ie=1,Y=0,Re=0,ze=0,He=e=>{e.detail&&(_t(e.detail),e.group.remove(e.detail),e.detail=null,e.quiet=null,e.shell=null,e.tunnel=null,e.pathMesh=null,e.markerMesh=null,e.markers=[],e.enter=null,e.leave=null,e.ghost.visible=!0)},We=e=>{He(e);let t=e.model;if(st(t)===0)return;let n=new ue,r=ft(t.walls.quiet,dt(`#07141a`,`#1a4a42`,.02,2.8)),a=ft(t.walls.shell,dt(`#0c2420`,`#3ecfb2`,.08,2.2)),o=ft(t.walls.corridor,dt(`#123830`,`#7dffe8`,.22,1.7));n.add(r,a,o);let s=Math.max(1,t.path.length-1),c=new j(new xe(1,1,1,8,1,!0),pt(2.15),s);c.count=Math.max(0,t.path.length-1),c.frustumCulled=!1,c.raycast=()=>void 0,n.add(c);let d=t.path.map((e,t)=>({node:e,index:t})).filter(e=>e.node.events.length>0),f=new j(new u(1,0),pt(2.7),Math.max(1,d.length));f.count=d.length,f.frustumCulled=!1,d.forEach((e,t)=>f.setColorAt(t,$.set(ht(e.node)))),f.instanceColor&&(f.instanceColor.needsUpdate=!0),n.add(f);let p=new w({color:i.verdigris,emissive:i.verdigris,emissiveIntensity:3.2,roughness:.25,metalness:.4}),m=new w({color:i.coral,emissive:i.coral,emissiveIntensity:3.2,roughness:.25,metalness:.4}),h=new ve(.46,.02,16,48),g=new ve(.3,.01,12,40),_=new ue,v=new ue;_.add(new l(h,p)),_.add(new l(g,new w({color:i.bone,emissive:i.verdigris,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),_.add(new fe(i.verdigris,8,6,2)),_.add(mt(i.verdigris)),v.add(new l(h.clone(),m)),v.add(new l(g.clone(),new w({color:i.bone,emissive:i.coral,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),v.add(new fe(i.coral,8,6,2)),v.add(mt(i.coral));for(let e of[..._.children,...v.children])e.raycast=()=>void 0;n.add(_,v),e.group.add(n),e.detail=n,e.quiet=r,e.shell=a,e.tunnel=o,e.pathMesh=c,e.markerMesh=f,e.markers=d,e.enter=_,e.leave=v,e.ghost.visible=!1},Ke=e=>{let t=new ue,n=new l(T,D);n.raycast=()=>void 0;let r=new l(T,O);r.userData.cubeId=e.id;let o=Math.max(2,e.model.path.length),s=new ae;s.setAttribute(`position`,new de(new Float32Array(o*3),3)),s.setAttribute(`color`,new de(new Float32Array(o*3),3));let u=new Ce(s,M);u.raycast=()=>void 0;let d=new w({color:i.brass,emissive:i.brass,emissiveIntensity:2.4,roughness:.2,metalness:.35}),f=new l(new c(.16,20,20),d);f.raycast=()=>void 0;let p=new Se({color:i.brass,transparent:!0,opacity:.22,depthWrite:!1,blending:2,toneMapped:!1}),m=new l(new c(.16,12,12),p);m.raycast=()=>void 0;let h=new ne({color:i.brass,transparent:!0,opacity:.8,depthWrite:!1,blending:2,toneMapped:!1}),g=new te(h);return g.scale.set(1.1,1.1,1),g.raycast=()=>void 0,f.add(g),t.add(n,r,u,f,m),a.add(t),{id:e.id,model:e.model,group:t,ghost:n,pick:r,pathLine:u,traveler:f,halo:m,detail:null,quiet:null,shell:null,tunnel:null,pathMesh:null,markerMesh:null,markers:[],enter:null,leave:null,travelerMat:d,haloMat:p,flareMat:h,slot:e.slot}},qe=()=>{for(let e of G)He(e),_t(e.group),a.remove(e.group);G=[]},et=()=>{let e=Math.max(16,J*Math.max(Fe,Ie)*.9);b.position.set(Y+e*.62,Re+Math.max(6,e*.42),ze+e*.78),C.target.set(Y,Re,ze),C.maxDistance=Math.max(80,e*6),b.far=Math.max(900,e*14),b.near=Math.min(.1,Math.max(.05,e/5e3)),b.updateProjectionMatrix(),o.density=1.15/Math.max(28,e)},tt=t=>{let n=e(t.model.width,t.model.height,t.model.depth,k.current.view.explode),r=Math.max(16,n*.95),i=t.group.position;b.position.set(i.x+r*.62,i.y+Math.max(6,r*.42),i.z+r*.78),C.target.set(i.x,i.y,i.z),C.maxDistance=Math.max(80,r*8),b.far=Math.max(900,r*20),b.near=.1,b.updateProjectionMatrix(),o.density=1.15/Math.max(28,r)},nt=t=>{let n=G.map(n=>e(n.model.width,n.model.height,n.model.depth,t.explode)),i=8;for(let e of n)e>i&&(i=e);let o=i+.65,s=i*.9,c={stack:0,x:0,y:0,z:0,nx:1,ny:1,nz:1},l=[],u=new Map;for(let e of G){let t=e.slot??c;u.has(t.stack)||(u.set(t.stack,{nx:Math.max(1,t.nx||1),ny:Math.max(1,t.ny||1),nz:Math.max(1,t.nz||1)}),l.push(t.stack))}l.sort((e,t)=>e-t);let f=l.map(e=>u.get(e).nx*o),p=0,h=new Map;l.forEach((e,t)=>{h.set(e,p),p+=f[t]+s});let g=l.length?-(p-s)/2:0,_=1/0,v=-1/0,y=1/0,b=-1/0,x=1/0,S=-1/0;G.forEach(e=>{let n=e.slot??c,i=h.get(n.stack)??0,a=g+i+n.x*o,s=n.y*o,l=n.z*o;e.group.position.set(a,s,l),_=Math.min(_,a),v=Math.max(v,a),y=Math.min(y,s),b=Math.max(b,s),x=Math.min(x,l),S=Math.max(S,l);let u=ct(e.model,t.explode);e.ghost.scale.set(e.model.width,u,e.model.depth),e.pick.scale.copy(e.ghost.scale);let d=e.pathLine.geometry.getAttribute(`position`),f=e.pathLine.geometry.getAttribute(`color`),p=Math.max(1,e.model.path.length-1);if(e.model.path.forEach((n,i)=>{let[a,o,s]=r(n.x,n.y,n.z,t.explode,e.model);d.setXYZ(i,a,o,s),$.copy(Xe).lerp(Ze,p<=1?0:i/(p-1)),f.setXYZ(i,$.r,$.g,$.b)}),d.needsUpdate=!0,f.needsUpdate=!0,e.pathLine.visible=t.path,e.quiet&&e.shell&&e.tunnel&&e.pathMesh&&e.enter&&e.leave){let n=t.floor>=0&&t.floor>=e.model.height?-1:t.floor;ut(e.quiet,e.model.walls.quiet,e.model,t.explode,n),ut(e.shell,e.model.walls.shell,e.model,t.explode,n),ut(e.tunnel,e.model.walls.corridor,e.model,t.explode,n),e.quiet.visible=t.maze&&e.model.walls.quiet.length>0,e.shell.visible=t.shell&&e.model.walls.shell.length>0,e.tunnel.visible=t.tunnel&&e.model.walls.corridor.length>0;let i=e.model.path.length-1;for(let n=0;n<i;n+=1){let a=e.model.path[n],o=e.model.path[n+1];Z.set(...r(a.x,a.y,a.z,t.explode,e.model)),Je.set(...r(o.x,o.y,o.z,t.explode,e.model)),Q.subVectors(Je,Z);let s=Q.length();X.position.copy(Z).addScaledVector(Q,.5),X.quaternion.identity(),!t.path||s<1e-4?X.scale.set(0,0,0):(Q.multiplyScalar(1/s),X.quaternion.setFromUnitVectors(Ye,Q),X.scale.set(.072,s,.072)),X.updateMatrix(),e.pathMesh.setMatrixAt(n,X.matrix),$.copy(Xe).lerp(Ze,i<=1?0:n/(i-1)),e.pathMesh.setColorAt(n,$)}e.pathMesh.instanceMatrix.needsUpdate=!0,e.pathMesh.instanceColor&&(e.pathMesh.instanceColor.needsUpdate=!0),e.pathMesh.visible=t.path,e.markers.forEach((n,i)=>{let[a,o,s]=r(n.node.x,n.node.y,n.node.z,t.explode,e.model);X.position.set(a,o,s),X.quaternion.identity(),X.scale.setScalar(.2),X.updateMatrix(),e.markerMesh?.setMatrixAt(i,X.matrix)}),e.markerMesh&&(e.markerMesh.instanceMatrix.needsUpdate=!0);let[a,o,s]=r(e.model.entrance.x,e.model.entrance.y,e.model.entrance.z,t.explode,e.model);e.enter.position.set(a,o,s-.78);let[c,l,u]=r(e.model.exit.x,e.model.exit.y,e.model.exit.z,t.explode,e.model);e.leave.position.set(c,l,u+.78)}});let ee=Number.isFinite(_)&&Number.isFinite(v),C=ee?v-_+i:o,w=ee?b-y+i:o,te=ee?S-x+i:o;ee&&(Y=(_+v)/2,Re=(y+b)/2,ze=(x+S)/2);let T=o,ne=Math.max(1,C/T),E=Math.max(1,w/T,te/T);J=T,Fe=ne,Ie=E;let re=new Map;for(let e of G){let t=Math.round(e.group.position.x/20),n=Math.round(e.group.position.z/20),r=`${t}:${n}`,i=re.get(r)??{x:t*20,z:n*20,n:0};i.n+=1,re.set(r,i)}let D=[...re.values()].sort((e,t)=>t.n-e.n||e.x*e.x+e.z*e.z-(t.x*t.x+t.z*t.z)).slice(0,8);for(;I.length<D.length;){let e=new m(`#e7fff6`,0,72,Math.PI/5,.55,1.15),t=new d;e.target=t,e.castShadow=!1,a.add(e,t),I.push(e)}for(let e=0;e<8;e+=1){let t=D[e],n=I[e];if(!t||!n){n&&(n.intensity=0,n.visible=!1),F[e]=0;continue}n.visible=!0,n.intensity=e===0?26:22,n.position.set(t.x,26,t.z),n.target.position.set(t.x,-8.5,t.z),P[e].set(t.x,t.z),F[e]=1}we.uniforms.gain.value=F;let ie=T*Math.hypot(ne,E)*.62+10;L.scale.setScalar(Math.max(1,ie/22)),R.scale.setScalar(Math.max(1,ie/18));let ae=new Set(k.current.selectedIds),oe=G.filter(e=>ae.has(e.id));if(De(oe.length),oe.forEach((e,n)=>{let r=ct(e.model,t.explode);X.position.copy(e.group.position),X.quaternion.identity(),X.scale.set(e.model.width+.85,r+.7,e.model.depth+.85),X.updateMatrix(),H.setMatrixAt(n,X.matrix),X.scale.set(e.model.width+1.02,r+.88,e.model.depth+1.02),X.updateMatrix(),U.setMatrixAt(n,X.matrix)}),oe.length&&(H.instanceMatrix.needsUpdate=!0,U.instanceMatrix.needsUpdate=!0),Pe){if(Pe=!1,q){q=!1;let e=G.find(e=>e.id===k.current.selectedId)??G[G.length-1];e?tt(e):et()}else et()}},rt=()=>{let e=k.current.cubes,t=e.map(e=>e.id).join(`|`);t===Ae?e.forEach(e=>{let t=G.find(t=>t.id===e.id);t&&(t.model=e.model,t.slot=e.slot)}):(qe(),G=e.map(Ke),Ae=t,Me=``,K=!0,Pe=!0,q=!0);let n=e.length<=1,r=e.map(e=>`${e.id}:${n||e.id===k.current.selectedId?st(e.model):0}`).join(`|`);if(r!==Me){for(let e of G)(n||e.id===k.current.selectedId)&&st(e.model)>0?e.detail||We(e):He(e);Me=r,K=!0}},it=k.current.resetToken,at=0,lt=0,vt=new _,yt=()=>{let e=t.clientWidth||1,r=t.clientHeight||1,i=e*r>12e5||Oe?1:e<700?1.15:1.25,a=Math.min(window.devicePixelRatio||1,i);b.aspect=e/Math.max(1,r),b.fov=e<700?50:38,b.updateProjectionMatrix(),n.setPixelRatio(a),n.setSize(e,r,!1),W.setPixelRatio(a),W.setSize(e,r),ke.strength=e<700?.3:.42};yt();let bt=new ResizeObserver(yt);bt.observe(t);let xt=()=>{x.current=null,k.current.onInteract()};C.addEventListener(`start`,xt);let St=()=>{for(let e of G){if(!e.markerMesh)continue;let t=Qe.intersectObject(e.markerMesh,!1)[0];if(t?.instanceId!=null&&e.markers[t.instanceId])return{id:e.id,index:e.markers[t.instanceId].index}}return null},Ct=()=>{let e=Qe.intersectObjects(G.map(e=>e.pick),!1)[0]?.object.userData.cubeId;return typeof e==`string`?e:null},wt=0,Tt=0,Et=e=>{wt=e.clientX,Tt=e.clientY},Dt=e=>{if(Math.hypot(e.clientX-wt,e.clientY-Tt)>6)return;let t=n.domElement.getBoundingClientRect();$e.x=(e.clientX-t.left)/t.width*2-1,$e.y=-((e.clientY-t.top)/t.height)*2+1,Qe.setFromCamera($e,b);let r=St();if(r){k.current.onPick(r.id,r.index);return}k.current.onSelect(Ct()??``)},Ot=e=>{let t=n.domElement.getBoundingClientRect();$e.x=(e.clientX-t.left)/t.width*2-1,$e.y=-((e.clientY-t.top)/t.height)*2+1,Qe.setFromCamera($e,b),n.domElement.style.cursor=St()||Ct()?`pointer`:``};n.domElement.addEventListener(`pointerdown`,Et),n.domElement.addEventListener(`pointerup`,Dt),n.domElement.addEventListener(`pointermove`,Ot);let kt=0,At=!1,jt=!1,Mt=e=>{kt=requestAnimationFrame(Mt);try{vt.update(e);let t=Math.min(vt.getDelta(),.05);lt+=t;let i=k.current;rt();let o=i.selectedIds.join(`|`);o!==je&&(je=o,K=!0);let c=gt(i.view);(c!==Ne||K)&&(Ne=c,K=!1,nt(i.view)),i.resetToken!==it&&(it=i.resetToken,it>0&&et()),C.autoRotate=i.autoRotate;let l=x.current;if(l){l.age+=t;let e=G.find(e=>e.id===l.id);e&&(Z.set(l.x,l.y,l.z).add(e.group.position),C.target.lerp(Z,1-Math.exp(-6*t))),l.age>.85&&(x.current=null)}let u=Math.max(1,g.current.from),d=Math.max(u,g.current.to),m=p.current;G.forEach((e,n)=>{let a=n+1,o=m&&a>=u&&a<=d||!m&&f.current&&e.id===i.selectedId,c=Math.max(1,e.model.path.length-1),l=s.current[e.id]??0;o&&(l+=t*28,l>=c&&(l=0),s.current[e.id]=l,e.id===i.selectedId&&(at+=t,at>=.08&&(at=0,i.onHud(l))));let p=Math.max(0,Math.min(c,l)),h=Math.floor(p),g=p-h,_=e.model.path[h],v=e.model.path[Math.min(h+1,e.model.path.length-1)];if(!_||!v)return;Z.set(...r(_.x,_.y,_.z,i.view.explode,e.model)),Je.set(...r(v.x,v.y,v.z,i.view.explode,e.model)),Q.copy(Z).lerp(Je,g),e.traveler.position.copy(Q),e.halo.position.copy(Q);let y=1.55+Math.sin(lt*3.2+n)*.16;e.halo.scale.setScalar(y);let b=ht(_.events[0]?_:v.events[0]&&g>.65?v:_);e.travelerMat.color.set(b),e.travelerMat.emissive.set(b),e.flareMat.color.set(b),e.haloMat.color.set(b)}),B.opacity=.12+Math.sin(lt*2.4)*.05,C.update();try{W.render(t)}catch{n.render(a,b)}At||(At=!0,n.domElement.style.opacity=`1`,k.current.onReady?.())}catch(e){jt||(jt=!0,console.error(e))}};return kt=requestAnimationFrame(Mt),()=>{cancelAnimationFrame(kt),bt.disconnect(),C.removeEventListener(`start`,xt),C.dispose(),n.domElement.removeEventListener(`pointerdown`,Et),n.domElement.removeEventListener(`pointerup`,Dt),n.domElement.removeEventListener(`pointermove`,Ot),qe(),_t(a),T.dispose(),D.dispose(),O.dispose(),M.dispose(),W.dispose(),n.dispose(),n.domElement.remove()}},[x,f,p,g,s]),(0,Ke.jsx)(`div`,{ref:ce,className:`h-full w-full`})});export{vt as CubeCanvas};