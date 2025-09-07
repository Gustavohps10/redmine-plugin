import { defineConfig } from 'tsup'
import { cpSync } from 'fs'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve:
     true },
  clean: true,
  sourcemap: true,
  splitting: true,
  tsconfig: './tsconfig.build.json',
  onSuccess: async () => {
    cpSync('src/icon.png', 'dist/icon.png')
  }
})
