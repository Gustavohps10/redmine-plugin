import { defineConfig } from 'tsup'
import { cpSync } from 'fs'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  banner: {
    js: `import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);`,
  },
  dts: { resolve: true },
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/.*/],
  tsconfig: './tsconfig.build.json',
  onSuccess: async () => {
    cpSync('src/icon.png', 'dist/icon.png')
  },
})
