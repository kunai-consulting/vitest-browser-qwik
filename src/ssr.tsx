import type { JSXOutput } from "@builder.io/qwik";
import type { Plugin } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

const renderSSR: BrowserCommand<[component: JSXOutput]> = async (component) => {
	const { renderToString } = await import("@builder.io/qwik/server");

	const html = await renderToString(component, {
		containerTagName: "div",
	});

	return {
		html,
	};
};

export default function SSRCommand(): Plugin {
	return {
		name: "vitest:ssr-command",
		config() {
			return {
				test: {
					browser: {
						commands: {
							renderSSR,
						},
					},
				},
			};
		},
	};
}
