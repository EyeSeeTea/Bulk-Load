/// <reference types="vitest" />
/// <reference types="vite/client" />
import { type Plugin, UserConfig, defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import nodePolyfills from "vite-plugin-node-stdlib-browser";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

const redirectPaths = ["/dhis-web-pivot", "/dhis-web-data-visualizer"];

export default ({ mode }): UserConfig => {
    const env = { ...process.env, ...loadEnv(mode, process.cwd()) };
    const isBuild = mode === "production";

    const plugins: Plugin[] = [
        nodePolyfills() as unknown as Plugin,
        react(),
        checker({
            overlay: false,
            typescript: true,
            eslint: {
                lintCommand: 'eslint "./src/**/*.{ts,tsx,js,jsx}"',
                dev: { logLevel: ["warning"] },
            },
        }),
    ];

    if (!isBuild) {
        plugins.push(getDhIs2ProxyPlugin(env));
    }

    return defineConfig({
        base: "", // Relative paths (DHIS2 serves the app from a subpath)
        plugins,
        test: {
            environment: "jsdom",
            include: ["**/*.spec.{ts,tsx}"],
            setupFiles: "./src/tests/setup.js",
            exclude: ["node_modules", "src/tests/playwright"],
            globals: true,
        },
        resolve: {
            alias: {
                $: path.resolve(__dirname, "./src"),
            },
        },
        server: {
            port: parseInt(env.VITE_PORT || env.PORT || "8081"),
            strictPort: true,
        },
        define: {
            // Keep compatibility with code that uses `process.env.NODE_ENV`.
            "process.env.NODE_ENV": JSON.stringify(isBuild ? "production" : "development"),
            // styled-jsx bundles assume CommonJS where `__dirname` exists.
            // In the browser (ESM) it isn't defined, so we provide a safe value.
            "__dirname": JSON.stringify(""),
        },
    });
};

function getDhIs2ProxyPlugin(env: Record<string, string>): Plugin {
    const targetUrlVar = "VITE_DHIS2_BASE_URL";
    const authVar = "VITE_DHIS2_AUTH";
    const logLevelVar = "VITE_PROXY_LOG_LEVEL";

    const targetUrl = env[targetUrlVar];
    const auth = env[authVar];
    const logLevel = env[logLevelVar] || "warn";

    if (!targetUrl) {
        console.error(`Set ${targetUrlVar}`);
        process.exit(1);
    }

    const target = targetUrl;

    return {
        name: "dhis2-proxy",
        configureServer(server) {
            // Redirect some DHIS2 apps to the original origin (avoids iframe/proxy issues).
            server.middlewares.use((req, res, next) => {
                const url = req.url || "";
                if (!url.startsWith("/dhis2/") && url !== "/dhis2") return next();

                const [pathname, search] = url.split("?");
                const unprefixed = pathname.replace(/^\/dhis2/, "");
                const shouldRedirect = redirectPaths.some(redirectPath => unprefixed.startsWith(redirectPath));

                if (!shouldRedirect) return next();

                const redirectUrl = `${target.replace(/\/$/, "")}${unprefixed}${search ? `?${search}` : ""}`;
                res.statusCode = 302;
                res.setHeader("Location", redirectUrl);
                res.end();
            });

            server.middlewares.use(
                "/dhis2",
                createProxyMiddleware({
                    target,
                    auth,
                    logLevel,
                    changeOrigin: true,
                    pathRewrite: {
                        "^/dhis2/": "/",
                    },
                })
            );
        },
    };
}

