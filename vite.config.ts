import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',            // change to the folder that contains index.html
  build: {
    outDir: '../public'     // relative to root; will emit to <repo>/dist
  }
})