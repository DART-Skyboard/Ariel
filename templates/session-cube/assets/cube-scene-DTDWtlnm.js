import{a as e,i as t,n,o as r,r as i,s as a,t as o}from"./index-CWsGVnl-.js";import{A as s,B as c,C as l,D as u,E as d,F as f,G as ee,H as p,I as m,J as h,K as g,L as _,M as v,N as y,O as te,P as b,Q as x,S,T as C,U as ne,V as re,W as ie,X as w,Y as T,Z as E,_ as ae,a as oe,b as se,c as D,d as ce,f as le,g as ue,h as de,i as fe,j as O,k,l as pe,m as me,n as he,o as ge,p as A,q as _e,r as ve,s as j,t as ye,u as be,v as xe,w as M,x as Se,y as Ce,z as we}from"./three.module-DLqYvT4B.js";var N=a(),P={type:`change`},Te={type:`start`},Ee={type:`end`},De=new f,Oe=new O,F=Math.cos(70*l.DEG2RAD),I=new E,L=2*Math.PI,R={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},z=1e-6,ke=class extends pe{constructor(e,t=null){super(e,t),this.state=R.NONE,this.target=new E,this.cursor=new E,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:`ArrowLeft`,UP:`ArrowUp`,RIGHT:`ArrowRight`,BOTTOM:`ArrowDown`},this.mouseButtons={LEFT:S.ROTATE,MIDDLE:S.DOLLY,RIGHT:S.PAN},this.touches={ONE:g.ROTATE,TWO:g.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle=`auto`,this._domElementKeyEvents=null,this._lastPosition=new E,this._lastQuaternion=new y,this._lastTargetPosition=new E,this._quat=new y().setFromUnitVectors(e.up,new E(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new p,this._sphericalDelta=new p,this._scale=1,this._panOffset=new E,this._rotateStart=new w,this._rotateEnd=new w,this._rotateDelta=new w,this._panStart=new w,this._panEnd=new w,this._panDelta=new w,this._dollyStart=new w,this._dollyEnd=new w,this._dollyDelta=new w,this._dollyDirection=new E,this._mouse=new w,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=je.bind(this),this._onPointerDown=Ae.bind(this),this._onPointerUp=B.bind(this),this._onContextMenu=V.bind(this),this._onMouseWheel=Pe.bind(this),this._onKeyDown=Fe.bind(this),this._onTouchStart=Ie.bind(this),this._onTouchMove=Le.bind(this),this._onMouseDown=Me.bind(this),this._onMouseMove=Ne.bind(this),this._interceptControlDown=Re.bind(this),this._interceptControlUp=ze.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e===`grab`?this.domElement.style.cursor=`grab`:this.domElement.style.cursor=`auto`}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener(`pointerdown`,this._onPointerDown),this.domElement.addEventListener(`pointercancel`,this._onPointerUp),this.domElement.addEventListener(`contextmenu`,this._onContextMenu),this.domElement.addEventListener(`wheel`,this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener(`keydown`,this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction=`none`}disconnect(){this.state=R.NONE,this.domElement.removeEventListener(`pointerdown`,this._onPointerDown),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.domElement.removeEventListener(`pointercancel`,this._onPointerUp),this.domElement.removeEventListener(`wheel`,this._onMouseWheel),this.domElement.removeEventListener(`contextmenu`,this._onContextMenu),this.stopListenToKeyEvents();let e=this.domElement.getRootNode();e.removeEventListener(`keydown`,this._interceptControlDown,{capture:!0}),e.removeEventListener(`keyup`,this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction=``,this.domElement.style.cursor=`auto`}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener(`keydown`,this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(P),this.update(),this.state=R.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;I.copy(t).sub(this.target),I.applyQuaternion(this._quat),this._spherical.setFromVector3(I),this.autoRotate&&this.state===R.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,r=this.maxAzimuthAngle;isFinite(n)&&isFinite(r)&&(n<-Math.PI?n+=L:n>Math.PI&&(n-=L),r<-Math.PI?r+=L:r>Math.PI&&(r-=L),n<=r?this._spherical.theta=Math.max(n,Math.min(r,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+r)/2?Math.max(n,this._spherical.theta):Math.min(r,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let i=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let e=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),i=e!=this._spherical.radius}if(I.setFromSpherical(this._spherical),I.applyQuaternion(this._quatInverse),t.copy(this.target).add(I),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let e=null;if(this.object.isPerspectiveCamera){let t=I.length();e=this._clampDistance(t*this._scale);let n=t-e;this.object.position.addScaledVector(this._dollyDirection,n),this.object.updateMatrixWorld(),i=!!n}else if(this.object.isOrthographicCamera){let t=new E(this._mouse.x,this._mouse.y,0);t.unproject(this.object);let n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),i=n!==this.object.zoom;let r=new E(this._mouse.x,this._mouse.y,0);r.unproject(this.object),this.object.position.sub(r).add(t),this.object.updateMatrixWorld(),e=I.length()}else console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.`),this.zoomToCursor=!1;e!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(e).add(this.object.position):(De.origin.copy(this.object.position),De.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(De.direction))<F?this.object.lookAt(this.target):(Oe.setFromNormalAndCoplanarPoint(this.object.up,this.target),De.intersectPlane(Oe,this.target))))}else if(this.object.isOrthographicCamera){let e=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),e!==this.object.zoom&&(this.object.updateProjectionMatrix(),i=!0)}return this._scale=1,this._performCursorZoom=!1,i||this._lastPosition.distanceToSquared(this.object.position)>z||8*(1-this._lastQuaternion.dot(this.object.quaternion))>z||this._lastTargetPosition.distanceToSquared(this.target)>z?(this.dispatchEvent(P),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e===null?L/60/60*this.autoRotateSpeed:L/60*this.autoRotateSpeed*e}_getZoomScale(e){let t=Math.abs(e*.01);return .95**(this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){I.setFromMatrixColumn(t,0),I.multiplyScalar(-e),this._panOffset.add(I)}_panUp(e,t){this.screenSpacePanning===!0?I.setFromMatrixColumn(t,1):(I.setFromMatrixColumn(t,0),I.crossVectors(this.object.up,I)),I.multiplyScalar(e),this._panOffset.add(I)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let r=this.object.position;I.copy(r).sub(this.target);let i=I.length();i*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*i/n.clientHeight,this.object.matrix),this._panUp(2*t*i/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.`),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn(`WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.`),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),r=e-n.left,i=t-n.top,a=n.width,o=n.height;this._mouse.x=r/a*2-1,this._mouse.y=-(i/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(L*this._rotateDelta.x/t.clientHeight),this._rotateUp(L*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(L*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-L*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(L*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-L*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateStart.set(n,r)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panStart.set(n,r)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyStart.set(0,i)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._rotateEnd.set(n,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(L*this._rotateDelta.x/t.clientHeight),this._rotateUp(L*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),r=.5*(e.pageY+t.y);this._panEnd.set(n,r)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,r=e.pageY-t.y,i=Math.sqrt(n*n+r*r);this._dollyEnd.set(0,i),this._dollyDelta.set(0,(this._dollyEnd.y/this._dollyStart.y)**+this.zoomSpeed),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new w,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function Ae(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.ownerDocument.addEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.addEventListener(`pointerup`,this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType===`touch`?this._onTouchStart(e):this._onMouseDown(e),this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grabbing`)))}function je(e){this.enabled!==!1&&(e.pointerType===`touch`?this._onTouchMove(e):this._onMouseMove(e))}function B(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.ownerDocument.removeEventListener(`pointermove`,this._onPointerMove),this.domElement.ownerDocument.removeEventListener(`pointerup`,this._onPointerUp),this.dispatchEvent(Ee),this.state=R.NONE,this._cursorStyle===`grab`&&(this.domElement.style.cursor=`grab`);break;case 1:let t=this._pointers[0],n=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:n.x,pageY:n.y})}}function Me(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case S.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=R.DOLLY;break;case S.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=R.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=R.ROTATE}break;case S.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=R.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=R.PAN}break;default:this.state=R.NONE}this.state!==R.NONE&&this.dispatchEvent(Te)}function Ne(e){switch(this.state){case R.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case R.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case R.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e)}}function Pe(e){this.enabled!==!1&&this.enableZoom!==!1&&this.state===R.NONE&&(e.preventDefault(),this.dispatchEvent(Te),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(Ee))}function Fe(e){this.enabled!==!1&&this._handleKeyDown(e)}function Ie(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case g.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=R.TOUCH_ROTATE;break;case g.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=R.TOUCH_PAN;break;default:this.state=R.NONE}break;case 2:switch(this.touches.TWO){case g.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=R.TOUCH_DOLLY_PAN;break;case g.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=R.TOUCH_DOLLY_ROTATE;break;default:this.state=R.NONE}break;default:this.state=R.NONE}this.state!==R.NONE&&this.dispatchEvent(Te)}function Le(e){switch(this._trackPointer(e),this.state){case R.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case R.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case R.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case R.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=R.NONE}}function V(e){this.enabled!==!1&&e.preventDefault()}function Re(e){e.key===`Control`&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}function ze(e){e.key===`Control`&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener(`keyup`,this._interceptControlUp,{passive:!0,capture:!0}))}var H={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`},U=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},Be=new k(-1,1,1,-1,0,1),W=new class extends oe{constructor(){super(),this.setAttribute(`position`,new A([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new A([0,2,0,0,2,0],2))}},G=class{constructor(e){this._mesh=new M(W,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Be)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Ve=class extends U{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof c?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=T.clone(e.uniforms),this.material=new c({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new G(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},K=class extends U{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},He=class extends U{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},Ue=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new w);this._width=n.width,this._height=n.height,t=new x(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:ue}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Ve(H),this.copyPass.material.blending=0,this.timer=new _e}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}K!==void 0&&(r instanceof K?n=!0:r instanceof He&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new w);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},We=class extends U{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new j}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},Ge={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new j(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`},Ke=class e extends U{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new w(256,256):new w(e.x,e.y),this.clearColor=new j(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new x(i,a,{type:ue,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new x(i,a,{type:ue,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new x(i,a,{type:ue,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=Ge;this.highPassUniforms=T.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new c({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new w(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let l=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=l,this.bloomTintColors=[new E(1,1,1),new E(1,1,1),new E(1,1,1),new E(1,1,1),new E(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=T.clone(H.uniforms),this.blendMaterial=new c({uniforms:this.copyUniforms,vertexShader:H.vertexShader,fragmentShader:H.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new j,this._oldClearAlpha=1,this._basic=new C,this._fsQuad=new G(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new w(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new c({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new w(.5,.5)},direction:{value:new w(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

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

				}`})}};Ke.BlurDirectionX=new w(1,0),Ke.BlurDirectionY=new w(0,1);var q={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
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

		}`},qe=class extends U{constructor(){super(),this.isOutputPass=!0,this.uniforms=T.clone(q.uniforms),this.material=new b({name:q.name,uniforms:this.uniforms,vertexShader:q.vertexShader,fragmentShader:q.fragmentShader}),this._fsQuad=new G(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},D.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Je=o(),Ye={left:{nx:-.5,ny:0,nz:0,axis:`x`},right:{nx:.5,ny:0,nz:0,axis:`x`},bottom:{nx:0,ny:-.5,nz:0,axis:`y`},top:{nx:0,ny:.5,nz:0,axis:`y`},back:{nx:0,ny:0,nz:-.5,axis:`z`},front:{nx:0,ny:0,nz:.5,axis:`z`}},J=.01,Y=new u,X=new E,Xe=new E,Z=new E,Ze=new E(0,1,0),Q=new j,Qe=new j(i.verdigris),$e=new j(i.brass),et=new m,$=new w,tt=`
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
    vec4 mv = viewMatrix * world;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`,nt=`
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
`,rt=`
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
`,it=`
  varying vec3 vColor;
  uniform float gain;
  void main() {
    gl_FragColor = vec4(vColor * gain, 1.0);
  }
`,at=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,ot=`
  uniform vec3 color;
  varying vec2 vUv;
  void main() {
    float along = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 1.35);
    float radial = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.7);
    gl_FragColor = vec4(color, along * radial * 0.28);
  }
`,st={uniforms:{tDiffuse:{value:null}},vertexShader:`
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
  `};function ct(e){return e.walls.quiet.length+e.walls.shell.length+e.walls.corridor.length}function lt(e,t){return Math.max(1,e.height-1)*(1+t*n)+1}function ut(e,t){return t<0||e.y===t||e.face===`top`&&e.y===t-1}function dt(e,t,n,i,a){for(let o=0;o<t.length;o+=1){let s=t[o],c=Ye[s.face],[l,u,d]=r(s.x,s.y,s.z,i,n),f=!ut(s,a);Y.position.set(l+c.nx,u+c.ny,d+c.nz),Y.quaternion.identity(),f?Y.scale.set(0,0,0):c.axis===`x`?Y.scale.set(.04,.9,.9):c.axis===`y`?Y.scale.set(.9,.04,.9):Y.scale.set(.9,.9,.04),Y.updateMatrix(),e.setMatrixAt(o,Y.matrix)}e.instanceMatrix.needsUpdate=!0}function ft(e,t,n,r,i=!1){if(i){let e=new j(t);return new C({color:e,transparent:!0,opacity:Math.min(.62,.16+n*3),depthWrite:!1,side:2,toneMapped:!1,fog:!1})}return new c({uniforms:{base:{value:new j(e)},rim:{value:new j(t)},alpha:{value:n},power:{value:r}},vertexShader:tt,fragmentShader:nt,transparent:!0,depthWrite:!1,side:2,toneMapped:!0})}function pt(e,t){let n=new xe(new ve(1,1,1),t,Math.max(1,e.length));return n.count=e.length,n.frustumCulled=!1,n.raycast=()=>void 0,n}function mt(e,t=!1){return t?new C({color:`#d7fff4`,toneMapped:!1,fog:!1}):new c({uniforms:{gain:{value:e}},vertexShader:rt,fragmentShader:it,toneMapped:!0})}function ht(e){let t=new M(new be(.22,1.8,9.5,24,1,!0),new c({uniforms:{color:{value:new j(e)}},vertexShader:at,fragmentShader:ot,transparent:!0,depthWrite:!1,blending:2,side:2,toneMapped:!1}));return t.position.y=3.4,t.frustumCulled=!1,t.raycast=()=>void 0,t}function gt(e){let n=t(e.events[0]);return n===`tool`?i.brass:n===`emotion`?i.coral:n===`stage`?i.verdigris:i.mist}function _t(e){return`${e.explode}|${e.floor}|${+!!e.shell}|${+!!e.maze}|${+!!e.tunnel}|${+!!e.path}|${e.lights}`}function vt(e){e.traverse(e=>{let t=e;t.geometry&&!t.geometry.userData.shared&&t.geometry.dispose();let n=t.material,r=Array.isArray(n)?n:n?[n]:[];for(let e of r)e.userData.shared||e.dispose()})}var yt=(0,N.memo)(function({cubes:t,selectedId:n,selectedIds:a,view:o,stepsRef:l,playingRef:f,masterRef:p,rangeRef:m,onHud:g,onPick:y,onSelect:b,focusRef:S,autoRotate:T,onInteract:E,resetToken:D,onReady:O,onGpuLost:k}){let pe=(0,N.useRef)(null),A=(0,N.useRef)({cubes:t,selectedId:n,selectedIds:a,view:o,onHud:g,onPick:y,onSelect:b,autoRotate:T,onInteract:E,resetToken:D,onReady:O,onGpuLost:k});return A.current={cubes:t,selectedId:n,selectedIds:a,view:o,onHud:g,onPick:y,onSelect:b,autoRotate:T,onInteract:E,resetToken:D,onReady:O,onGpuLost:k},(0,N.useEffect)(()=>{let t=pe.current;if(!t)return;let n=new ye({antialias:!1,powerPreference:`high-performance`,alpha:!1,stencil:!1,failIfMajorPerformanceCaveat:!1});n.setPixelRatio(1),n.toneMapping=4,n.toneMappingExposure=1.02,n.outputColorSpace=_,n.domElement.style.width=`100%`,n.domElement.style.height=`100%`,n.domElement.style.display=`block`,n.domElement.style.touchAction=`none`,n.domElement.style.opacity=`0`,t.appendChild(n.domElement);let a=new we;a.background=new j(`#02060a`);let o=new me(`#02060a`,.012);a.fog=o,a.add(new ae(14155766,2365452,.85)),a.add(new he(12047836,.55));let g=new ce(15201535,2.8);g.position.set(-8,18,6),a.add(g);let y=new ce(14983754,1.4);y.position.set(14,7,9),a.add(y);let b=new s(38,1,.01,800);b.position.set(11.4*J,6.2*J,13.6*J);let T=new ke(b,n.domElement);T.enableDamping=!0,T.dampingFactor=.08,T.autoRotateSpeed=.35,T.minDistance=.04,T.maxDistance=420,T.maxPolarAngle=Math.PI*.92,T.target.set(0,-.004,0);let E=new ve(1,1,1);E.userData.shared=!0;let D=new d({color:`#1c4f46`,emissive:`#3ecfb2`,emissiveIntensity:1.35,transparent:!0,opacity:.38,roughness:.22,metalness:.12,depthWrite:!1,side:2,fog:!1,toneMapped:!1});D.userData.shared=!0;let O=new C({transparent:!0,opacity:0,depthWrite:!1});O.userData.shared=!0;let k=new se({vertexColors:!0,fog:!1,toneMapped:!1});k.userData.shared=!0;let N=Array.from({length:8},()=>new w),P=new Float32Array(8),Te=new c({transparent:!0,depthWrite:!1,uniforms:{lamps:{value:N},gain:{value:P}},vertexShader:`
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
          float e = exp(-dot(d, d) / 2200.0) * g;
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
      `}),Ee=new M(new ge(220,72),Te);Ee.rotation.x=-Math.PI/2,Ee.position.y=-.1,a.add(Ee);let De=new c({transparent:!0,depthWrite:!1,vertexShader:`
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,fragmentShader:`
        varying vec3 vWorld;
        float lineGrid(vec2 p, float scale) {
          vec2 coord = p * scale;
          vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main() {
          float w = fwidth(vWorld.x);
          float minor = lineGrid(vWorld.xz, 8.0);
          float major = lineGrid(vWorld.xz, 0.8);
          float minorFade = 1.0 - smoothstep(0.012, 0.08, w);
          float majorFade = 1.0 - smoothstep(0.08, 0.7, w);
          vec3 col = vec3(0.05, 0.16, 0.14) * minor * minorFade;
          col += vec3(0.16, 0.46, 0.4) * major * majorFade;
          float alpha = clamp(minor * minorFade * 0.28 + major * majorFade * 0.5, 0.0, 0.65);
          float disk = 1.0 - smoothstep(40.0, 200.0, length(vWorld.xz));
          gl_FragColor = vec4(col, alpha * disk);
        }
      `}),Oe=new M(new v(440,440),De);Oe.rotation.x=-Math.PI/2,Oe.position.y=-.099,a.add(Oe);let F=/Android/i.test(navigator.userAgent)||(navigator.deviceMemory??8)<=4,I=[],L=F?4:8;for(let e=0;e<L;e+=1){let e=new ne(`#d7fff4`,0,56,Math.PI/3.1,.7,1.35),t=new u;e.target=t,e.castShadow=!1,e.visible=!0,e.intensity=0,a.add(e,t),I.push(e)}let R=new le(E);R.userData.shared=!0;let z=new se({color:i.brass,transparent:!0,opacity:.95,toneMapped:!1,fog:!1});z.userData.shared=!0;let Ae=[],je=e=>{for(;Ae.length<e.length;){let e=new Se(R,z);e.frustumCulled=!1,e.raycast=()=>void 0,a.add(e),Ae.push(e)}Ae.forEach((t,n)=>{let r=e[n];if(!r){t.visible=!1;return}let i=lt(r.model,A.current.view.explode);t.visible=!0,t.position.copy(r.group.position),t.scale.set((r.model.width+.7)*J,(i+.55)*J,(r.model.depth+.7)*J)})},B=F?null:new Ue(n,new x(1,1,{type:ue})),Me=B?new Ke(new w(256,256),.42,.62,.78):null;B&&Me&&(B.addPass(new We(a,b)),B.addPass(Me),B.addPass(new qe),B.addPass(new Ve(st)));let Ne=()=>{let e=t.getBoundingClientRect(),r=Math.max(1,Math.round(e.width||t.clientWidth||1)),i=Math.max(1,Math.round(e.height||t.clientHeight||1));if(F){let e=Math.max(r,i);if(e>1280){let t=1280/e;r=Math.max(1,Math.round(r*t)),i=Math.max(1,Math.round(i*t))}}let a=r*i>12e5||F?1:r<700?1.15:1.25,o=Math.min(window.devicePixelRatio||1,a);b.aspect=(e.width||r)/Math.max(1,e.height||i),b.fov=(e.width||r)<700?50:38,b.updateProjectionMatrix(),n.setPixelRatio(o),n.setSize(r,i,!1),B&&Me&&(B.setPixelRatio(o),B.setSize(r+2,i+2),B.setSize(r,i),Me.strength=(e.width||r)<700?.3:.42)},Pe=!1,Fe=()=>{Pe=!0},Ie=()=>{Pe=!1,Ne(),U=``,W=!0};n.domElement.addEventListener(`webglcontextlost`,Fe),n.domElement.addEventListener(`webglcontextrestored`,Ie);let Le=()=>{document.visibilityState===`visible`&&window.setTimeout(()=>{let e=n.getContext();!e||e.isContextLost()||Pe?A.current.onGpuLost?.():(Ne(),U=``,W=!0)},60)};document.addEventListener(`visibilitychange`,Le),window.addEventListener(`pageshow`,Le);let V=[],Re=[],ze=``,H=``,U=``,Be=``,W=!0,G=!1,K=!1,He=18,Ge=1,q=1,Je=0,Ye=0,tt=0,nt=e=>{e.detail&&(vt(e.detail),e.group.remove(e.detail),e.detail=null,e.quiet=null,e.shell=null,e.tunnel=null,e.pathMesh=null,e.markerMesh=null,e.markers=[],e.enter=null,e.leave=null,e.ghost.visible=!0)},rt=e=>{nt(e);let t=e.model;if(ct(t)===0)return;let n=new de,r=pt(t.walls.quiet,ft(`#07141a`,`#1a4a42`,.02,2.8,F)),a=pt(t.walls.shell,ft(`#0c2420`,`#3ecfb2`,.08,2.2,F)),o=pt(t.walls.corridor,ft(`#123830`,`#7dffe8`,.22,1.7,F));n.add(r,a,o);let s=Math.max(1,t.path.length-1),c=new xe(new be(1,1,1,F?5:8,1,!0),mt(2.15,F),s);c.count=Math.max(0,t.path.length-1),c.frustumCulled=!1,c.raycast=()=>void 0,n.add(c);let l=t.path.map((e,t)=>({node:e,index:t})).filter(e=>e.node.events.length>0),u=new xe(new te(1,0),mt(2.7,F),Math.max(1,l.length));u.count=l.length,u.frustumCulled=!1,l.forEach((e,t)=>u.setColorAt(t,Q.set(gt(e.node)))),u.instanceColor&&(u.instanceColor.needsUpdate=!0),n.add(u);let f=new d({color:i.verdigris,emissive:i.verdigris,emissiveIntensity:3.2,roughness:.25,metalness:.4}),ee=new d({color:i.coral,emissive:i.coral,emissiveIntensity:3.2,roughness:.25,metalness:.4}),p=new h(.46,.02,16,48),m=new h(.3,.01,12,40),g=new de,_=new de;g.add(new M(p,f)),g.add(new M(m,new d({color:i.bone,emissive:i.verdigris,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),F||g.add(ht(i.verdigris)),_.add(new M(p.clone(),ee)),_.add(new M(m.clone(),new d({color:i.bone,emissive:i.coral,emissiveIntensity:2.2,transparent:!0,opacity:.9}))),F||_.add(ht(i.coral));for(let e of[...g.children,..._.children])e.raycast=()=>void 0;n.add(g,_),e.group.add(n),e.detail=n,e.quiet=r,e.shell=a,e.tunnel=o,e.pathMesh=c,e.markerMesh=u,e.markers=l,e.enter=g,e.leave=_,e.ghost.visible=!1},it=e=>{let t=new de,n=new M(E,D);n.raycast=()=>void 0;let r=new M(E,O);r.userData.cubeId=e.id;let o=Math.max(2,e.model.path.length),s=new oe;s.setAttribute(`position`,new fe(new Float32Array(o*3),3)),s.setAttribute(`color`,new fe(new Float32Array(o*3),3));let c=new Ce(s,k);c.raycast=()=>void 0;let l=new d({color:i.brass,emissive:i.brass,emissiveIntensity:2.4,roughness:.2,metalness:.35}),u=new M(new re(.16,20,20),l);u.raycast=()=>void 0;let f=new C({color:i.brass,transparent:!0,opacity:.22,depthWrite:!1,blending:2,toneMapped:!1}),p=new M(new re(.16,12,12),f);p.raycast=()=>void 0;let m=new ee({color:i.brass,transparent:!0,opacity:.8,depthWrite:!1,blending:2,toneMapped:!1}),h=new ie(m);return h.scale.set(1.1,1.1,1),h.raycast=()=>void 0,u.add(h),t.add(n,r,c,u,p),a.add(t),{id:e.id,model:e.model,group:t,ghost:n,pick:r,pathLine:c,traveler:u,halo:p,detail:null,quiet:null,shell:null,tunnel:null,pathMesh:null,markerMesh:null,markers:[],enter:null,leave:null,travelerMat:l,haloMat:f,flareMat:m,slot:e.slot}},at=()=>{for(let e of V)nt(e),vt(e.group),a.remove(e.group);V=[]},ot=()=>{let e=Math.max(16*J,He*Math.max(Ge,q)*.9);b.position.set(Je+e*.62,Ye+Math.max(6*J,e*.42),tt+e*.78),T.target.set(Je,Ye,tt),T.minDistance=.04,T.maxDistance=Math.max(8,e*40),b.far=Math.max(80,e*80),b.near=Math.max(.001,e/120),b.updateProjectionMatrix(),o.density=.045},ut=t=>{let n=e(t.model.width,t.model.height,t.model.depth,A.current.view.explode),r=Math.max(16,n*.95)*J,i=t.group.position;b.position.set(i.x+r*.62,i.y+Math.max(6*J,r*.42),i.z+r*.78),T.target.set(i.x,i.y,i.z),T.minDistance=.04,T.maxDistance=Math.max(8,r*48),b.far=Math.max(80,r*90),b.near=Math.max(.001,r/120),b.updateProjectionMatrix(),o.density=.045},yt=t=>{let n=V.map(n=>e(n.model.width,n.model.height,n.model.depth,t.explode)),i=8;for(let e of n)e>i&&(i=e);let a=i+.65,o=i*.9,s={stack:0,x:0,y:0,z:0,nx:1,ny:1,nz:1},c=[],l=new Map;for(let e of V){let t=e.slot??s;l.has(t.stack)||(l.set(t.stack,{nx:Math.max(1,t.nx||1),ny:Math.max(1,t.ny||1),nz:Math.max(1,t.nz||1)}),c.push(t.stack))}c.sort((e,t)=>e-t);let u=c.map(e=>l.get(e).nx*a),d=0,f=new Map;c.forEach((e,t)=>{f.set(e,d),d+=u[t]+o});let ee=c.length?-(d-o)/2:0,p=1/0,m=-1/0,h=1/0,g=-1/0,_=1/0,v=-1/0;V.forEach(e=>{let n=e.slot??s,i=f.get(n.stack)??0,o=(ee+i+n.x*a)*J,c=n.y*a*J,l=n.z*a*J;e.group.position.set(o,c,l),e.group.scale.setScalar(J),p=Math.min(p,o),m=Math.max(m,o),h=Math.min(h,c),g=Math.max(g,c),_=Math.min(_,l),v=Math.max(v,l);let u=lt(e.model,t.explode);e.ghost.scale.set(e.model.width,u,e.model.depth),e.pick.scale.copy(e.ghost.scale);let d=e.pathLine.geometry.getAttribute(`position`),y=e.pathLine.geometry.getAttribute(`color`),te=Math.max(1,e.model.path.length-1),b=d.count;if(e.model.path.forEach((n,i)=>{if(i>=b)return;let[a,o,s]=r(n.x,n.y,n.z,t.explode,e.model);d.setXYZ(i,a,o,s),Q.copy(Qe).lerp($e,te<=1?0:i/(te-1)).multiplyScalar(1.7),y.setXYZ(i,Q.r,Q.g,Q.b)}),d.needsUpdate=!0,y.needsUpdate=!0,e.pathLine.visible=t.path,e.quiet&&e.shell&&e.tunnel&&e.pathMesh&&e.enter&&e.leave){let n=t.floor>=0&&t.floor>=e.model.height?-1:t.floor;dt(e.quiet,e.model.walls.quiet,e.model,t.explode,n),dt(e.shell,e.model.walls.shell,e.model,t.explode,n),dt(e.tunnel,e.model.walls.corridor,e.model,t.explode,n),e.quiet.visible=t.maze&&e.model.walls.quiet.length>0,e.shell.visible=t.shell&&e.model.walls.shell.length>0,e.tunnel.visible=t.tunnel&&e.model.walls.corridor.length>0;let i=Math.min(e.model.path.length-1,e.pathMesh.count);for(let n=0;n<i;n+=1){let a=e.model.path[n],o=e.model.path[n+1];X.set(...r(a.x,a.y,a.z,t.explode,e.model)),Xe.set(...r(o.x,o.y,o.z,t.explode,e.model)),Z.subVectors(Xe,X);let s=Z.length();Y.position.copy(X).addScaledVector(Z,.5),Y.quaternion.identity(),!t.path||s<1e-4?Y.scale.set(0,0,0):(Z.multiplyScalar(1/s),Y.quaternion.setFromUnitVectors(Ze,Z),Y.scale.set(.072,s,.072)),Y.updateMatrix(),e.pathMesh.setMatrixAt(n,Y.matrix),Q.copy(Qe).lerp($e,i<=1?0:n/(i-1)),e.pathMesh.setColorAt(n,Q)}e.pathMesh.instanceMatrix.needsUpdate=!0,e.pathMesh.instanceColor&&(e.pathMesh.instanceColor.needsUpdate=!0),e.pathMesh.visible=t.path,e.markers.forEach((n,i)=>{let[a,o,s]=r(n.node.x,n.node.y,n.node.z,t.explode,e.model);Y.position.set(a,o,s),Y.quaternion.identity(),Y.scale.setScalar(.2),Y.updateMatrix(),e.markerMesh?.setMatrixAt(i,Y.matrix)}),e.markerMesh&&(e.markerMesh.instanceMatrix.needsUpdate=!0);let[a,o,s]=r(e.model.entrance.x,e.model.entrance.y,e.model.entrance.z,t.explode,e.model);e.enter.position.set(a,o,s-.78);let[c,l,u]=r(e.model.exit.x,e.model.exit.y,e.model.exit.z,t.explode,e.model);e.leave.position.set(c,l,u+.78)}});let y=Number.isFinite(p)&&Number.isFinite(m),te=y?m-p+i*J:a*J,b=y?g-h+i*J:a*J,x=y?v-_+i*J:a*J;y&&(Je=(p+m)/2,Ye=(h+g)/2,tt=(_+v)/2);let S=a*J,C=Math.max(1,te/S),ne=Math.max(1,b/S,x/S);He=S,Ge=C,q=ne;let re=new Map;for(let e of V){let t=e.group.position,n=Math.round(t.x/8),r=Math.round(t.y/8),i=Math.round(t.z/8),a=`${n}:${r}:${i}`,o=re.get(a)??{x:n*8,y:r*8,z:i*8,n:0};o.n+=1,re.set(a,o)}let ie=[...re.values()].sort((e,t)=>t.n-e.n||e.x*e.x+e.z*e.z+e.y*e.y-(t.x*t.x+t.z*t.z+t.y*t.y)).slice(0,I.length),w=Math.min(1,Math.max(0,t.lights||0)),T=ie.length>1?1/Math.sqrt(ie.length):1,E=w*5.5*T;for(let e=0;e<8;e+=1){let t=ie[e];if(!t||w<=.001){P[e]=0;continue}N[e].set(t.x,t.z),P[e]=w*T*.8}I.forEach((e,t)=>{let n=ie[t];if(!n||w<=.001){e.intensity=0;return}let r=Math.hypot(n.x,n.z),i=r<.05?5.6:n.x/r*8*.7,a=r<.05?0:n.z/r*8*.7;e.intensity=E,e.position.set(n.x+i,n.y+5.2,n.z+a),e.target.position.set(n.x,n.y,n.z)}),Te.uniforms.gain.value=P;let ae=new Set(A.current.selectedIds),oe=V.filter(e=>ae.has(e.id));if(je(oe),G){if(G=!1,K){K=!1;let e=V.find(e=>e.id===A.current.selectedId)??V[V.length-1];e?ut(e):ot()}else ot()}},bt=()=>{let e=n.getContext();if(!e||e.isContextLost()||Pe||document.visibilityState===`hidden`)return;let t=A.current.cubes,r=t.map(e=>e.id).join(`|`);if(r===ze?Re.length||t.forEach(e=>{let t=V.find(t=>t.id===e.id);t&&(t.model=e.model,t.slot=e.slot)}):(at(),Re=t.slice(),ze=r,U=``,W=!0,K=!0,G=!1),Re.length){let e=Re.splice(0,F?1:3);for(let t of e)V.push(it(t));W=!0;return}K&&(G=!0,W=!0);let i=t.length<=1,a=t.map(e=>`${e.id}:${i||e.id===A.current.selectedId?ct(e.model):0}`).join(`|`);if(a!==U){for(let e of V)(i||e.id===A.current.selectedId)&&ct(e.model)>0?e.detail||rt(e):nt(e);U=a,W=!0}},xt=A.current.resetToken,St=0,Ct=0,wt=new _e,Tt=()=>Ne();Tt();let Et=new ResizeObserver(Tt);Et.observe(t);let Dt=()=>{S.current=null,A.current.onInteract()};T.addEventListener(`start`,Dt);let Ot=()=>{for(let e of V){if(!e.markerMesh)continue;let t=et.intersectObject(e.markerMesh,!1)[0];if(t?.instanceId!=null&&e.markers[t.instanceId])return{id:e.id,index:e.markers[t.instanceId].index}}return null},kt=()=>{let e=et.intersectObjects(V.map(e=>e.pick),!1)[0]?.object.userData.cubeId;return typeof e==`string`?e:null},At=0,jt=0,Mt=e=>{At=e.clientX,jt=e.clientY},Nt=e=>{if(Math.hypot(e.clientX-At,e.clientY-jt)>6)return;let t=n.domElement.getBoundingClientRect();$.x=(e.clientX-t.left)/t.width*2-1,$.y=-((e.clientY-t.top)/t.height)*2+1,et.setFromCamera($,b);let r=Ot();if(r){A.current.onPick(r.id,r.index);return}A.current.onSelect(kt()??``)},Pt=e=>{let t=n.domElement.getBoundingClientRect();$.x=(e.clientX-t.left)/t.width*2-1,$.y=-((e.clientY-t.top)/t.height)*2+1,et.setFromCamera($,b),n.domElement.style.cursor=Ot()||kt()?`pointer`:``};n.domElement.addEventListener(`pointerdown`,Mt),n.domElement.addEventListener(`pointerup`,Nt),n.domElement.addEventListener(`pointermove`,Pt);let Ft=0,It=!1,Lt=!1,Rt=e=>{Ft=requestAnimationFrame(Rt);try{wt.update(e);let t=Math.min(wt.getDelta(),.05);Ct+=t;let i=A.current;bt();let o=i.selectedIds.join(`|`);o!==H&&(H=o,W=!0);let s=_t(i.view);(s!==Be||W)&&(Be=s,W=!1,yt(i.view)),i.resetToken!==xt&&(xt=i.resetToken,xt>0&&ot()),T.autoRotate=i.autoRotate;let c=S.current;if(c){c.age+=t;let e=V.find(e=>e.id===c.id);e&&(X.set(c.x,c.y,c.z).add(e.group.position),T.target.lerp(X,1-Math.exp(-6*t))),c.age>.85&&(S.current=null)}let u=Math.max(1,m.current.from),d=Math.max(u,m.current.to),ee=p.current;V.forEach((e,n)=>{let a=n+1,o=ee&&a>=u&&a<=d||!ee&&f.current&&e.id===i.selectedId,s=Math.max(1,e.model.path.length-1),c=l.current[e.id]??0;o&&(c+=t*28,c>=s&&(c=0),l.current[e.id]=c,e.id===i.selectedId&&(St+=t,St>=.08&&(St=0,i.onHud(c))));let p=Math.max(0,Math.min(s,c)),m=Math.floor(p),h=p-m,g=e.model.path[m],_=e.model.path[Math.min(m+1,e.model.path.length-1)];if(!g||!_)return;X.set(...r(g.x,g.y,g.z,i.view.explode,e.model)),Xe.set(...r(_.x,_.y,_.z,i.view.explode,e.model)),Z.copy(X).lerp(Xe,h),e.traveler.position.copy(Z),e.halo.position.copy(Z);let v=1.55+Math.sin(Ct*3.2+n)*.16;e.halo.scale.setScalar(v);let y=gt(g.events[0]?g:_.events[0]&&h>.65?_:g);e.travelerMat.color.set(y),e.travelerMat.emissive.set(y),e.flareMat.color.set(y),e.haloMat.color.set(y)}),z.opacity=.72+Math.sin(Ct*2.4)*.2,T.update();try{let e=n.getContext();if(!e||e.isContextLost())return;B?B.render(t):n.render(a,b)}catch{let e=n.getContext();e&&!e.isContextLost()&&n.render(a,b)}It||(It=!0,n.domElement.style.opacity=`1`,A.current.onReady?.())}catch(e){Lt||(Lt=!0,console.error(e))}};return Ft=requestAnimationFrame(Rt),()=>{cancelAnimationFrame(Ft),Et.disconnect(),document.removeEventListener(`visibilitychange`,Le),window.removeEventListener(`pageshow`,Le),n.domElement.removeEventListener(`webglcontextlost`,Fe),n.domElement.removeEventListener(`webglcontextrestored`,Ie),T.removeEventListener(`start`,Dt),T.dispose(),n.domElement.removeEventListener(`pointerdown`,Mt),n.domElement.removeEventListener(`pointerup`,Nt),n.domElement.removeEventListener(`pointermove`,Pt),at(),vt(a),E.dispose(),R.dispose(),D.dispose(),O.dispose(),k.dispose(),z.dispose(),B?.dispose(),n.dispose(),n.domElement.remove()}},[S,f,p,m,l]),(0,Je.jsx)(`div`,{ref:pe,className:`h-full w-full`})});export{yt as CubeCanvas};