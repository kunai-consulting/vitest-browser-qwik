import type { JSXNode, JSXOutput } from "@qwik.dev/core";
import { beforeEach } from "vitest";
import { page } from "vitest/browser";
import { cleanup, type RenderResult, render, renderServerHTML } from "./pure";

export function renderSSR(jsxNode: JSXOutput): Promise<RenderResult> {
	const node = jsxNode as JSXNode;

	throw new Error(
		`[vitest-browser-qwik]: renderSSR function should have been transformed by the SSR plugin. JSX Node type: ${node.type}
		
		 Make sure the testSSR plugin is first in the plugins array in your vitest.config.ts file.
		`,
	);
}

export type { RenderResult, SSRRenderOptions } from "./pure";
export {
	cleanup,
	render,
	renderHook,
	renderServerHTML,
} from "./pure";

page.extend({
	render,
	renderServerHTML: renderServerHTML,
	[Symbol.for("vitest:component-cleanup")]: cleanup,
});

beforeEach(async () => {
	await cleanup();
});

declare module "vitest/browser" {
	interface BrowserPage {
		render: typeof render;
		renderServerHTML: typeof renderServerHTML;
	}

	interface BrowserCommands {
		renderOnServer: (component: JSXOutput) => Promise<{
			html: string;
		}>;
	}
}
