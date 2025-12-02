import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/booking-manager/', // ★ 중요: 깃허브 저장소 이름과 똑같이 적어야 합니다
})