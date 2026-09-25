import{a as e,i as t,n,o as r,r as i,s as a,t as o}from"./index-rzk7SFVF.js";import{A as s,B as c,C as l,D as u,E as d,F as f,G as p,H as m,I as h,J as g,K as _,L as v,M as y,N as b,O as ee,P as x,S,T as C,U as te,V as ne,W as re,X as w,Y as T,Z as E,_ as D,a as ie,b as ae,c as O,d as oe,f as se,g as k,h as ce,i as le,j as ue,k as A,l as j,m as de,n as fe,o as pe,p as M,q as me,r as he,s as N,t as ge,u as _e,v as ve,w as P,x as ye,y as be,z as xe}from"./three.module-DCP2Plhe.js";var F=a(),I={type:`change`},L={type:`start`},Se={type:`end`},R=new f,z=new ue,Ce=Math.cos(70*l.DEG2RAD),B=new w,V=2*Math.PI,H={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},U=1e-6,we=class extends j{constructor(e,t=null){super(e,t),this.state=H.NONE,this.target=new w,this.cursor=new w,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:`ArrowLeft`,UP:`ArrowUp`,RIGHT:`ArrowRight`,BOTTOM:`ArrowDown`},this.mouseButtons={LEFT:S.ROTATE,MIDDLE:S.DOLLY,RIGHT:S.PAN},this.touches={ONE:p.ROTATE,TWO:p.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle=`auto`,this._domElementKeyEvents=null,this._lastPosition=new w,this._lastQuaternion=new b,this._lastTargetPosition=new w,this._quat=new b().setFromUnitVectors(e.up,new w(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new m,this._sphericalDelta=new m,this._scale=1,this._panOffset=new w,this._rotateStart=new T,this._rotateEnd=new T,this._rotateDelta=new T,this._panStart=new T,this._panEnd=new T,this._panDelta=new T,this._dollyStart=new T,this._dollyEnd=new T,this._dollyDelta=new T,this._dollyDirection=new w,this._mouse=new T,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=Te.bind(this),this._onPointerDown=W.bind(this),this._onPointerUp=Ee.bind(this),this._onContextMenu=Ne.bind(this),this._onMouseWheel=ke.bind(this),this._onKeyDown=Ae.bind(this),this._onTouchStart=je.bind(this),this._onTouchMove=Me.bind(this),this._onMouseDown=De.bind(this),this._onMouseMove=Oe.bind(this),this._interceptControlDown=Pe.bind(this),this._interceptControlUp=Fe.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e===`grab`?this.domElement.style.cursor=`grab`:this.domElement.style.cursor=`auto`}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointercancel`,this._onPointerUp),this.domElement.addEventListener(`contextmenu`,this._onContextMenu),this.domElement.addEventListener(`wheel`,this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener(`keydown`,this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction=`none`}disconnect(){this.state=H.NONE,this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.removeEventListener(`pointercancel`,this._onPointerUp),this.domElement.removeEventListener(`wheel`,this._onMouseWheel),this.domElement.removeEventListener(`contextmenu`,this._onContextMenu),this.stopListenToKeyEvents();let e=this.domElement.getRootNode();e.removeEventListener(`keydown`,this._interceptControlDown,{capture:!0}),e.removeEventListener(`keyup`,this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction=``,this.domElement.style.cursor=`auto`}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(I),this.update(),this.state=H.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;B.copy(t).sub(this.target),B.applyQuaternion(this._quat),this._spherical.setFromVector3(B),this.autoRotate&&this.state===H.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(n)&&isFinite(r)&&(n<-Math.PI?n+=V:n>Math.PI&&(n-=V),r<-Math.PI?r+=V:r>Math.PI&&(r-=V),n<=r?this._spherical.theta=Math.max(n,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+r)/2?Math.max(n,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let i=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let e=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),i=e!=this._spherical.radius}if(B.setFromSpherical(this._spherical),B.applyQuaternion(this._quatInverse),t.copy(this.target).add(B),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let e=null;if(this.object.isPerspectiveCamera){let t=B.length();e=this._clampDistance(t*this._scale);let n=t-e;this.object.position.addScaledVector(this._dollyDirection,n),this.object.updateMatrixWorld(),i=!!n}else if(this.object.isOrthographicCamera){let t=new w(this._mouse.x,this._mouse.y,0);t.unproject(this.object);let n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),i=n!==this.object.zoom;let r=new w(this._mouse.x,this._mouse.y,0);r.unproject(this.object),this.object.position.sub(r).add(t),this.object.updateMatrixWorld(),e=B.length()}else console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.`),this.zoomToCursor=!1;e!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(e).add(this.object.position):(R.origin.copy(this.object.position),R.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(R.direction))<Ce?this.object.lookAt(this.target):(z.setFromNormalAndCoplanarPoint(this.object.up,this.target),R.intersectPlane(z,this.target))))}else if(this.object.isOrthographicCamera){let e=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),e!==this.object.zoom&&(this.object.updateProjectionMatrix(),i=!0)}return this._scale=1,this._performCursorZoom=!1,i||this._lastPosition.distanceToSquared(this.object.position)>U||8*(1-this._lastQuaternion.dot(this.object.quaternion))>U||this._lastTargetPosition.distanceToSquared(this.target)>U?(this.dispatchEvent(I),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e===null?V/60/60*this.autoRotateSpeed:V/60*this.autoRotateSpeed*e}_getZoomScale(e){let t=Math.abs(e*.01);return .95**(this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){B.setFromMatrixColumn(t,0),B.multiplyScalar(-e),this._panOffset.add(B)}_panUp(e,t){this.screenSpacePanning===!0?B.setFromMatrixColumn(t,1):(B.setFromMatrixColumn(t,0),B.crossVectors(this.object.up,B)),B.multiplyScalar(e),this._panOffset.add(B)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;B.copy(r).sub(this.target);let i=B.length();i*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*i/n.clientHeight,this.object.matrix),this._panUp(2*t*i/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.`),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=n.width,o=n.height;this._mouse.x=r/a*2-1,this._mouse.y=-(i/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(V*this._rotateDelta.x/t.clientHeight),this._rotateUp(V*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(V*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-V*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(V*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-V*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(n,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(n,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyStart.set(0,i)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateEnd.set(n,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(V*this._rotateDelta.x/t.clientHeight),this._rotateUp(V*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(n,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyEnd.set(0,i),this._dollyDelta.set(0,(this._dollyEnd.y/this._dollyStart.y)**+this.zoomSpeed),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new T,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function W(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.ownerDocument.addEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.addEventListener(`pointerup`,this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType===`touch`?this._onTouchStart(e):this._onMouseDown(e),this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grabbing`)))}function Te(e){this.enabled!==!1&&(e.pointerType===`touch`?this._onTouchMove(e):this._onMouseMove(e))}function Ee(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.dispatchEvent(Se),this.state=H.NONE,this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grab`);break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y})}}function De(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case S.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=H.DOLLY;break;case S.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=H.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=H.ROTATE}break;case S.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=H.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=H.PAN}break;default:this.state=H.NONE}this.state!==H.NONE&&this.dispatchEvent(L)}function Oe(e){switch(this.state){case H.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case H.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case H.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e)}}function ke(e){this.enabled!==!1&&this.enableZoom!==!1&&this.state===H.NONE&&(e.preventDefault(),this.dispatchEvent(L),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(Se))}function Ae(e){this.enabled!==!1&&this._handleKeyDown(e)}function je(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case p.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=H.TOUCH_ROTATE;break;case p.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=H.TOUCH_PAN;break;default:this.state=H.NONE}break;case 2:switch(this.touches.TWO){case p.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=H.TOUCH_DOLLY_PAN;break;case p.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=H.TOUCH_DOLLY_ROTATE;break;default:this.state=H.NONE}break;default:this.state=H.NONE}this.state!==H.NONE&&this.dispatchEvent(L)}function Me(e){switch(this._trackPointer(e),this.state){case H.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case H.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case H.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case H.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=H.NONE}}function Ne(e){this.enabled!==!1&&e.preventDefault()}function Pe(e){e.key===`Control`&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}function Fe(e){e.key===`Control`&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}var G={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`},K=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},Ie=new A(-1,1,1,-1,0,1),Le=new class extends ie{constructor(){super(),this.setAttribute(`position`,new M([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new M([0,2,0,0,2,0],2))}},q=class{constructor(e){this._mesh=new P(Le,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Ie)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Re=class extends K{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof c?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=g.clone(e.uniforms),this.material=new c({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new q(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},ze=class extends K{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},Be=class extends K{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},Ve=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new T);this._width=n.width,this._height=n.height,t=new E(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:D}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Re(G),this.copyPass.material.blending=0,this.timer=new _}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}ze!==void 0&&(r instanceof ze?n=!0:r instanceof Be&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new T);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},He=class extends K{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new N}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},Ue={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new N(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`},We=class e extends K{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new T(256,256):new T(e.x,e.y),this.clearColor=new N(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new E(i,a,{type:D,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new E(i,a,{type:D,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new E(i,a,{type:D,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=Ue;this.highPassUniforms=g.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new c({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new T(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let l=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=l,this.bloomTintColors=[new w(1,1,1),new w(1,1,1),new w(1,1,1),new w(1,1,1),new w(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=g.clone(G.uniforms),this.blendMaterial=new c({uniforms:this.copyUniforms,vertexShader:G.vertexShader,fragmentShader:G.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new N,this._oldClearAlpha=1,this._basic=new C,this._fsQuad=new q(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new T(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new c({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new T(.5,.5)},direction:{value:new T(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

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

				}`})}_getCompositeMaterial(e){return new c({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

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

				}`})}};We.BlurDirectionX=new T(1,0),We.BlurDirectionY=new T(0,1);var J={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
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

		}`},Ge=class extends K{constructor(){super(),this.isOutputPass=!0,this.uniforms=g.clone(J.uniforms),this.material=new x({name:J.name,uniforms:this.uniforms,vertexShader:J.vertexShader,fragmentShader:J.fragmentShader}),this._fsQuad=new q(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},O.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Ke=o(),qe={left:{nx:-.5,ny:0,nz:0,axis:`x`},right:{nx:.5,ny:0,nz:0,axis:`x`},bottom:{nx:0,ny:-.5,nz:0,axis:`y`},top:{nx:0,ny:.5,nz:0,axis:`y`},back:{nx:0,ny:0,nz:-.5,axis:`z`},front:{nx:0,ny:0,nz:.5,axis:`z`}},Y=new u,X=new w,Je=new w,Z=new w,Ye=new w(0,1,0),Q=new N,Xe=new N(i.verdigris),Ze=new N(i.brass),Qe=new h,$=new T,$e=`
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
    vec4 mv = viewMatrix * world;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`,et=`
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
`,tt=`
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
`,nt=`
  varying vec3 vColor;
  uniform float gain;
  void main() {
    gl_FragColor = vec4(vColor * gain, 1.0);
  }
`,rt=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,it=`
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float along = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 1.35);
    float radial = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.7);
    gl_FragColor = vec4(color, along * radial * 0.28);
  }
`,at={uniforms:{tDiffuse:{value:null}},vertexShader:`
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
  `};function ot(e){return e.walls.quiet.length+e.walls.shell.length+e.walls.corridor.length}function st(e,t){return Math.max(1,e.height-1)*(1+t*n)+1}function ct(e,t){return t<0||e.y===t||e.face===`top`&&e.y===t-1}function lt(e,t,n,i,a){for(let o=0;o<t.length;o+=1){let s=t[o],c=qe[s.face],[l,u,d]=r(s.x,s.y,s.z,i,n),f=!ct(s,a);Y.position.set(l+c.nx,u+c.ny,d+c.nz),Y.quaternion.identity(),f?Y.scale.set(0,0,0):c.axis===`x`?Y.scale.set(.04,.9,.9):c.axis===`y`?Y.scale.set(.9,.04,.9):Y.scale.set(.9,.9,.04),Y.updateMatrix(),e.setMatrixAt(o,Y.matrix)}e.instanceMatrix.needsUpdate=!0}function ut(e,t,n,r){return new c({uniforms:{base:{value:new N(e)},rim:{value:new N(t)},alpha:{value:n},power:{value:r}},vertexShader:$e,fragmentShader:et,transparent:!0,depthWrite:!1,side:2,toneMapped:!0})}function dt(e,t){let n=new ve(new he(1,1,1),t,Math.max(1,e.length));return n.count=e.length,n.frustumCulled=!1,n.raycast=()=>void 0,n}function ft(e){return new c({uniforms:{gain:{value:e}},vertexShader:tt,fragmentShader:nt,toneMapped:!0})}function pt(e){let t=new P(new _e(.22,1.8,9.5,24,1,!0),new c({uniforms:{color:{value:new N(e)}},vertexShader:rt,fragmentShader:it,transparent:!0,depthWrite:!1,blending:2,side:2,toneMapped:!1}));return t.position.y=3.4,t.frustumCulled=!1,t.raycast=()=>void 0,t}function mt(e){let n=t(e.events[0]);return n===`tool`?i.brass:n===`emotion`?i.coral:n===`stage`?i.verdigris:i.mist}function ht(e){return`${e.explode}|${e.floor}|${+!!e.shell}|${+!!e.maze}|${+!!e.tunnel}|${+!!e.path}`}function gt(e){e.traverse(e=>{let t=e;t.geometry&&!t.geometry.userData.shared&&t.geometry.dispose();let n=t.material,r=Array.isArray(n)?n:n?[n]:[];for(let e of r)e.userData.shared||e.dispose()})}var _t=(0,F.memo)(function({cubes:t,selectedId:n,view:a,stepsRef:o,playingRef:l,masterRef:u,rangeRef:f,onHud:p,onPick:m,onSelect:h,focusRef:g,autoRotate:b,onInteract:x,resetToken:S,onReady:w}){let E=(0,F.useRef)(null),D=(0,F.useRef)({cubes:t,selectedId:n,view:a,onHud:p,onPick:m,onSelect:h,autoRotate:b,onInteract:x,resetToken:S,onReady:w});return D.current={cubes:t,selectedId:n,view:a,onHud:p,onPick:m,onSelect:h,autoRotate:b,onInteract:x,resetToken:S,onReady:w},(0,F.useEffect)(()=>{let t=E.current;if(!t)return;let n=new ge({antialias:!1,powerPreference:`high-performance`,alpha:!1});n.setPixelRatio(1),n.toneMapping=4,n.toneMappingExposure=1.02,n.outputColorSpace=v,n.domElement.style.width=`100%`,n.domElement.style.height=`100%`,n.domElement.style.display=`block`,n.domElement.style.touchAction=`none`,n.domElement.style.opacity=`0`,t.appendChild(n.domElement);let a=new xe;a.background=new N(`#02060a`);let p=new de(`#02060a`,.012);a.fog=p,a.add(new fe(10405076,.35));let m=new oe(15201535,2.8);m.position.set(-8,18,6),a.add(m);let h=new oe(14983754,1.4);h.position.set(14,7,9),a.add(h);let b=new s(38,1,.1,900);b.position.set(11.4,6.2,13.6);let x=new we(b,n.domElement);x.enableDamping=!0,x.dampingFactor=.08,x.autoRotateSpeed=.35,x.minDistance=6,x.maxDistance=240,x.maxPolarAngle=Math.PI*.92,x.target.set(0,-.4,0);let S=new he(1,1,1);S.userData.shared=!0;let w=new d({color:`#12302c`,emissive:`#1a6b5c`,emissiveIntensity:.55,transparent:!0,opacity:.16,roughness:.18,metalness:.25,depthWrite:!1,side:2});w.userData.shared=!0;let O=new C({transparent:!0,opacity:0,depthWrite:!1});O.userData.shared=!0;let ue=new ae({vertexColors:!0});ue.userData.shared=!0;let A=new P(new pe(22,64),new c({transparent:!0,depthWrite:!1,vertexShader:`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,fragmentShader:`
          varying vec2 vUv;
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float disk = smoothstep(1.0, 0.15, length(p));
            float glow = exp(-dot(p * vec2(1.05, 1.45), p * vec2(1.05, 1.45)) * 1.8);
            vec3 col = vec3(0.012, 0.02, 0.026);
            col += vec3(0.05, 0.22, 0.18) * glow;
            col += vec3(0.22, 0.12, 0.04) * glow * glow;
            gl_FragColor = vec4(col, disk * 0.95);
          }
        `}));A.rotation.x=-Math.PI/2,A.position.y=-8.55,a.add(A);let j=new ce(28,28,1919556,1057311);j.position.y=-8.52;let M=j.material,F=e=>{e.transparent=!0,e.opacity=.45};Array.isArray(M)?M.forEach(F):F(M),a.add(j);let I=new k,L=new P(S,new C({color:i.brass,transparent:!0,opacity:.14,side:1,depthWrite:!1,toneMapped:!1})),Se=new ye(new se(S),new ae({color:i.brass,toneMapped:!1}));I.add(L,Se),I.visible=!1,a.add(I);let R=L.material,z=new Ve(n);z.addPass(new He(a,b));let Ce=new We(new T(256,256),.42,.62,.78);z.addPass(Ce),z.addPass(new Ge),z.addPass(new Re(at));let B=[],V=``,H=``,U=``,W=!0,Te=!1,Ee=18,De=1,Oe=1,ke=e=>{e.detail&&(gt(e.detail),e.group.remove(e.detail),e.detail=null,e.quiet=null,e.shell=null,e.tunnel=null,e.pathMesh=null,e.markerMesh=null,e.markers=[],e.enter=null,e.leave=null,e.ghost.visible=!0)},Ae=e=>{ke(e);let t=e.model;if(ot(t)===0)return;let n=new k,r=dt(t.walls.quiet,ut(`#07141a`,`#1a4a42`,.02,2.8)),a=dt(t.walls.shell,ut(`#0c2420`,`#3ecfb2`,.08,2.2)),o=dt(t.walls.corridor,ut(`#123830`,`#7dffe8`,.22,1.7));n.add(r,a,o);let s=Math.max(1,t.path.length-1),c=new ve(new _e(1,1,1,8,1,!0),ft(2.15),s);c.count=Math.max(0,t.path.length-1),c.frustumCulled=!1,c.raycast=()=>void 0,n.add(c);let l=t.path.map((e,t)=>({node:e,index:t})).filter(e=>e.node.events.length>0),u=new ve(new ee(1,0),ft(2.7),Math.max(1,l.length));u.count=l.length,u.frustumCulled=!1,l.forEach((e,t)=>u.setColorAt(t,Q.set(mt(e.node)))),u.instanceColor&&(u.instanceColor.needsUpdate=!0),n.add(u);let f=new d({color:i.verdigris,emissive:i.verdigris,emissiveIntensity:3.2,roughness:.25,metalness:.4}),p=new d({color:i.coral,emissive:i.coral,emissiveIntensity:3.2,roughness:.25,metalness:.4}),m=new me(.46,.02,16,48),h=new me(.3,.01,12,40),g=new k,_=new k;g.add(new P(m,f)),g.add(new P(h,new d({color:i.bone,emissive:i.verdigris,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),g.add(new y(i.verdigris,8,6,2)),g.add(pt(i.verdigris)),_.add(new P(m.clone(),p)),_.add(new P(h.clone(),new d({color:i.bone,emissive:i.coral,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),_.add(new y(i.coral,8,6,2)),_.add(pt(i.coral));for(let e of[...g.children,..._.children])e.raycast=()=>void 0;n.add(g,_),e.group.add(n),e.detail=n,e.quiet=r,e.shell=a,e.tunnel=o,e.pathMesh=c,e.markerMesh=u,e.markers=l,e.enter=g,e.leave=_,e.ghost.visible=!1},je=e=>{let t=new k,n=new P(S,w);n.raycast=()=>void 0;let r=new P(S,O);r.userData.cubeId=e.id;let o=Math.max(2,e.model.path.length),s=new ie;s.setAttribute(`position`,new le(new Float32Array(o*3),3)),s.setAttribute(`color`,new le(new Float32Array(o*3),3));let c=new be(s,ue);c.raycast=()=>void 0;let l=new d({color:i.brass,emissive:i.brass,emissiveIntensity:2.4,roughness:.2,metalness:.35}),u=new P(new ne(.16,20,20),l);u.raycast=()=>void 0;let f=new C({color:i.brass,transparent:!0,opacity:.22,depthWrite:!1,blending:2,toneMapped:!1}),p=new P(new ne(.16,12,12),f);p.raycast=()=>void 0;let m=new re({color:i.brass,transparent:!0,opacity:.8,depthWrite:!1,blending:2,toneMapped:!1}),h=new te(m);h.scale.set(1.1,1.1,1),h.raycast=()=>void 0;let g=new y(i.brass,10,6,2);return u.add(g,h),t.add(n,r,c,u,p),a.add(t),{id:e.id,model:e.model,group:t,ghost:n,pick:r,pathLine:c,traveler:u,halo:p,detail:null,quiet:null,shell:null,tunnel:null,pathMesh:null,markerMesh:null,markers:[],enter:null,leave:null,travelerMat:l,haloMat:f,flareMat:m,glow:g}},Me=()=>{for(let e of B)ke(e),gt(e.group),a.remove(e.group);B=[]},Ne=()=>{let e=Math.max(16,Ee*Math.max(De,Oe)*.9);b.position.set(e*.62,Math.max(6,e*.42),e*.78),x.target.set(0,-.3,0),x.maxDistance=Math.max(80,e*4),p.density=1.15/Math.max(28,e)},Pe=t=>{let n=B.length,i=Math.max(1,Math.ceil(Math.sqrt(Math.max(1,n)))),a=Math.max(1,Math.ceil(n/i)),o=Math.max(8,...B.map(n=>e(n.model.width,n.model.height,n.model.depth,t.explode)))+3.6;Ee=o,De=i,Oe=a,B.forEach((e,n)=>{let s=n%i,c=Math.floor(n/i);e.group.position.set((s-(i-1)/2)*o,0,(c-(a-1)/2)*o);let l=st(e.model,t.explode);e.ghost.scale.set(e.model.width,l,e.model.depth),e.pick.scale.copy(e.ghost.scale);let u=e.pathLine.geometry.getAttribute(`position`),d=e.pathLine.geometry.getAttribute(`color`),f=Math.max(1,e.model.path.length-1);if(e.model.path.forEach((n,i)=>{let[a,o,s]=r(n.x,n.y,n.z,t.explode,e.model);u.setXYZ(i,a,o,s),Q.copy(Xe).lerp(Ze,f<=1?0:i/(f-1)),d.setXYZ(i,Q.r,Q.g,Q.b)}),u.needsUpdate=!0,d.needsUpdate=!0,e.pathLine.visible=t.path,e.quiet&&e.shell&&e.tunnel&&e.pathMesh&&e.enter&&e.leave){let n=t.floor>=0&&t.floor>=e.model.height?-1:t.floor;lt(e.quiet,e.model.walls.quiet,e.model,t.explode,n),lt(e.shell,e.model.walls.shell,e.model,t.explode,n),lt(e.tunnel,e.model.walls.corridor,e.model,t.explode,n),e.quiet.visible=t.maze&&e.model.walls.quiet.length>0,e.shell.visible=t.shell&&e.model.walls.shell.length>0,e.tunnel.visible=t.tunnel&&e.model.walls.corridor.length>0;let i=e.model.path.length-1;for(let n=0;n<i;n+=1){let a=e.model.path[n],o=e.model.path[n+1];X.set(...r(a.x,a.y,a.z,t.explode,e.model)),Je.set(...r(o.x,o.y,o.z,t.explode,e.model)),Z.subVectors(Je,X);let s=Z.length();Y.position.copy(X).addScaledVector(Z,.5),Y.quaternion.identity(),!t.path||s<1e-4?Y.scale.set(0,0,0):(Z.multiplyScalar(1/s),Y.quaternion.setFromUnitVectors(Ye,Z),Y.scale.set(.072,s,.072)),Y.updateMatrix(),e.pathMesh.setMatrixAt(n,Y.matrix),Q.copy(Xe).lerp(Ze,i<=1?0:n/(i-1)),e.pathMesh.setColorAt(n,Q)}e.pathMesh.instanceMatrix.needsUpdate=!0,e.pathMesh.instanceColor&&(e.pathMesh.instanceColor.needsUpdate=!0),e.pathMesh.visible=t.path,e.markers.forEach((n,i)=>{let[a,o,s]=r(n.node.x,n.node.y,n.node.z,t.explode,e.model);Y.position.set(a,o,s),Y.quaternion.identity(),Y.scale.setScalar(.2),Y.updateMatrix(),e.markerMesh?.setMatrixAt(i,Y.matrix)}),e.markerMesh&&(e.markerMesh.instanceMatrix.needsUpdate=!0);let[a,o,s]=r(e.model.entrance.x,e.model.entrance.y,e.model.entrance.z,t.explode,e.model);e.enter.position.set(a,o,s-.78);let[c,l,u]=r(e.model.exit.x,e.model.exit.y,e.model.exit.z,t.explode,e.model);e.leave.position.set(c,l,u+.78)}});let s=o*Math.hypot(i,a)*.62+10;A.scale.setScalar(Math.max(1,s/22)),j.scale.setScalar(Math.max(1,s/18));let c=B.find(e=>e.id===D.current.selectedId)??B[0];c?(I.visible=!0,I.position.copy(c.group.position),I.scale.set(c.model.width+.85,st(c.model,t.explode)+.7,c.model.depth+.85)):I.visible=!1,Te&&(Te=!1,Ne())},Fe=()=>{let e=D.current.cubes,t=e.map(e=>e.id).join(`|`);t===V?e.forEach(e=>{let t=B.find(t=>t.id===e.id);t&&(t.model=e.model)}):(Me(),B=e.map(je),V=t,H=``,W=!0,Te=!0);let n=e.length>0&&e.length<=4,r=e.map(e=>`${e.id}:${n||e.id===D.current.selectedId?ot(e.model):0}`).join(`|`);if(r!==H){for(let e of B)(n||e.id===D.current.selectedId)&&ot(e.model)>0?e.detail||Ae(e):ke(e);H=r,W=!0}},G=D.current.resetToken,K=0,Ie=0,Le=new _,q=()=>{let e=t.clientWidth||1,r=t.clientHeight||1,i=Math.min(window.devicePixelRatio||1,e<700?1.15:1.35);b.aspect=e/Math.max(1,r),b.fov=e<700?50:38,b.updateProjectionMatrix(),n.setPixelRatio(i),n.setSize(e,r,!1),z.setPixelRatio(i),z.setSize(e,r),Ce.strength=e<700?.3:.42};q();let ze=new ResizeObserver(q);ze.observe(t);let Be=()=>{g.current=null,D.current.onInteract()};x.addEventListener(`start`,Be);let Ue=()=>{for(let e of B){if(!e.markerMesh)continue;let t=Qe.intersectObject(e.markerMesh,!1)[0];if(t?.instanceId!=null&&e.markers[t.instanceId])return{id:e.id,index:e.markers[t.instanceId].index}}return null},J=()=>{let e=Qe.intersectObjects(B.map(e=>e.pick),!1)[0]?.object.userData.cubeId;return typeof e==`string`?e:null},Ke=0,qe=0,$e=e=>{Ke=e.clientX,qe=e.clientY},et=e=>{if(Math.hypot(e.clientX-Ke,e.clientY-qe)>6)return;let t=n.domElement.getBoundingClientRect();$.x=(e.clientX-t.left)/t.width*2-1,$.y=-((e.clientY-t.top)/t.height)*2+1,Qe.setFromCamera($,b);let r=Ue();if(r){D.current.onSelect(r.id),D.current.onPick(r.id,r.index);return}let i=J();i&&D.current.onSelect(i)},tt=e=>{let t=n.domElement.getBoundingClientRect();$.x=(e.clientX-t.left)/t.width*2-1,$.y=-((e.clientY-t.top)/t.height)*2+1,Qe.setFromCamera($,b),n.domElement.style.cursor=Ue()||J()?`pointer`:``};n.domElement.addEventListener(`pointerdown`,$e),n.domElement.addEventListener(`pointerup`,et),n.domElement.addEventListener(`pointermove`,tt);let nt=0,rt=!1,it=e=>{nt=requestAnimationFrame(it),Le.update(e);let t=Math.min(Le.getDelta(),.05);Ie+=t;let i=D.current;Fe();let a=ht(i.view);(a!==U||W)&&(U=a,W=!1,Pe(i.view)),i.resetToken!==G&&(G=i.resetToken,G>0&&Ne()),x.autoRotate=i.autoRotate;let s=g.current;if(s){s.age+=t;let e=B.find(e=>e.id===s.id);e&&(X.set(s.x,s.y,s.z).add(e.group.position),x.target.lerp(X,1-Math.exp(-6*t))),s.age>.85&&(g.current=null)}let c=Math.max(1,f.current.from),d=Math.max(c,f.current.to),p=u.current;B.forEach((e,n)=>{let a=n+1,s=p&&a>=c&&a<=d||!p&&l.current&&e.id===i.selectedId,u=Math.max(1,e.model.path.length-1),f=o.current[e.id]??0;s&&(f+=t*28,f>=u&&(f=0),o.current[e.id]=f,e.id===i.selectedId&&(K+=t,K>=.08&&(K=0,i.onHud(f))));let m=Math.max(0,Math.min(u,f)),h=Math.floor(m),g=m-h,_=e.model.path[h],v=e.model.path[Math.min(h+1,e.model.path.length-1)];if(!_||!v)return;X.set(...r(_.x,_.y,_.z,i.view.explode,e.model)),Je.set(...r(v.x,v.y,v.z,i.view.explode,e.model)),Z.copy(X).lerp(Je,g),e.traveler.position.copy(Z),e.halo.position.copy(Z);let y=1.55+Math.sin(Ie*3.2+n)*.16;e.halo.scale.setScalar(y);let b=mt(_.events[0]?_:v.events[0]&&g>.65?v:_);e.travelerMat.color.set(b),e.travelerMat.emissive.set(b),e.glow.color.set(b),e.flareMat.color.set(b),e.haloMat.color.set(b)}),R.opacity=.1+Math.sin(Ie*2.4)*.05,x.update(),z.render(t),rt||(rt=!0,n.domElement.style.opacity=`1`,D.current.onReady?.())};return nt=requestAnimationFrame(it),()=>{cancelAnimationFrame(nt),ze.disconnect(),x.removeEventListener(`start`,Be),x.dispose(),n.domElement.removeEventListener(`pointerdown`,$e),n.domElement.removeEventListener(`pointerup`,et),n.domElement.removeEventListener(`pointermove`,tt),Me(),gt(a),S.dispose(),w.dispose(),O.dispose(),ue.dispose(),z.dispose(),n.dispose(),n.domElement.remove()}},[g,l,u,f,o]),(0,Ke.jsx)(`div`,{ref:E,className:`h-full w-full`})});export{_t as CubeCanvas};