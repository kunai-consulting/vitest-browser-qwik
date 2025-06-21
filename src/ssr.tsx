import type { JSXOutput } from "@builder.io/qwik";
import { renderToStream } from "@builder.io/qwik/server";
import type { Plugin } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

const renderSSR: BrowserCommand<[component: JSXOutput]> = async (component) => {
	let html = "";

	const stream = {
		write: (chunk: string) => {
			html += chunk;
		},
	};

	await renderToStream(component, {
		containerTagName: "div",
		stream,
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
