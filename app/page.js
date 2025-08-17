'use client'

import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import * as THREE from 'three'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Html, useProgress } from '@react-three/drei'
import { HexColorPicker, HexColorInput } from 'react-colorful'

/* ---------- Ikony + preload ---------- */
const ICONS = {
  eye: '/icons/Eye.png',
  eyeOff: '/icons/Eye-off.png',
  arrowClosed: '/icons/Arrow-closed.svg',
  arrowOpen: '/icons/Arrow-open.svg',
  bulb: '/icons/Bulb.png',
  flashlight: '/icons/Flashlight.png',
}

function PreloadIcons() {
  useEffect(() => {
    Object.values(ICONS).forEach((src) => {
      const img = new Image()
      img.decoding = 'async'
      img.src = src
    })
  }, [])
  return null
}

/* ---------- Jednotný color picker (popover) ---------- */
function ColorSwatch({ color, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const onDocClick = (e) => {
      if (open && containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        aria-label={ariaLabel || 'color picker'}
        onClick={() => setOpen((v) => !v)}
        className="swatch-btn"
        style={{
          width: 36, height: 22,
          borderRadius: 4,
          border: '1px solid #fff',
          background: color,
          cursor: 'pointer',
          boxShadow: '0 0 0 1px rgba(0,0,0,.25) inset',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 28,
            left: 0,
            background: 'rgba(0,0,0,.92)',
            padding: 12,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.18)',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 6px 24px rgba(0,0,0,.35)',
          }}
        >
          <HexColorPicker color={color} onChange={onChange} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ color: '#fff', fontSize: 12 }}>#</span>
            <HexColorInput
              color={color}
              onChange={onChange}
              prefixed={false}
              style={{
                width: 90,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #444',
                background: '#111',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- 3D model ---------- */
function Model({ url, color, opacity, visible, onLoaded }) {
  const obj = useLoader(OBJLoader, url)

  useEffect(() => {
    if (obj && onLoaded) onLoaded(obj)
  }, [obj, onLoaded])

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    transparent: opacity < 1,
    opacity,
    metalness: 0.5,
    roughness: 0.5,
    side: THREE.DoubleSide,
    depthWrite: opacity === 1,
  })

  obj.traverse((child) => {
    if (child.isMesh) child.material = material
  })

  return visible ? <primitive object={obj} /> : null
}

/* ---------- Ovládání kamery ---------- */
function TouchTrackballControls() {
  const { camera, gl } = useThree()
  const controlsRef = useRef(null)

  useEffect(() => {
    const controls = new TrackballControls(camera, gl.domElement)
    controls.rotateSpeed = 5.0
    controls.zoomSpeed = 1.2
    controls.panSpeed = 1.0
    controls.staticMoving = true
    controlsRef.current = controls

    const handleTouchStart = (event) => {
      event.preventDefault()
      controls.handleTouchStart(event)
    }
    const handleTouchMove = (event) => {
      event.preventDefault()
      controls.handleTouchMove(event)
    }

    gl.domElement.addEventListener('touchstart', handleTouchStart, { passive: false })
    gl.domElement.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      gl.domElement.removeEventListener('touchstart', handleTouchStart)
      gl.domElement.removeEventListener('touchmove', handleTouchMove)
      controls.dispose()
    }
  }, [camera, gl])

  useFrame(() => {
    if (controlsRef.current && camera.isOrthographicCamera) {
      controlsRef.current.panSpeed = camera.zoom * 0.4
      controlsRef.current.update()
    }
  })

  return null
}

/* ---------- Loader ---------- */
function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div
        style={{
          background: 'rgba(0,0,0,0.7)',
          padding: '20px 40px',
          borderRadius: '10px',
          color: 'white',
          fontFamily: 'sans-serif',
          fontSize: '18px',
        }}
      >
        ⏳ Načítání modelů: {Math.round(progress)} %
      </div>
    </Html>
  )
}

