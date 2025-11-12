var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// GitHub Actions exposes GITHUB_REPOSITORY; use it to derive the Pages base path.
var repoName = (_a = process.env.GITHUB_REPOSITORY) === null || _a === void 0 ? void 0 : _a.split('/')[1];
var base = process.env.GITHUB_ACTIONS && repoName ? "/".concat(repoName, "/") : '/';
// https://vitejs.dev/config/
export default defineConfig({
    base: base,
    plugins: [react()],
    server: {
        port: 5173,
        open: false
    }
});
