import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var backendUrl = env.VITE_BACKEND_URL || 'http://localhost:3000';
    return {
        plugins: [react()],
        server: {
            host: '0.0.0.0',
            port: 3002,
            proxy: {
                '/priv': {
                    target: backendUrl,
                    changeOrigin: true,
                },
            },
        },
    };
});
