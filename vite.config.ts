import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
// Вшивает уникальную версию в dist/sw.js при каждой сборке — PWA обновляется без переустановки
const swVersion = () => ({ name: 'sw-version', apply: 'build' as const, closeBundle() { const p = resolve('dist/sw.js'); writeFileSync(p, readFileSync(p, 'utf8').replace('__BUILD__', Date.now().toString(36))) } })
export default defineConfig({ base: '/formulabonus/', plugins: [react(), swVersion()] })
