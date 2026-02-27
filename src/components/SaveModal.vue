<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-modal-title"
        @click.self="onBack"
      >
        <div class="modal-box">
          <p id="save-modal-title" class="modal-title">撮影が完了しました</p>
          <div class="preview-wrap">
            <img v-if="imageUrl" :src="imageUrl" alt="キャプチャ" class="preview-img" />
          </div>
          <p class="hint">画像は長押しで保存できます</p>
          <p class="hint-sub">うまく保存できない方は下記からダウンロード</p>
          <div class="downloads">
            <a
              v-for="item in downloadItems"
              :key="item.key"
              :href="item.dataUrl"
              :download="item.filename"
              class="download-btn"
            >
              {{ item.label }}
            </a>
          </div>
          <button type="button" class="back-btn" @click="onBack">戻る</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  captureData: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const imageUrl = computed(() => props.captureData?.main ?? null)

const downloadItems = computed(() => {
  const d = props.captureData
  if (!d) return []
  return [
    { key: 'png', label: 'PNG（高画質）', dataUrl: d.pngHigh, filename: 'ar-capture.png' },
    { key: 'jpgHigh', label: 'JPG（高画質）', dataUrl: d.jpgHigh, filename: 'ar-capture-high.jpg' },
    { key: 'jpgMid', label: 'JPG（中画質）', dataUrl: d.jpgMid, filename: 'ar-capture-mid.jpg' },
    { key: 'jpglow', label: 'JPG（低画質）', dataUrl: d.jpglow, filename: 'ar-capture-low.jpg' },
  ]
})

function onBack() {
  emit('close')
}
</script>

<style lang="scss" scoped>
$modal-bg: #fff;
$modal-radius: 12px;
$text: #1a1a1a;
$text-sub: #555;
$border: #ccc;
$btn-bg: #222;
$btn-hover: #444;
$surface: #f5f5f5;

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-box {
  background: $modal-bg;
  border-radius: $modal-radius;
  max-width: min(90vw, 400px);
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
  text-align: center;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: $text;
  margin-bottom: 1rem;
}

.preview-wrap {
  margin-bottom: 1.25rem;
  border-radius: 8px;
  overflow: hidden;
  background: $surface;
}

.preview-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 50vh;
  object-fit: contain;
}

.hint {
  font-size: 0.9rem;
  color: $text;
  margin-bottom: 0.25rem;
}

.hint-sub {
  font-size: 0.8rem;
  color: $text-sub;
  margin-bottom: 1rem;
}

.downloads {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.download-btn {
  display: block;
  padding: 0.65rem 1rem;
  background: $btn-bg;
  color: #fff;
  text-align: center;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: background 0.15s ease;

  &:hover {
    background: $btn-hover;
  }

  &:focus-visible {
    outline: 2px solid $btn-bg;
    outline-offset: 2px;
  }
}

.back-btn {
  display: block;
  width: 100%;
  padding: 0.65rem;
  background: transparent;
  border: 1px solid $border;
  border-radius: 8px;
  font-size: 0.9rem;
  color: $text;
  transition: background 0.15s ease;

  &:hover {
    background: #eee;
  }

  &:focus-visible {
    outline: 2px solid $btn-bg;
    outline-offset: 2px;
  }
}

// トランジション
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;

  .modal-box {
    transition: transform 0.2s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal-box {
    transform: scale(0.96);
  }
}
</style>
