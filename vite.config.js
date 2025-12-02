import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/booking-manager/', // ★ 깃허브 저장소 이름과 똑같아야 합니다
})