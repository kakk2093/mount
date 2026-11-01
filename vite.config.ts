import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
	// Относительные пути к ресурсам: билд работает из любой подпапки сайта.
	base: './',
	resolve: {
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
	},
	server: { port: 5176, open: false },
	build: { chunkSizeWarningLimit: 1000, target: 'es2022', sourcemap: true }
});
