<template>
  <div class="flex flex-col items-center px-4 py-8 max-w-7xl mx-auto">
    <!-- Başlık -->
    <h2 class="text-4xl md:text-5xl font-extrabold mb-10 text-center text-gray-900 tracking-tight">
      3D Model Görüntüleyici
    </h2>

    <!-- ThreeViewer Component -->
    <div class="w-full">
      <ThreeViewer class="w-full rounded-3xl shadow-2xl overflow-hidden" />
    </div>
  </div>
</template>

<script setup>
import ThreeViewer from '~/components/ThreeViewer.vue'
</script>
