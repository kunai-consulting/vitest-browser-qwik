import type { JSXOutput } from "@builder.io/qwik";
import { page } from "@vitest/browser/context";
import { beforeEach } from "vitest";
import { cleanup, type RenderResult, render, renderServerHTML } from "./pure";

/** This is replaced with actual code by the ssr-plugin.ts transform */
export function renderSSR(jsxNode: JSXOutput): Promise<RenderResult> {
	throw new Error(
		`renderSSR function should have been transformed by the SSR plugin. Passed JSX Node String: ${jsxNode?.toString()}`,
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

declare module "@vitest/browser/context" {
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
