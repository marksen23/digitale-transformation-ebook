import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',            // change to the folder that contains index.html
  build: {
    outDir: '../dist'     // relative to root; will emit to <repo>/dist
  }
})