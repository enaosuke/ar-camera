<template>
  <div class="ar-camera" role="main" aria-label="AR カメラ">
    <div v-if="error" class="error-screen">
      <p>カメラを利用できません</p>
      <p class="error-detail">{{ error }}</p>
    </div>

    <template v-else>
      <div ref="canvasWrapRef" class="canvas-wrap">
        <video
          ref="videoRef"
          autoplay
          playsinline
          muted
          class="video-el"
        />
        <div ref="canvasContainerRef" class="pixi-container" />
      </div>

      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner" aria-hidden="true" />
        <p>カメラを起動しています...</p>
      </div>

      <div v-if="switchingCamera" class="loading-overlay">
        <div class="loading-spinner" aria-hidden="true" />
        <p>カメラを切替中...</p>
      </div>

      <button
        type="button"
        class="shutter-btn"
        :disabled="!ready || flashing"
        aria-label="撮影"
        @click="onShutter"
      />

      <button
        v-if="isSp"
        type="button"
        class="camera-switch-btn"
        :disabled="switchingCamera"
        aria-label="カメラ切替"
        @click="switchCamera"
      />

      <div v-if="flashing" class="flash" />
    </template>

    <SaveModal
      :show="showSaveModal"
      :capture-data="captureData"
      @close="showSaveModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCameraStream, isMobile } from '../utils/camera'
import { useArCanvas } from '../composables/useArCanvas'
import SaveModal from '../components/SaveModal.vue'

const props = defineProps({
  images: {
    type: Array,
    default: () => [],
  },
})

const videoRef = ref(null)
const canvasWrapRef = ref(null)
const canvasContainerRef = ref(null)

const loading = ref(true)
const error = ref(null)
const ready = ref(false)
const flashing = ref(false)
const showSaveModal = ref(false)
const captureData = ref(null)
const switchingCamera = ref(false)
const facingMode = ref('user')

const isSp = computed(() => isMobile())

const defaultStampSrc = typeof import.meta.env?.BASE_URL === 'string'
  ? `${import.meta.env.BASE_URL}stamp/hanamaru.png`.replace(/\/+/g, '/')
  : '/stamp/hanamaru.png'

const frameUrls = computed(() => {
  const list = Array.isArray(props.images) ? props.images : []
  return list.length ? list : [{ src: defaultStampSrc }]
})

const transformIconUrl = '/icons/arrows-rotate.svg'

const {
  init: initCanvas,
  captureDataUrls,
  destroy: destroyCanvas,
} = useArCanvas(videoRef, canvasContainerRef, frameUrls, transformIconUrl)

async function startCamera(mode = 'user') {
  try {
    const stream = await getCameraStream(mode)
    if (!videoRef.value) return
    videoRef.value.srcObject = stream
    error.value = null
    return stream
  } catch (e) {
    error.value = e?.message ?? 'カメラの使用が許可されていません'
    return null
  }
}

async function init() {
  loading.value = true
  error.value = null
  const stream = await startCamera(facingMode.value)
  if (!stream) {
    loading.value = false
    return
  }
  await videoRef.value?.play?.()
  await initCanvas()
  ready.value = true
  loading.value = false
}

async function onShutter() {
  if (!ready.value || flashing.value) return
  flashing.value = true
  await new Promise((r) => setTimeout(r, 80))
  const data = captureDataUrls()
  flashing.value = false
  if (data) {
    captureData.value = data
    showSaveModal.value = true
  }
}

async function switchCamera() {
  if (switchingCamera.value || !videoRef.value?.srcObject) return
  switchingCamera.value = true
  const tracks = videoRef.value.srcObject.getVideoTracks()
  tracks.forEach((t) => t.stop())
  const nextMode = facingMode.value === 'user' ? 'environment' : 'user'
  const stream = await startCamera(nextMode)
  if (stream) {
    facingMode.value = nextMode
    videoRef.value.srcObject = stream
    await videoRef.value.play()
  }
  switchingCamera.value = false
}

onMounted(() => {
  init()
})

onUnmounted(() => {
  if (videoRef.value?.srcObject) {
    videoRef.value.srcObject.getTracks().forEach((t) => t.stop())
  }
  destroyCanvas()
})
</script>

<style lang="scss" scoped>
$overlay-bg: rgba(0, 0, 0, 0.8);
$safe-top: max(env(safe-area-inset-top), 4px);
$safe-bottom: max(env(safe-area-inset-bottom), 24px);

.ar-camera {
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
}

.error-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 1.5rem;
  color: #fff;
  text-align: center;

  .error-detail {
    font-size: 0.9rem;
    color: #b0b0b0;
    margin-top: 0.5rem;
    margin-bottom: 1rem;
  }
}

.canvas-wrap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.video-el {
  display: none;
}

.pixi-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;

  canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover;
  }
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: $overlay-bg;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: #fff;
  z-index: 10;

  p {
    font-size: 0.95rem;
  }
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.shutter-btn {
  position: absolute;
  bottom: $safe-bottom;
  left: 50%;
  transform: translateX(-50%);
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 4px solid #fff;
  background: rgba(255, 255, 255, 0.25);
  z-index: 5;
  transition: transform 0.15s ease, background 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateX(-50%) scale(1.06);
    background: rgba(255, 255, 255, 0.35);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 3px;
  }
}

.camera-switch-btn {
  position: absolute;
  top: $safe-top;
  right: 4px;
  width: 40px;
  height: 40px;
  z-index: 5;

  &::after {
    content: '';
    position: absolute;
    inset: 8px;
    background: url('/icons/arrows-rotate.svg') center / contain no-repeat;
    filter: brightness(0) invert(1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 2px;
    border-radius: 50%;
  }
}

.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  animation: flash 0.3s ease-out;
  pointer-events: none;
  z-index: 20;
}

@keyframes flash {
  0% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
  }
}
</style>
