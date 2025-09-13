import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['73f399c3d4f0.ngrok-free.app'], // Ngrok URL’nizi buraya ekleyin
      // veya tüm hostlara izin vermek için:
      // allowedHosts: 'all'
    }
  },
})
