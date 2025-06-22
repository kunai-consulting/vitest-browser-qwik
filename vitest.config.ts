import { resolve } from "node:path";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { renderToString } from "@builder.io/qwik/server";
import { register } from "tsx/esm/api";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

// Register tsx to handle TypeScript/TSX files
const tsxLoader = register();

// Custom command that runs on the server and can import components
const renderSSRCommand: BrowserCommand<
	[componentPath: string, componentName: string, props?: Record<string, any>]
> = async (
	{ testPath, provider },
	componentPath: string,
	componentName: string,
	props: Record<string, any> = {},
) => {
	try {
		// Resolve path relative to the project root
		const projectRoot = process.cwd();
		const absoluteComponentPath = resolve(projectRoot, componentPath);

		console.log(
			`Resolving component path: ${componentPath} -> ${absoluteComponentPath}`,
		);

		// Use tsx to import the TypeScript/TSX file
		const fileUrl = `file://${absoluteComponentPath}?t=${Date.now()}`;

		// Import the component dynamically on the server
		const componentModule = await import(fileUrl);
		const Component = componentModule[componentName];

		if (!Component) {
			throw new Error(
				`Component "${componentName}" not found in ${absoluteComponentPath}`,
			);
		}

		// Create JSX element with props
		const element = Component(props);

		// Render to string using Qwik's SSR
		const result = await renderToString(element, {
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
	plugins: [qwikVite()],
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
