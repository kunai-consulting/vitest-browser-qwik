import { describe, expect, it } from "vitest";

type TransformFunction = (
	code: string,
	id: string,
) => Promise<{
	code: string;
}>;

// Mock the testSSR function for testing
describe("SSR Transform Plugin", () => {
	// We'll test the plugin functionality by calling it directly with mock data
	// rather than importing the entire plugin which has Node.js dependencies

	describe("semantic analysis detection", () => {
		it("should detect direct renderSSR calls", async () => {
			// Import the plugin dynamically to avoid Node.js import issues
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			expect(result.code).toContain('"initialCount": 5');
			expect(result.code).toContain(
				'import { commands } from "@vitest/browser/context"',
			);
		});

		it("should handle components without props", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			// Should not have props parameter when no props
			expect(result.code).toContain(
				'renderSSR("./../../../../test/fixtures/HelloWorld.tsx", "HelloWorld")',
			);
		});

		it("should handle string literal props", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					renderSSR(<MyComponent title="Hello" />);
				});
			`;

			const result = await transform(code, "/test/string-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result.code).toContain('"title": "Hello"');
		});

		it("should handle multiple renderSSR calls", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			expect(result.code).toContain('"initialCount": 1');
			expect(result.code).toContain('"HelloWorld"');
		});

		it("should not add commands import if already present", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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

	describe("local component support", () => {
		it("should detect local component definitions", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$, useSignal } from "@builder.io/qwik";
				
				const LocalComponent = component$(() => {
					const count = useSignal(0);
					return <div>Count: {count.value}</div>;
				});
				
				test("example", () => {
					renderSSR(<LocalComponent />);
				});
			`;

			const result = await transform(code, "/test/local-component.test.tsx");
			console.log("Local component result:", result?.code || "null");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain("commands.renderSSRLocal");
				expect(result.code).toContain('"LocalComponent"');
				expect(result.code).toContain("const LocalComponent = component$");
			}
		});

		it("should handle local components with props", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$, useSignal } from "@builder.io/qwik";
				
				const CounterComponent = component$<{ initialValue: number }>(({ initialValue }) => {
					const count = useSignal(initialValue);
					return <button onClick$={() => count.value++}>Count: {count.value}</button>;
				});
				
				test("example", () => {
					renderSSR(<CounterComponent initialValue={5} />);
				});
			`;

			const result = await transform(code, "/test/local-with-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain("commands.renderSSRLocal");
				expect(result.code).toContain('"CounterComponent"');
				expect(result.code).toContain('"initialValue": 5');
			}
		});

		it("should handle local components with useTask$", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$, useSignal, useTask$ } from "@builder.io/qwik";
				
				const TaskComponent = component$(() => {
					const count = useSignal(0);
					
					useTask$(() => {
						count.value = count.value + 5;
					});
					
					return <div>Count: {count.value}</div>;
				});
				
				test("example", () => {
					renderSSR(<TaskComponent />);
				});
			`;

			const result = await transform(code, "/test/local-with-task.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain("commands.renderSSRLocal");
				expect(result.code).toContain('"TaskComponent"');
				expect(result.code).toContain("useTask$");
			}
		});

		it("should handle mixed local and imported components", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$, useSignal } from "@builder.io/qwik";
				import { Counter } from "./fixtures/Counter";
				
				const LocalComponent = component$(() => {
					const count = useSignal(0);
					return <div>Local: {count.value}</div>;
				});
				
				test("example", () => {
					renderSSR(<Counter initialCount={5} />);
					renderSSR(<LocalComponent />);
				});
			`;

			const result = await transform(code, "/test/mixed-components.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				// Should have both commands
				expect(result.code).toContain("commands.renderSSR("); // for imported Counter
				expect(result.code).toContain("commands.renderSSRLocal("); // for local LocalComponent
				expect(result.code).toContain('"Counter"');
				expect(result.code).toContain('"LocalComponent"');
			}
		});

		it("should handle multiple local components", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$, useSignal } from "@builder.io/qwik";
				
				const FirstComponent = component$(() => {
					return <div>First</div>;
				});
				
				const SecondComponent = component$(() => {
					const value = useSignal("second");
					return <span>{value.value}</span>;
				});
				
				test("example", () => {
					renderSSR(<FirstComponent />);
					renderSSR(<SecondComponent />);
				});
			`;

			const result = await transform(code, "/test/multiple-local.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain('"FirstComponent"');
				expect(result.code).toContain('"SecondComponent"');
				// Should have two renderSSRLocal calls
				const localCalls = result.code.match(/commands\.renderSSRLocal/g);
				expect(localCalls).toHaveLength(2);
			}
		});

		it("should handle local components with complex expressions", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$, useSignal } from "@builder.io/qwik";
				
				const ComplexComponent = component$<{ data: { value: number; name: string } }>(({ data }) => {
					const count = useSignal(data.value);
					return <div>{data.name}: {count.value}</div>;
				});
				
				test("example", () => {
					const testData = { value: 42, name: "test" };
					renderSSR(<ComplexComponent data={testData} />);
				});
			`;

			const result = await transform(code, "/test/complex-local.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain("commands.renderSSRLocal");
				expect(result.code).toContain('"ComplexComponent"');
				expect(result.code).toContain('"data": testData');
			}
		});

		it("should not transform local components without renderSSR calls", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$, useSignal } from "@builder.io/qwik";
				
				const UnusedComponent = component$(() => {
					return <div>Not used</div>;
				});
				
				test("example", () => {
					console.log("No renderSSR call here");
				});
			`;

			const result = await transform(code, "/test/unused-local.test.tsx");
			expect(result).toBeNull(); // Should not transform since no renderSSR calls
		});

		it("should properly escape component code in JSON", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { component$ } from "@builder.io/qwik";
				
				const QuotedComponent = component$(() => {
					const message = "Hello \"World\"";
					return <div>{message}</div>;
				});
				
				test("example", () => {
					renderSSR(<QuotedComponent />);
				});
			`;

			const result = await transform(code, "/test/quoted-local.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain("commands.renderSSRLocal");
				// The JSON.stringify should properly escape quotes
				expect(result.code).toContain('\\"Hello \\\\\\"World\\\\\\"');
			}
		});
	});

	describe("edge cases", () => {
		it("should handle missing component imports gracefully", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
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
				expect(result.code).toContain('"initialCount": 5');
				expect(result.code).toContain("import { commands }");
			}
		});
	});

	describe("complex JSX expressions", () => {
		it("should handle array expressions", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const items = ["a", "b"];
					renderSSR(<MyComponent list={[1, 2, 3]} items={items} />);
				});
			`;

			const result = await transform(code, "/test/array-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain('"list": [1, 2, 3]');
				expect(result.code).toContain('"items": items');
			}
		});

		it("should handle object expressions", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const user = { name: "John" };
					renderSSR(<MyComponent config={{ theme: "dark", size: 10 }} user={user} />);
				});
			`;

			const result = await transform(code, "/test/object-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain('"config": { theme: "dark", size: 10 }');
				expect(result.code).toContain('"user": user');
			}
		});

		it("should handle variable references", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const count = 5;
					const isVisible = true;
					renderSSR(<MyComponent count={count} visible={isVisible} />);
				});
			`;

			const result = await transform(code, "/test/variable-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain('"count": count');
				expect(result.code).toContain('"visible": isVisible');
			}
		});

		it("should handle function calls", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					renderSSR(<MyComponent value={getValue()} timestamp={Date.now()} />);
				});
			`;

			const result = await transform(code, "/test/function-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain('"value": getValue()');
				expect(result.code).toContain('"timestamp": Date.now()');
			}
		});

		it("should handle complex expressions", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const base = 10;
					renderSSR(<MyComponent 
						computed={base * 2 + 1} 
						conditional={base > 5 ? "high" : "low"}
						member={obj.property}
						template={\`value: \${base}\`}
					/>);
				});
			`;

			const result = await transform(code, "/test/complex-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain('"computed": base * 2 + 1');
				expect(result.code).toContain(
					'"conditional": base > 5 ? "high" : "low"',
				);
				expect(result.code).toContain('"member": obj.property');
				expect(result.code).toContain('"template": `value: $' + "{base}`");
			}
		});

		it("should handle spread syntax", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const props = { a: 1, b: 2 };
					renderSSR(<MyComponent {...props} extra="value" />);
				});
			`;

			const result = await transform(code, "/test/spread-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				// Should handle spread attributes (though they can't be serialized perfectly)
				expect(result.code).toContain("MyComponent");
			}
		});

		it("should handle mixed prop types", async () => {
			const { testSSR } = await import("../src/ssr-plugin");
			const plugin = testSSR();
			const transform = plugin.transform as TransformFunction;

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const items = [1, 2, 3];
					renderSSR(<MyComponent 
						title="Hello World"
						count={42}
						items={items}
						config={{ nested: { value: true } }}
						handler={() => console.log("click")}
					/>);
				});
			`;

			const result = await transform(code, "/test/mixed-props.test.tsx");
			expect(result).not.toBeNull();
			if (result) {
				expect(result.code).toContain('"title": "Hello World"');
				expect(result.code).toContain('"count": 42');
				expect(result.code).toContain('"items": items');
				expect(result.code).toContain('"config": { nested: { value: true } }');
				expect(result.code).toContain('"handler": () => console.log("click")');
			}
		});
	});
});
