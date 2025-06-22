import { resolve } from "node:path";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { renderToString } from "@builder.io/qwik/server";
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
	_,
	componentPath: string,
	componentName: string,
	props: Record<string, unknown> = {},
) => {
	try {
		const projectRoot = process.cwd();
		const absoluteComponentPath = resolve(projectRoot, componentPath);

		console.log(
			`Resolving component path: ${componentPath} -> ${absoluteComponentPath}`,
		);

		const fileUrl = `file://${absoluteComponentPath}?t=${Date.now()}`;

		const componentModule = await import(fileUrl);
		const Component = componentModule[componentName];

		if (!Component) {
			throw new Error(
				`Component "${componentName}" not found in ${absoluteComponentPath}`,
			);
		}

		const jsx = Component(props);

		const result = await renderToString(jsx, {
			containerTagName: "div",
			base: "/build/",
		});

		return { html: result.html };
	} catch (error) {
		console.error("SSR Command Error:", error);
		throw error;
	}
};

export default defineConfig({
	plugins: [createSSRTransformPlugin(), qwikVite()],
	test: {
		browser: {
			enabled: true,
			provider: "playwright",
			instances: [{ browser: "chromium" }],
			commands: {
				renderSSR: renderSSRCommand,
			},
		},
	},
});