/* ---------- Auto-fit kamery (jednorázově) ---------- */
function FitCameraOnLoad({
  objects,
  expectedCount = 3,
  margin = 1.2,
  isMobile = false,
  desktopScale = 0.40,
  mobileScale = 1.0,
}) {
  const { camera, size } = useThree()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    if (!objects || objects.length < expectedCount) return

    const box = new THREE.Box3()
    objects.forEach((obj) => box.expandByObject(obj))
    if (box.isEmpty()) return

    const center = new THREE.Vector3()
    const dims = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(dims)

    camera.position.set(center.x, center.y, camera.position.z)

    const objW = Math.max(dims.x, 1e-6)
    const objH = Math.max(dims.y, 1e-6)
    const zoomX = size.width / (objW * margin)
    const zoomY = size.height / (objH * margin)
    let newZoom = Math.min(zoomX, zoomY)

    newZoom *= isMobile ? mobileScale : desktopScale
    camera.zoom = Math.max(newZoom, 0.01)
    camera.updateProjectionMatrix()

    fitted.current = true
  }, [objects, expectedCount, margin, isMobile, desktopScale, mobileScale, camera, size.width, size.height])

  return null
}

/* ---------- Page ---------- */
export default function Page() {
  const [color1, setColor1] = useState('#f5f5dc')
  const [color2, setColor2] = useState('#f5f5dc')
  const [color3, setColor3] = useState('#ffffff')

  const [opacity1, setOpacity1] = useState(1)
  const [opacity2, setOpacity2] = useState(1)
  const [opacity3, setOpacity3] = useState(1)

  const [visible1, setVisible1] = useState(true)
  const [visible2, setVisible2] = useState(true)
  const [visible3, setVisible3] = useState(true)

  const [lightIntensity, setLightIntensity] = useState(1)
  const [lightPos1, setLightPos1] = useState({ x: 0, y: 5, z: 5 })
  const [lightPos2, setLightPos2] = useState({ x: -10, y: 0, z: 0 })
  const [lightPos3, setLightPos3] = useState({ x: 10, y: 0, z: 0 })
  const [lightPos4, setLightPos4] = useState({ x: 0, y: -5, z: -5 })

  const [showLights, setShowLights] = useState(false)
  const [loadedObjects, setLoadedObjects] = useState([])

  // jemné skrytí panelu do první repaint
  const [uiReady, setUiReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setUiReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
    const narrow = typeof window !== 'undefined' && window.innerWidth < 768
    setIsMobile(uaMobile || coarse || narrow)
  }, [])

  const handleModelLoaded = (obj) => {
    setLoadedObjects((prev) => (prev.includes(obj) ? prev : [...prev, obj]))
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PreloadIcons />

      <div
        className="controls-panel"
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1,
          color: 'white',
          fontFamily: 'sans-serif',
          fontSize: '14px',
          ['--slider-width']: '180px',
          opacity: uiReady ? 1 : 0,
          transition: 'opacity .12s ease',
        }}
      >
        {/* Upper */}
        <div className="control-row">
          <div className="row-label">Upper:</div>
          <ColorSwatch color={color1} onChange={setColor1} ariaLabel="Upper color" />
          <input
            className="slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity1}
            onChange={(e) => setOpacity1(parseFloat(e.target.value))}
          />
          <button
            className={`toggle icon-btn ${visible1 ? 'is-on' : 'is-off'}`}
            onClick={() => setVisible1(!visible1)}
            aria-label={visible1 ? 'Hide Upper' : 'Show Upper'}
          >
            <img src={ICONS.eye}    alt="" className="icon-img icon-on"  width="20" height="20" style={{width:20,height:20}} loading="eager" decoding="async" />
            <img src={ICONS.eyeOff} alt="" className="icon-img icon-off" width="20" height="20" style={{width:20,height:20}} loading="eager" decoding="async" />
          </button>
        </div>

        {/* Lower */}
        <div className="control-row">
          <div className="row-label">Lower:</div>
          <ColorSwatch color={color2} onChange={setColor2} ariaLabel="Lower color" />
          <input
            className="slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity2}
            onChange={(e) => setOpacity2(parseFloat(e.target.value))}
          />
        <button
            className={`toggle icon-btn ${visible2 ? 'is-on' : 'is-off'}`}
            onClick={() => setVisible2(!visible2)}
            aria-label={visible2 ? 'Hide Lower' : 'Show Lower'}
          >
            <img src={ICONS.eye}    alt="" className="icon-img icon-on"  width="20" height="20" style={{width:20,height:20}} loading="eager" decoding="async" />
            <img src={ICONS.eyeOff} alt="" className="icon-img icon-off" width="20" height="20" style={{width:20,height:20}} loading="eager" decoding="async" />
          </button>
        </div>

        {/* Waxup */}
        <div className="control-row">
          <div className="row-label">Bridge:</div>
          <ColorSwatch color={color3} onChange={setColor3} ariaLabel="Waxup color" />
          <input
            className="slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity3}
            onChange={(e) => setOpacity3(parseFloat(e.target.value))}
          />
          <button
            className={`toggle icon-btn ${visible3 ? 'is-on' : 'is-off'}`}
            onClick={() => setVisible3(!visible3)}
            aria-label={visible3 ? 'Hide Waxup' : 'Show Waxup'}
          >
            <img src={ICONS.eye}    alt="" className="icon-img icon-on"  width="20" height="20" style={{width:20,height:20}} loading="eager" decoding="async" />
            <img src={ICONS.eyeOff} alt="" className="icon-img icon-off" width="20" height="20" style={{width:20,height:20}} loading="eager" decoding="async" />
          </button>
        </div>

        {/* Toggle Světla (arrow animace) */}
        <button
          className={`toggle arrow-toggle ${showLights ? 'is-open' : 'is-closed'}`}
          onClick={() => setShowLights(!showLights)}
          aria-label="Toggle lights panel"
          style={{ marginTop: '10px' }}
        >
          <span className="arrow-stack" aria-hidden>
            <img
              src={ICONS.arrowClosed}
              className="arrow-img arrow-closed"
              width="16" height="16" style={{width:16,height:16}}
              loading="eager" decoding="async" alt=""
            />
            <img
              src={ICONS.arrowOpen}
              className="arrow-img arrow-open"
              width="16" height="16" style={{width:16,height:16}}
              loading="eager" decoding="async" alt=""
            />
          </span>
          <span className="arrow-label">Světla</span>
        </button>

        {showLights && (
          <div style={{ marginTop: '8px' }}>
            {/* Light intensity */}
            <div className="lights-row">
              <img src={ICONS.bulb} alt="" className="icon-inline" width="16" height="16" style={{width:16,height:16}} loading="eager" decoding="async" />
              <span>Light Intensity</span>
            </div>
            <div className="axis-row">
              <span className="axis-label" aria-hidden="true">&nbsp;</span>
              <input
                className="slider"
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={lightIntensity}
                onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
              />
            </div>

            {/* Pozice světel */}
            {[
              { label: 'Light 1 Position', pos: lightPos1, setPos: setLightPos1 },
              { label: 'Light 2 Position', pos: lightPos2, setPos: setLightPos2 },
              { label: 'Light 3 Position', pos: lightPos3, setPos: setLightPos3 },
              { label: 'Light 4 Position', pos: lightPos4, setPos: setLightPos4 },
            ].map((light, idx) => (
              <div key={idx} style={{ marginTop: '10px' }}>
                <div className="lights-row">
                  <img src={ICONS.flashlight} alt="" className="icon-inline" width="16" height="16" style={{width:16,height:16}} loading="eager" decoding="async" />
                  <span>{light.label}</span>
                </div>
                {['x','y','z'].map((axis) => (
                  <div className="axis-row" key={axis}>
                    <span className="axis-label">{axis.toUpperCase()}:</span>
                    <input
                      className="slider"
                      type="range"
                      min={-10}
                      max={10}
                      step={0.1}
                      value={light.pos[axis]}
                      onChange={(e) => light.setPos({ ...light.pos, [axis]: parseFloat(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <Canvas orthographic camera={{ position: [0, 0, 100] }}>
        <ambientLight intensity={lightIntensity * 0.4} />
        <directionalLight position={[lightPos1.x, lightPos1.y, lightPos1.z]} intensity={lightIntensity * 1.5} />
        <directionalLight position={[lightPos2.x, lightPos2.y, lightPos2.z]} intensity={lightIntensity * 1.0} />
        <directionalLight position={[lightPos3.x, lightPos3.y, lightPos3.z]} intensity={lightIntensity * 1.2} />
        <directionalLight position={[lightPos4.x, lightPos4.y, lightPos4.z]} intensity={lightIntensity * 0.8} />

        <Suspense fallback={<Loader />}>
          <Model url="/models/Upper.obj" color={color1} opacity={opacity1} visible={visible1} onLoaded={handleModelLoaded} />
          <Model url="/models/Lower.obj" color={color2} opacity={opacity2} visible={visible2} onLoaded={handleModelLoaded} />
          <Model url="/models/Crown21.obj" color={color3} opacity={opacity3} visible={visible3} onLoaded={handleModelLoaded} />
        </Suspense>

        <FitCameraOnLoad
          objects={loadedObjects}
          expectedCount={3}
          margin={1.2}
          isMobile={isMobile}
          desktopScale={0.40}
          mobileScale={1.0}
        />

        <TouchTrackballControls />
      </Canvas>

      {/* Styly UI */}
      <style jsx global>{`
        .slider {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          width: var(--slider-width, 140px);
          height: 14px;
          background: transparent;
          margin: 5px 0;
          display: inline-block;
        }
        .slider::-webkit-slider-runnable-track {
          height: 4px;
          background: white;
          border-radius: 2px;
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 0 2px black;
          margin-top: -5px;
        }
        .slider::-moz-range-track {
          height: 4px;
          background: white;
          border-radius: 2px;
        }
        .slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 0 2px black;
          border: none;
        }

        .toggle {
          background: transparent;
          border: 1px solid white;
          border-radius: 6px;
          padding: 6px 10px;
          color: white;
          cursor: pointer;
          font-size: 14px;
        }

        .icon-btn {
          position: relative;
          width: 28px;
          height: 24px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          margin-left: 4px;
        }
        .icon-img {
          position: absolute;
          inset: 0;
          width: 20px;
          height: 20px;
          margin: auto;
          display: block;
          filter: drop-shadow(0 0 2px rgba(0,0,0,.5));
          user-select: none;
          pointer-events: none;
          opacity: 0;
          transition: opacity .06s linear;
        }
        .icon-btn.is-on  .icon-on  { opacity: 1; }
        .icon-btn.is-off .icon-off { opacity: 1; }

        /* Arrow toggle (fade + jemná rotace/scale) */
        .arrow-toggle {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border: 1px solid white;
          border-radius: 6px;
          background: transparent;
          color: white;
          cursor: pointer;
          overflow: hidden;
        }
        .arrow-stack {
          position: relative;
          width: 16px;
          height: 16px;
          display: inline-block;
        }
        .arrow-img {
          position: absolute;
          left: 0; top: 0;
          width: 16px;
          height: 16px;
          opacity: 0;
          transform: rotate(-90deg) scale(0.85);
          transition: opacity .16s ease, transform .22s cubic-bezier(.2,.7,.2,1);
          filter: drop-shadow(0 0 1px rgba(0,0,0,.4));
          pointer-events: none;
        }
        .arrow-toggle.is-closed .arrow-closed { opacity: 1; transform: rotate(0deg) scale(1); }
        .arrow-toggle.is-open   .arrow-open   { opacity: 1; transform: rotate(0deg) scale(1); }
        .arrow-label { padding-left: 2px; }

        .controls-panel {
          backdrop-filter: blur(3px);
          background: rgba(0,0,0,.25);
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 8px;
          padding: 10px 12px;
          --slider-width: 180px;
          width: max-content;
        }
        .control-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 6px 0;
        }
        .row-label {
          width: 60px;
        }
        .axis-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 4px 0;
        }
        .axis-label {
          width: 18px;
          text-align: right;
          color: #fff;
          opacity: .9;
        }
        .axis-row .slider {
          flex: 0 0 var(--slider-width, 140px);
          width: var(--slider-width, 140px);
        }

        .lights-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .icon-inline {
          width: 16px;
          height: 16px;
          display: inline-block;
          filter: drop-shadow(0 0 1px rgba(0,0,0,.5));
          user-select: none;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
