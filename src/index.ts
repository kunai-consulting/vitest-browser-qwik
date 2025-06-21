import { page } from "@vitest/browser/context";
import { render, renderHook } from "./pure";

export type { RenderResult } from "./pure";
export { render, renderHook } from "./pure";

page.extend({
	render,
});

declare module "@vitest/browser/context" {
	interface BrowserPage {
		render: typeof render;
	}
}
