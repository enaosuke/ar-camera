/**
 * ブラウザ別のカメラ制約
 * - Mac Safari: 解像度 1920x1080 に制限
 * - Firefox: frameRate の max を指定しない（既知の制約）
 */
function getCameraConstraints(facingMode = 'user') {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome'))
  const isFirefox = navigator.userAgent.includes('Firefox')

  const base = {
    video: {
      facingMode,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  }

  if (isSafari) {
    base.video.width = { ideal: 1920, max: 1920 }
    base.video.height = { ideal: 1080, max: 1080 }
  }

  if (!isFirefox) {
    base.video.frameRate = { ideal: 30 }
  }

  return base
}

export async function getCameraStream(facingMode = 'user') {
  const constraints = getCameraConstraints(facingMode)
  return navigator.mediaDevices.getUserMedia(constraints)
}

export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}
