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

    <!-- AR için Retikül (hedefleme) -->
    <div v-if="arActive && reticleVisible" class="reticle" :style="reticleStyle"></div>

    <!-- AR Kontrolleri -->
    <div v-if="arActive && selectedModel" class="fixed bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4 p-4 bg-black/50 rounded-2xl backdrop-blur-md">
      <button @click="scaleModel(0.8)" class="p-3 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
        </svg>
      </button>
      <button @click="scaleModel(1.2)" class="p-3 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <button @click="rotateModel" class="p-3 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
      <button @click="removeSelectedModel" class="p-3 bg-red-600 rounded-full text-white hover:bg-red-700 transition">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
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

// AR için yeni state değişkenleri
let reticle = null
const reticleVisible = ref(false)
const reticleStyle = ref({
  left: '50%',
  top: '50%'
})
let hitTestSource = null
let hitTestSourceRequested = false

// Yeni: AR'da yerleştirilmiş modeller ve seçili model
const placedModels = ref([])
const selectedModel = ref(null)

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

  // Retikül (hedefleme noktası) oluştur
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  )
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  scene.add(reticle)

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
      
      // AR modunda değilse sahneye ekle
      if (!arActive.value) {
        scene.add(currentModel)
        centerModel(currentModel)
      }
      
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

// === AR için yeni fonksiyonlar ===
const onSelect = () => {
  if (currentModel && reticle.visible) {
    const clone = currentModel.clone()
    clone.position.setFromMatrixPosition(reticle.matrix)
    clone.visible = true
    clone.userData.selectable = true // Seçilebilir olarak işaretle
    
    // Modeli seçmek için tıklama olayı ekle
    clone.userData.onClick = () => {
      // Önceki seçimi temizle
      if (selectedModel.value) {
        selectedModel.value.material.emissive.setHex(selectedModel.value.userData.originalEmissive);
      }
      
      // Yeni modeli seç
      selectedModel.value = clone;
      clone.userData.originalEmissive = clone.material?.emissive?.getHex() || 0x000000;
      
      // Seçili modeli vurgula
      if (clone.material) {
        clone.material.emissive.setHex(0x555555);
      }
    };
    
    scene.add(clone)
    placedModels.value.push(clone)
  }
}

// Model ölçeklendirme
const scaleModel = (factor) => {
  if (selectedModel.value) {
    selectedModel.value.scale.multiplyScalar(factor);
  }
}

// Model döndürme
const rotateModel = () => {
  if (selectedModel.value) {
    selectedModel.value.rotation.y += Math.PI / 4;
  }
}

// Seçili modeli kaldır
const removeSelectedModel = () => {
  if (selectedModel.value) {
    scene.remove(selectedModel.value);
    const index = placedModels.value.indexOf(selectedModel.value);
    if (index > -1) {
      placedModels.value.splice(index, 1);
    }
    selectedModel.value = null;
  }
}

const initXR = () => {
  // Hit-test kaynağı iste
  const session = renderer.xr.getSession()
  
  session.requestReferenceSpace('viewer').then((referenceSpace) => {
    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
      hitTestSource = source
    })
  })
  
  session.addEventListener('end', () => {
    hitTestSourceRequested = false
    hitTestSource = null
    arActive.value = false
    selectedModel.value = null
  })
  
  // Controller için select eventi ekle
  controller = renderer.xr.getController(0)
  controller.addEventListener('select', onSelect)
  
  // Model seçmek için controller'a olay ekle
  controller.addEventListener('selectstart', () => {
    if (arActive.value && placedModels.value.length > 0) {
      // Controller pozisyonundan model seçmek için ışın at
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({ x: 0, y: 0 }, camera);
      
      const intersects = raycaster.intersectObjects(placedModels.value);
      
      if (intersects.length > 0) {
        const selected = intersects[0].object;
        if (selected.userData.onClick) {
          selected.userData.onClick();
        }
      }
    }
  });
  
  scene.add(controller)
}

// === AR ===
const toggleAR = async () => {
  if (!arActive.value) {
    // AR başlat
    arButton = ARButton.createButton(renderer, { 
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay']
    })
    document.body.appendChild(arButton)
    renderer.xr.enabled = true
    
    // Mevcut modeli sahneden kaldır (AR'da görünmesini engelle)
    if (currentModel) {
      scene.remove(currentModel)
    }
    
    // AR oturumu başladığında
    renderer.xr.addEventListener('sessionstart', () => {
      arActive.value = true
      initXR()
      
      // AR için animasyon döngüsünü güncelle
      renderer.setAnimationLoop((timestamp, frame) => {
        if (frame) {
          const referenceSpace = renderer.xr.getReferenceSpace()
          
          if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource)
            
            if (hitTestResults.length) {
              const hit = hitTestResults[0]
              reticle.visible = true
              reticleVisible.value = true
              reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix)
              
              // Retikül pozisyonunu ekranda göstermek için
              const pos = new THREE.Vector3()
              reticle.getWorldPosition(pos)
              pos.project(camera)
              
              reticleStyle.value = {
                left: `${(pos.x * 0.5 + 0.5) * 100}%`,
                top: `${(-pos.y * 0.5 + 0.5) * 100}%`
              }
            } else {
              reticle.visible = false
              reticleVisible.value = false
            }
          }
        }
        
        renderer.render(scene, camera)
      })
    })
  } else {
    // AR kapat
    const session = renderer.xr.getSession()
    if (session) await session.end()
    renderer.xr.enabled = false
    if (arButton) arButton.remove()
    arActive.value = false
    reticleVisible.value = false
    selectedModel.value = null
    
    // Yerleştirilmiş modelleri temizle
    placedModels.value.forEach(model => scene.remove(model))
    placedModels.value = []
    
    // Normal modda modeli göster
    if (currentModel) {
      scene.add(currentModel)
      centerModel(currentModel)
    }
    
    // Normal render döngüsüne geri dön
    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(scene, camera)
    })
  }
}

// UI effects
const onGrabStart = () => viewer.value.classList.add('cursor-grabbing')
const onGrabEnd = () => viewer.value.classList.remove('cursor-grabbing')

const onWindowResize = () => {
  if (!camera || !renderer) return
  camera.aspect = viewer.value.clientWidth / viewer.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(viewer.value.clientWidth, viewer.value.clientHeight)
  if (currentModel && !arActive.value) centerModel(currentModel)
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

<style scoped>
.reticle {
  position: fixed;
  width: 20px;
  height: 20px;
  border: 2px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
}
</style>