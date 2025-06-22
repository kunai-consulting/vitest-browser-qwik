import { describe, expect, it } from "vitest";

type TransformFunction = (
	code: string,
	id: string,
) => Promise<{
	code: string;
}>;

// Mock the createSSRTransformPlugin function for testing
describe("SSR Transform Plugin", () => {
	// We'll test the plugin functionality by calling it directly with mock data
	// rather than importing the entire plugin which has Node.js dependencies

	describe("semantic analysis detection", () => {
		it("should detect direct renderSSR calls", async () => {
			// Import the plugin dynamically to avoid Node.js import issues
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					renderSSR(<Component />);
				});
			`;

			const result = await transform(code, "/test/direct.test.tsx");
			console.log("Direct renderSSR result:", result?.code || "null");
			expect(result).not.toBeNull();
		});

		it("should detect aliased renderSSR imports", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { renderSSR as render } from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					render(<Component />);
				});
			`;

			const result = await transform(code, "/test/aliased.test.tsx");
			console.log("Aliased renderSSR result:", result?.code || "null");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain("commands.renderSSR");
			}
		});

		it("should detect variable aliases", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				const myRender = renderSSR;
				
				test("example", () => {
					myRender(<Component />);
				});
			`;

			const result = await transform(code, "/test/variable-alias.test.tsx");
			console.log("Variable alias result:", result?.code || "null");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain("commands.renderSSR");
			}
		});

		it("should detect default imports with renderSSR-like names", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import renderSSR from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					renderSSR(<Component />);
				});
			`;

			const result = await transform(code, "/test/default-import.test.tsx");
			expect(result).not.toBeNull();
		});

		it("should NOT transform when renderSSR is not actually called", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					// renderSSR is imported but not called
					const unused = renderSSR;
					console.log("not using renderSSR");
				});
			`;

			const result = await transform(code, "/test/not-called.test.tsx");
			console.log("Not called result:", result || "null");
			expect(result).toBeNull(); // Should be null because renderSSR is not called
		});

		it("should not detect files without renderSSR calls", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { someOtherFunction } from "somewhere";
				
				test("example", () => {
					someOtherFunction();
				});
			`;

			const result = await transform(code, "/test/no-renderssr.test.tsx");
			console.log("No renderSSR result:", result || "null");
			expect(result).toBeNull();
		});

		it("should not detect renderSSR in comments or strings", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				// This mentions renderSSR but doesn't use it
				const message = "We should use renderSSR";
				
				test("example", () => {
					console.log(message);
				});
			`;

			const result = await transform(code, "/test/comments-strings.test.tsx");
			expect(result).toBeNull();
		});

		it("should handle malformed code gracefully", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { renderSSR } from "somewhere"
				import { Component } from "./Component";
				// Missing semicolon above
				
				test("example", () => {
					renderSSR(<Component />);
				});
			`;

			// Should still work due to fallback
			const result = await transform(code, "/test/malformed.test.tsx");
			expect(result).not.toBeNull();
		});

		it("should skip non-test files", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				renderSSR(<Component />);
			`;

			const result = await transform(code, "/src/component.tsx");
			expect(result).toBeNull();
		});
	});

	describe("transformation functionality", () => {
		it("should transform renderSSR calls with components", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { Counter } from "./fixtures/Counter";
				
				test("example", () => {
					renderSSR(<Counter initialCount={5} />);
				});
			`;

			const result = await transform(code, "/test/transform.test.tsx");
			expect(result).not.toBeNull();
			// Check that it contains the transformed call with resolved path
			expect(result.code).toContain("commands.renderSSR(");
			expect(result.code).toContain('"Counter"');
			expect(result.code).toContain('{"initialCount":5}');
			expect(result.code).toContain(
				'import { commands } from "@vitest/browser/context"',
			);
		});

		it("should handle components without props", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { HelloWorld } from "./fixtures/HelloWorld";
				
				test("example", () => {
					renderSSR(<HelloWorld />);
				});
			`;

			const result = await transform(code, "/test/no-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result.code).toContain("commands.renderSSR(");
			expect(result.code).toContain('"HelloWorld"');
			expect(result.code).not.toContain('{"');
		});

		it("should handle string literal props", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					renderSSR(<MyComponent title="Hello" />);
				});
			`;

			const result = await transform(code, "/test/string-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result.code).toContain('{"title":"Hello"}');
		});

		it("should handle multiple renderSSR calls", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { Counter } from "./fixtures/Counter";
				import { HelloWorld } from "./fixtures/HelloWorld";
				
				test("example", () => {
					renderSSR(<Counter initialCount={1} />);
					renderSSR(<HelloWorld />);
				});
			`;

			const result = await transform(code, "/test/multiple.test.tsx");
			expect(result).not.toBeNull();
			expect(result.code).toContain('"Counter"');
			expect(result.code).toContain('{"initialCount":1}');
			expect(result.code).toContain('"HelloWorld"');
		});

		it("should not add commands import if already present", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { commands } from "@vitest/browser/context";
				import { Counter } from "./fixtures/Counter";
				
				test("example", () => {
					renderSSR(<Counter />);
				});
			`;

			const result = await transform(code, "/test/existing-commands.test.tsx");
			expect(result).not.toBeNull();
			// Should not add duplicate import
			const importMatches = result.code.match(
				/import.*commands.*from.*@vitest\/browser\/context/g,
			);
			expect(importMatches).toHaveLength(1);
		});

		it("should handle absolute imports", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "@/components/MyComponent";
				
				test("example", () => {
					renderSSR(<MyComponent />);
				});
			`;

			const result = await transform(code, "/test/absolute-import.test.tsx");
			expect(result).not.toBeNull();
			expect(result.code).toContain("@/components/MyComponent.tsx");
			expect(result.code).toContain('"MyComponent"');
		});

		it("should preserve file extensions when present", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent.tsx";
				
				test("example", () => {
					renderSSR(<MyComponent />);
				});
			`;

			const result = await transform(code, "/test/with-extension.test.tsx");
			expect(result).not.toBeNull();
			expect(result.code).toContain("MyComponent.tsx");
			expect(result.code).toContain('"MyComponent"');
		});
	});

	describe("edge cases", () => {
		it("should handle missing component imports gracefully", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				test("example", () => {
					renderSSR(<SomeComponent />);
				});
			`;

			const result = await transform(code, "/test/missing-import.test.tsx");
			// Should detect renderSSR but not transform due to missing import
			expect(result).toBeNull();
		});

		it("should handle complex prop expressions", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { Counter } from "./fixtures/Counter";
				
				test("example", () => {
					const count = 5;
					renderSSR(<Counter initialCount={count + 1} />);
				});
			`;

			const result = await transform(code, "/test/complex-props.test.tsx");
			expect(result).not.toBeNull();
			// Complex expressions should not be serialized, only literals
			expect(result.code).toContain("Counter");
		});

		it("should handle nested JSX elements", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { Wrapper } from "./fixtures/Wrapper";
				import { Counter } from "./fixtures/Counter";
				
				test("example", () => {
					renderSSR(
						<Wrapper>
							<Counter initialCount={1} />
						</Wrapper>
					);
				});
			`;

			const result = await transform(code, "/test/nested-jsx.test.tsx");
			expect(result).not.toBeNull();
			expect(result.code).toContain("Wrapper");
		});
	});

	describe("transformation correctness", () => {
		it("should properly transform with real component imports", async () => {
			const { createSSRTransformPlugin } = await import("../src/ssr-plugin");
			const plugin = createSSRTransformPlugin();
			const transform = plugin.transform as TransformFunction;

			// Use a more realistic test file path and imports
			const code = `
				import { Counter } from "./fixtures/Counter";
				
				test("should render counter", () => {
					const result = renderSSR(<Counter initialCount={5} />);
					expect(result.html).toContain("5");
				});
			`;

			const result = await transform(code, "test/counter.test.tsx");
			console.log("\n=== REALISTIC TRANSFORMATION ===");
			console.log("Original code:");
			console.log(code);
			console.log("\nTransformed code:");
			console.log(result?.code || "null");
			console.log("================================\n");

			if (result) {
				expect(result.code).toContain("commands.renderSSR");
				expect(result.code).toContain("Counter");
				expect(result.code).toContain('{"initialCount":5}');
				expect(result.code).toContain("import { commands }");
			}
		});
	});
});
