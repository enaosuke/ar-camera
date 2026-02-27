/**
 * AR キャンバス用 composable
 * PixiJS でカメラ映像＋フレーム（スタンプ）を合成し、ドラッグ・拡大縮小・回転・ピンチ操作を扱う
 */
import { ref, onUnmounted, watch, unref } from 'vue'
import { Application, Sprite, Container, Texture, VideoResource, Graphics } from 'pixi.js'
import { isMobile } from '../utils/camera'

const TRANSFORM_HANDLE_SIZE = 44
const CIRCLE_PADDING = 4
const FRAME_GRID_SPACING = 0.28
const FRAME_MAX_WIDTH_RATIO = 0.45
const FRAME_SCALE_FACTOR = 0.85
const HANDLE_ICON_SIZE_RATIO = 0.85

function createSmoothCircleTexture(radius) {
  const size = Math.ceil(radius * 2 + CIRCLE_PADDING * 2)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2)
  ctx.fill()
  return Texture.from(canvas)
}

function clientToStage(canvas, clientX, clientY) {
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

export function useArCanvas(videoEl, containerRef, frameUrls, transformIconUrl) {
  const app = ref(null)
  const cameraSprite = ref(null)
  const framesContainer = ref(null)
  const frameSprites = ref([])
  const currentDrag = ref(null)

  let videoTexture = null
  let tickerBinding = null
  let nextZIndex = 0
  let pointerHandlersAttached = false
  let boundPointerDown = null
  let boundPointerMove = null
  let boundPointerUp = null
  let boundTouchMove = null
  let boundTouchEnd = null

  function getVideoTexture() {
    if (!videoEl.value || !app.value) return null
    if (videoTexture) return videoTexture
    const resource = new VideoResource(videoEl.value, { autoUpdate: true })
    const texture = Texture.from(resource)
    videoTexture = texture
    return texture
  }

  function updateCameraSprite() {
    const texture = getVideoTexture()
    if (!texture || !cameraSprite.value || !app.value) return
    cameraSprite.value.texture = texture
    const view = app.value.renderer.view
    const w = view.width
    const h = view.height
    const vid = videoEl.value
    let vw = vid.videoWidth
    let vh = vid.videoHeight
    if (!vw || !vh) {
      vw = w
      vh = h
    }
    const scale = Math.max(w / vw, h / vh)
    cameraSprite.value.width = vw * scale
    cameraSprite.value.height = vh * scale
    cameraSprite.value.x = (w - cameraSprite.value.width) / 2
    cameraSprite.value.y = (h - cameraSprite.value.height) / 2
  }

  function getStageCoords(ev) {
    const clientX = ev?.clientX ?? ev?.touches?.[0]?.clientX
    const clientY = ev?.clientY ?? ev?.touches?.[0]?.clientY
    const canvas = app.value?.renderer?.view
    return clientToStage(canvas, clientX, clientY)
  }

  function drawBorderRect(g, x, y, w, h) {
    g.lineStyle({ width: 2, color: 0xffffff })
    g.moveTo(x, y)
    g.lineTo(x + w, y)
    g.lineTo(x + w, y + h)
    g.lineTo(x, y + h)
    g.closePath()
  }

  function createFrameContainer(frameTexture, index, transformTexture) {
    const container = new Container()
    container.eventMode = 'none'
    container.sortableChildren = true

    const sprite = new Sprite(frameTexture)
    sprite.anchor.set(0.5)
    sprite.eventMode = 'none'
    sprite.zIndex = 0
    container.addChild(sprite)

    const borderGraphics = new Graphics()
    borderGraphics.zIndex = 1
    const halfW = sprite.width / 2
    const halfH = sprite.height / 2
    borderGraphics.visible = false
    drawBorderRect(borderGraphics, -halfW, -halfH, sprite.width, sprite.height)
    container.addChild(borderGraphics)

    const mobile = isMobile()
    let handleSprite = null
    let handleCircleSprite = null
    if (!mobile && transformTexture) {
      const circleRadius = TRANSFORM_HANDLE_SIZE / 2 + 4
      const handleCenterX = halfW
      const handleCenterY = halfH
      const iconSize = Math.round(TRANSFORM_HANDLE_SIZE * HANDLE_ICON_SIZE_RATIO)

      const circleTexture = createSmoothCircleTexture(circleRadius)
      if (circleTexture) {
        const circleTexSize = circleRadius * 2 + CIRCLE_PADDING * 2
        handleCircleSprite = new Sprite(circleTexture)
        handleCircleSprite.anchor.set(0.5)
        handleCircleSprite.x = handleCenterX
        handleCircleSprite.y = handleCenterY
        handleCircleSprite.width = circleTexSize
        handleCircleSprite.height = circleTexSize
        handleCircleSprite.eventMode = 'none'
        handleCircleSprite.visible = false
        handleCircleSprite.zIndex = 2
        container.addChild(handleCircleSprite)
      }

      handleSprite = new Sprite(transformTexture)
      handleSprite.anchor.set(0.5, 0.5)
      handleSprite.width = iconSize
      handleSprite.height = iconSize
      handleSprite.x = handleCenterX
      handleSprite.y = handleCenterY
      handleSprite.eventMode = 'none'
      handleSprite.visible = false
      handleSprite.zIndex = 3
      container.addChild(handleSprite)
    }

    container.pivot.set(0, 0)
    container.x = 0
    container.y = 0

    const state = {
      dragStart: null,
      handleStart: null,
    }

    function setHandleVisible(visible) {
      if (handleSprite) handleSprite.visible = visible
      if (handleCircleSprite) handleCircleSprite.visible = visible
      if (borderGraphics) borderGraphics.visible = visible
    }

    function bringToFront() {
      nextZIndex += 1
      container.zIndex = nextZIndex
    }

    function moveOrScale(ev) {
      const stage = getStageCoords(ev)
      const x = stage.x
      const y = stage.y
      if (state.dragStart) {
        const dx = x - state.dragStart.stageX
        const dy = y - state.dragStart.stageY
        container.x = state.dragStart.startX + dx
        container.y = state.dragStart.startY + dy
      } else if (state.handleStart) {
        const dx = x - state.handleStart.cx
        const dy = y - state.handleStart.cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
        const baseDist = Math.hypot(
          state.handleStart.stageX - state.handleStart.cx,
          state.handleStart.stageY - state.handleStart.cy
        ) || 0.001
        const scaleFactor = dist / baseDist
        const newScale = state.handleStart.scale * scaleFactor
        container.scale.set(newScale)
        const angle = Math.atan2(dy, dx)
        const angleDiffDeg = ((angle - state.handleStart.baseAngle) * 180) / Math.PI
        container.angle = state.handleStart.angleDeg + angleDiffDeg
      }
    }

    function endDrag() {
      state.dragStart = null
      state.handleStart = null
      if (currentDrag.value?.endDrag === endDrag) currentDrag.value = null
    }

    return {
      container,
      sprite,
      state,
      moveOrScale,
      endDrag,
      setHandleVisible,
      bringToFront,
    }
  }

  function getFramesByZDesc() {
    return [...(frameSprites.value || [])].sort(
      (a, b) => (b.container.zIndex ?? 0) - (a.container.zIndex ?? 0)
    )
  }

  function hitTestFrames(stageX, stageY) {
    const list = getFramesByZDesc()
    for (const fc of list) {
      const b = fc.container.getBounds()
      if (stageX >= b.x && stageX <= b.x + b.width && stageY >= b.y && stageY <= b.y + b.height) {
        const inHandle =
          !isMobile() &&
          stageX >= b.x + b.width - TRANSFORM_HANDLE_SIZE &&
          stageY >= b.y + b.height - TRANSFORM_HANDLE_SIZE
        return { fc, inHandle }
      }
    }
    return null
  }

  function setupPointerHandlers() {
    const el = containerRef?.value ?? containerRef
    if (!el || !app.value || pointerHandlersAttached) return
    pointerHandlersAttached = true

    const onPointerDown = (ev) => {
      const stage = getStageCoords(ev)
      const hit = hitTestFrames(stage.x, stage.y)
      if (!hit) return
      try { el.setPointerCapture(ev.pointerId) } catch (_) {}
      const { fc, inHandle } = hit
      fc.bringToFront()
      if (inHandle) {
        fc.state.handleStart = {
          stageX: stage.x,
          stageY: stage.y,
          scale: fc.container.scale.x,
          angleDeg: fc.container.angle,
          cx: fc.container.x,
          cy: fc.container.y,
          baseAngle: Math.atan2(stage.y - fc.container.y, stage.x - fc.container.x),
        }
      } else {
        fc.state.dragStart = {
          stageX: stage.x,
          stageY: stage.y,
          startX: fc.container.x,
          startY: fc.container.y,
        }
      }
      currentDrag.value = { fc, moveOrScale: fc.moveOrScale, endDrag: fc.endDrag }
    }

    const onPointerMove = (ev) => {
      const stage = getStageCoords(ev)
      const d = currentDrag.value
      if (d) {
        d.moveOrScale(ev)
        return
      }
      const hit = hitTestFrames(stage.x, stage.y)
      getFramesByZDesc().forEach((fc) => fc.setHandleVisible(false))
      if (hit?.fc) hit.fc.setHandleVisible(true)
    }

    const onPointerUp = () => {
      const d = currentDrag.value
      if (d) d.endDrag()
      currentDrag.value = null
    }

    boundPointerDown = onPointerDown
    boundPointerMove = onPointerMove
    boundPointerUp = onPointerUp
    el.addEventListener('pointerdown', boundPointerDown)
    el.addEventListener('pointermove', boundPointerMove)
    el.addEventListener('pointerup', boundPointerUp)
    el.addEventListener('pointerleave', boundPointerUp)
    el.addEventListener('pointercancel', boundPointerUp)
  }

  async function setupFramesInner() {
    const list = unref(frameUrls)
    if (!app.value || !framesContainer.value || !Array.isArray(list) || list.length === 0) return
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
    currentDrag.value = null
    frameSprites.value = []
    framesContainer.value.removeChildren()
    const view = app.value.renderer.view
    const w = view.width
    const h = view.height
    const count = list.length
    let transformTexture = null
    if (transformIconUrl) {
      const transformUrl = base && transformIconUrl.startsWith('/') ? base + transformIconUrl : transformIconUrl
      try {
        transformTexture = await Texture.fromURL(transformUrl)
      } catch (_) {}
    }
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const stepX = count > 1 ? w * FRAME_GRID_SPACING : 0
    const stepY = count > 1 ? h * FRAME_GRID_SPACING : 0
    const offsetX = (cols - 1) * stepX * 0.5
    const offsetY = (rows - 1) * stepY * 0.5
    for (let i = 0; i < list.length; i++) {
      let src = typeof list[i] === 'string' ? list[i] : list[i]?.src
      if (!src) continue
      if (base && src.startsWith('/')) src = base + src
      let frameTexture
      try {
        frameTexture = await Texture.fromURL(src)
      } catch (err) {
        console.warn('[AR Canvas] Failed to load frame:', src, err)
        continue
      }
      const fc = createFrameContainer(frameTexture, i, transformTexture)
      const row = Math.floor(i / cols)
      const col = i % cols
      const fx = w / 2 + col * stepX - offsetX
      const fy = h / 2 + row * stepY - offsetY
      fc.container.x = fx
      fc.container.y = fy
      fc.container.zIndex = i
      let scale = 0.5
      if (fc.sprite?.width && fc.sprite.width > 0) {
        const maxW = w * FRAME_MAX_WIDTH_RATIO
        scale = Math.min(1, maxW / fc.sprite.width) * FRAME_SCALE_FACTOR
      }
      fc.container.scale.set(scale)
      framesContainer.value.addChild(fc.container)
      frameSprites.value.push(fc)
    }
    nextZIndex = list.length
    setupPointerHandlers()
  }

  function setupPinch() {
    const container = containerRef?.value ?? containerRef
    if (!container || !app.value) return
    const el = container
    let pinchStart = null

    const onTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const t0 = e.touches[0]
        const t1 = e.touches[1]
        const mid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 }
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
        const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX)
        const stageMid = clientToStage(app.value?.renderer?.view, mid.x, mid.y)
        const list = getFramesByZDesc()
        const hit = list.find((fc) => {
          const b = fc.container.getBounds()
          return stageMid.x >= b.x && stageMid.x <= b.x + b.width && stageMid.y >= b.y && stageMid.y <= b.y + b.height
        })
        if (hit && pinchStart && pinchStart.fc === hit) {
          const scaleFactor = dist / pinchStart.dist
          const angleDiffDeg = ((angle - pinchStart.angle) * 180) / Math.PI
          hit.container.scale.set(
            pinchStart.scaleX * scaleFactor,
            pinchStart.scaleY * scaleFactor
          )
          hit.container.angle = pinchStart.angleDeg + angleDiffDeg
        }
        if (!pinchStart && hit) {
          pinchStart = {
            fc: hit,
            dist,
            angle,
            scaleX: hit.container.scale.x,
            scaleY: hit.container.scale.y,
            angleDeg: hit.container.angle,
          }
        } else if (pinchStart && hit) {
          pinchStart.dist = dist
          pinchStart.angle = angle
          pinchStart.scaleX = hit.container.scale.x
          pinchStart.scaleY = hit.container.scale.y
          pinchStart.angleDeg = hit.container.angle
        }
      } else {
        pinchStart = null
      }
    }

    const onTouchEnd = () => {
      pinchStart = null
    }

    boundTouchMove = onTouchMove
    boundTouchEnd = onTouchEnd
    el.addEventListener('touchmove', boundTouchMove, { passive: false })
    el.addEventListener('touchend', boundTouchEnd)
  }

  async function init() {
    const container = containerRef?.value ?? containerRef
    if (!container || !videoEl.value) return
    const application = new Application({
      resizeTo: container,
      backgroundAlpha: 0,
      preserveDrawingBuffer: true,
    })
    container.appendChild(application.view)
    app.value = application

    const cam = Sprite.from(Texture.EMPTY)
    cam.width = application.screen.width
    cam.height = application.screen.height
    application.stage.addChild(cam)
    cameraSprite.value = cam

    const frames = new Container()
    frames.eventMode = 'none'
    frames.sortableChildren = true
    application.stage.addChild(frames)
    framesContainer.value = frames

    tickerBinding = application.ticker.add(updateCameraSprite)
    updateCameraSprite()
    await setupFramesInner()
    setupPinch()
  }

  function captureDataUrls() {
    if (!app.value?.renderer?.extract) return null
    const extract = app.value.renderer.extract
    const canvas = extract.canvas()
    if (!canvas) return null
    return {
      main: canvas.toDataURL('image/jpeg', 0.5),
      pngHigh: canvas.toDataURL('image/png'),
      jpgHigh: canvas.toDataURL('image/jpeg', 1),
      jpgMid: canvas.toDataURL('image/jpeg', 0.5),
      jpglow: canvas.toDataURL('image/jpeg', 0.1),
    }
  }

  function destroy() {
    pointerHandlersAttached = false
    const el = containerRef?.value ?? containerRef
    if (el) {
      if (boundPointerDown) {
        el.removeEventListener('pointerdown', boundPointerDown)
        el.removeEventListener('pointermove', boundPointerMove)
        el.removeEventListener('pointerup', boundPointerUp)
        el.removeEventListener('pointerleave', boundPointerUp)
        el.removeEventListener('pointercancel', boundPointerUp)
        boundPointerDown = boundPointerMove = boundPointerUp = null
      }
      if (boundTouchMove) {
        el.removeEventListener('touchmove', boundTouchMove)
        boundTouchMove = null
      }
      if (boundTouchEnd) {
        el.removeEventListener('touchend', boundTouchEnd)
        boundTouchEnd = null
      }
    }
    if (app.value) {
      if (tickerBinding != null) app.value.ticker.remove(tickerBinding)
      app.value.destroy(true, { children: true })
      app.value = null
    }
    if (videoTexture) {
      videoTexture.destroy(true)
      videoTexture = null
    }
    frameSprites.value = []
    currentDrag.value = null
  }

  onUnmounted(destroy)

  watch(
    () => [unref(frameUrls)?.length, transformIconUrl],
    () => setupFramesInner(),
    { deep: true }
  )

  return {
    app,
    init,
    captureDataUrls,
    destroy,
  }
}
