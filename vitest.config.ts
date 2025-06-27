import { resolve } from "node:path";
import { qwikVite, symbolMapper } from "@builder.io/qwik/optimizer";
import { register as handleTSXImports } from "tsx/esm/api";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";
import { createSSRTransformPlugin } from "./src/ssr-plugin";

handleTSXImports();

type ComponentFormat = BrowserCommand<
	[
		componentPath: string,
		componentName: string,
		props?: Record<string, unknown>,
	]
>;

const renderSSRCommand: ComponentFormat = async (
	ctx,
	componentPath: string,
	componentName: string,
	props: Record<string, unknown> = {},
) => {
	try {
		const projectRoot = process.cwd();
		const absoluteComponentPath = resolve(projectRoot, componentPath);

		const viteServer = ctx.project.vite;
		// vite doesn't replace import.meta.env with hardcoded values so we need to do it manually
		for (const [key, value] of Object.entries(viteServer.config.env)) {
			viteServer.config.define!['__vite_ssr_import_meta__.env.' + key] = JSON.stringify(value);
		}

		const componentModule = await viteServer.ssrLoadModule(
			absoluteComponentPath,
		);
		const Component = componentModule[componentName];

		if (!Component) {
			throw new Error(
				`Component "${componentName}" not found in ${absoluteComponentPath}`,
			);
		}

		const qwikModule = await viteServer.ssrLoadModule("@builder.io/qwik");
		const { jsx } = qwikModule;
		const jsxElement = jsx(Component, props);

		const serverModule = await viteServer.ssrLoadModule(
			"@builder.io/qwik/server",
		);
		const { renderToString } = serverModule;

		const result = await renderToString(jsxElement, {
			containerTagName: "div",
			base: "/",
			qwikLoader: { include: "always" },
			symbolMapper: globalThis.qwikSymbolMapper,
		});

		return { html: result.html };
	} catch (error) {
		console.error("SSR Command Error:", error);
		throw error;
	}
};

export default defineConfig({
	plugins: [
		createSSRTransformPlugin(),
		qwikVite({
			devTools: {
				clickToSource: ["Alt"],
			},
		}),
		{
			name: "resolve-qwik-symbol-mapper",
			configResolved() {
				globalThis.qwikSymbolMapper = symbolMapper;
			},
		},
	],
	test: {
		browser: {
			enabled: true,
			provider: "playwright",
			instances: [{ browser: "chromium" }],
			commands: {
				renderSSR: renderSSRCommand,
			},
			headless: true,
		},
		exclude: ["node_modules", "test/ssr-plugin.test.ts"],
	},
});
