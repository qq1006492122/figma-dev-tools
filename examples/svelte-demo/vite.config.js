import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// figma-dev-tools svelte-demo：最小可运行配置
export default defineConfig({
  plugins: [svelte()],
});
