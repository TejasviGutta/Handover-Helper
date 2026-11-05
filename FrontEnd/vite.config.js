// Pull in the React helper for Vite 
import react from '@vitejs/plugin-react'
// Pull in the Tailwind helper for Vite (new).
import tailwindcss from '@tailwindcss/vite'
// Pull in Vite's settings function 
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Turn on both helpers. tailwindcss() is the only new part.
  plugins: [react(), tailwindcss()],
})