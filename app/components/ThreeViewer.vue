<template>
  <div class="flex flex-col items-center relative">

    <!-- AR Toggle Button -->
    <div class="flex gap-4 mb-4">
      <button v-if="!isIOS" @click="toggleAR"
        class="px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition">
        {{ arActive ? 'AR Kapat' : 'AR Aç' }}
      </button>

      <a v-else :href="currentUSDZ" rel="ar" target="_blank"
        class="px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition">
        AR iOS'da Aç
      </a>
    </div>

    <!-- Model Seçici Panel -->
    <div
      class="flex flex-wrap justify-center gap-3 mb-6 p-4 bg-white/30 dark:bg-gray-800/50 backdrop-blur-md rounded-2xl shadow-lg">
      <button v-for="m in models" :key="m" @click="loadModel(m)"
        class="px-6 py-3 font-medium rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-md">
        {{ m }}
      </button>
    </div>

    <!-- Progress Bar -->
    <div v-if="loading" class="w-2/3 h-4 mb-6 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
      <div class="h-4 bg-gradient-to-r from-purple-400 via-pink-500 to-red-400 transition-all duration-300"
        :style="{ width: progress + '%' }"></div>
    </div>

    <!-- 3D Viewer -->
    <div ref="viewer"
      class="w-full h-[70vh] rounded-3xl shadow-2xl border border-gray-300 dark:border-gray-600 overflow-hidden cursor-grab"
      @mousedown="onGrabStart" @mouseup="onGrabEnd" @mouseleave="onGrabEnd">
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js'

const viewer = ref(null)
let scene, camera, renderer, controls
const loader = new GLTFLoader()

// State
const models = ref([])
const loading = ref(false)
const progress = ref(0)
let currentModel = null
const currentModelName = ref('')
const arActive = ref(false)
let arButton = null
let controller = null
const currentUSDZ = ref('')

// Platform detection
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

// === Helpers ===
const centerModel = (model) => {
  if (!model) return
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  model.position.sub(center)
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
  camera.position.set(0, 0, cameraZ * 1.5)
  controls.target.set(0, 0, 0)
  controls.update()
}

const initScene = () => {
  scene = new THREE.Scene()
  const width = viewer.value.clientWidth
  const height = viewer.value.clientHeight
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.xr.enabled = false
  viewer.value.appendChild(renderer.domElement)

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1))
  camera.position.set(0, 0, 5)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  // AR controller
  controller = renderer.xr.getController(0)
  controller.addEventListener('select', () => {
    if (currentModel) {
      const clone = currentModel.clone()
      clone.position.set(0, 0, -0.5)
      scene.add(clone)
    }
  })
  scene.add(controller)

  // Animate
  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })
}

const loadModel = (modelName) => {
  loading.value = true
  progress.value = 0
  if (currentModel) scene.remove(currentModel)

  loader.load(
    `/models/${modelName}`,
    (gltf) => {
      currentModel = gltf.scene
      currentModelName.value = modelName
      scene.add(currentModel)
      centerModel(currentModel)
      loading.value = false

      // iOS Quick Look için .usdz dosyası yolu
      currentUSDZ.value = `/models/${modelName.replace(/\.glb$/i, '.usdz')}`
    },
    (xhr) => {
      if (xhr.lengthComputable) progress.value = Math.round((xhr.loaded / xhr.total) * 100)
    },
    (error) => {
      console.error('Model yükleme hatası:', error)
      loading.value = false
    }
  )
}

// === AR ===
const toggleAR = async () => {
  if (!arActive.value) {
    if (navigator.xr) {
      try {
        const session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test', 'dom-overlay'],
          domOverlay: { root: document.body }
        });

        renderer.xr.enabled = true;
        await renderer.xr.setSession(session);

        // Hit test kaynakları
        let hitTestSource = null;
        let localSpace = null;
        let hitTestReady = false;

        session.requestReferenceSpace('viewer').then((refSpace) => {
          session.requestHitTestSource({ space: refSpace }).then((source) => {
            hitTestSource = source;
            hitTestReady = true;
          });
        });

        session.requestReferenceSpace('local').then((refSpace) => {
          localSpace = refSpace;
        });

        // AR render döngüsü
        renderer.setAnimationLoop((timestamp, frame) => {
          if (frame && hitTestReady && hitTestSource && localSpace) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
              const pose = hitTestResults[0].getPose(localSpace);
              if (currentModel) {
                currentModel.position.set(
                  pose.transform.position.x,
                  pose.transform.position.y,
                  pose.transform.position.z
                );
                currentModel.quaternion.set(
                  pose.transform.orientation.x,
                  pose.transform.orientation.y,
                  pose.transform.orientation.z,
                  pose.transform.orientation.w
                );
              }
            }
          }
          renderer.render(scene, camera);
        });

        arActive.value = true;
      } catch (err) {
        console.error('AR başlatılamadı:', err);
      }
    } else {
      console.warn('WebXR desteklenmiyor.');
    }
  } else {
    const session = renderer.xr.getSession();
    if (session) await session.end();
    renderer.xr.enabled = false;
    arActive.value = false;
  }
};


// UI effects
const onGrabStart = () => viewer.value.classList.add('cursor-grabbing')
const onGrabEnd = () => viewer.value.classList.remove('cursor-grabbing')

const onWindowResize = () => {
  if (!camera || !renderer) return
  camera.aspect = viewer.value.clientWidth / viewer.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(viewer.value.clientWidth, viewer.value.clientHeight)
  if (currentModel) centerModel(currentModel)
}

// Lifecycle
onMounted(async () => {
  initScene()
  try {
    models.value = await $fetch('/api/models')
    if (models.value.length > 0) loadModel(models.value[0])
  } catch (err) {
    console.error('Model listesi alınamadı:', err)
  }
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
})
</script>