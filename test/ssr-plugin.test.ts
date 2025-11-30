import { describe, expect, it } from "vitest";

type TransformHandler = (
	code: string,
	id: string,
) => Promise<{ code: string } | null>;

type TransformObject = {
	filter: {
		id: RegExp;
		code: RegExp;
	};
	handler: TransformHandler;
};

const getTransform = async () => {
	const { testSSR } = await import("../src/ssr-plugin");
	const plugin = testSSR();
	const transform = plugin.transform as TransformObject;
	return {
		handler: transform.handler,
		filter: transform.filter,
	};
};

describe("SSR Transform Plugin", () => {
	describe("filter configuration", () => {
		it("should have correct file extension filter", async () => {
			const { filter } = await getTransform();

			expect(filter.id.test("/test/file.ts")).toBe(true);
			expect(filter.id.test("/test/file.tsx")).toBe(true);
			expect(filter.id.test("/test/file.js")).toBe(true);
			expect(filter.id.test("/test/file.jsx")).toBe(true);

			expect(filter.id.test("/test/file.css")).toBe(false);
			expect(filter.id.test("/test/file.html")).toBe(false);
			expect(filter.id.test("/test/file.json")).toBe(false);
			expect(filter.id.test("/test/file.md")).toBe(false);
		});

		it("should have correct renderSSR content filter", async () => {
			const { filter } = await getTransform();

			expect(filter.code.test("renderSSR(<Component />)")).toBe(true);
			expect(filter.code.test("const x = renderSSR")).toBe(true);

			expect(filter.code.test("render(<Component />)")).toBe(false);
			expect(filter.code.test("const x = 1")).toBe(false);
		});

		it("should filter out non-JS/TS files via filter.id", async () => {
			const { filter } = await getTransform();

			expect(filter.id.test("/test/file.css")).toBe(false);
			expect(filter.id.test("/test/file.json")).toBe(false);
		});

		it("should filter out files without renderSSR via filter.code", async () => {
			const { filter } = await getTransform();

			expect(filter.code.test(`console.log("hello");`)).toBe(false);
			expect(filter.code.test(`render(<Component />)`)).toBe(false);
		});
	});

	describe("semantic analysis detection", () => {
		it("should detect direct renderSSR calls", async () => {
			const { handler } = await getTransform();

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					renderSSR(<Component />);
				});
			`;

			const result = await handler(code, "/test/direct.test.tsx");
			expect(result).not.toBeNull();
		});

		it("should detect aliased renderSSR imports", async () => {
			const { handler } = await getTransform();

			const code = `
				import { renderSSR as render } from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					render(<Component />);
				});
			`;

			const result = await handler(code, "/test/aliased.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSR");
		});

		it("should detect variable aliases", async () => {
			const { handler } = await getTransform();

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				const myRender = renderSSR;
				
				test("example", () => {
					myRender(<Component />);
				});
			`;

			const result = await handler(code, "/test/variable-alias.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSR");
		});

		it("should detect default imports with renderSSR-like names", async () => {
			const { handler } = await getTransform();

			const code = `
				import renderSSR from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					renderSSR(<Component />);
				});
			`;

			const result = await handler(code, "/test/default-import.test.tsx");
			expect(result).not.toBeNull();
		});

		it("should NOT transform when renderSSR is not actually called", async () => {
			const { handler } = await getTransform();

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				
				test("example", () => {
					const unused = renderSSR;
					console.log("not using renderSSR");
				});
			`;

			const result = await handler(code, "/test/not-called.test.tsx");
			expect(result).toBeNull();
		});

		it("should not detect files without renderSSR calls", async () => {
			const { handler } = await getTransform();

			const code = `
				import { someOtherFunction } from "somewhere";
				
				test("example", () => {
					someOtherFunction();
				});
			`;

			const result = await handler(code, "/test/no-renderssr.test.tsx");
			expect(result).toBeNull();
		});

		it("should not detect renderSSR in comments or strings", async () => {
			const { handler } = await getTransform();

			const code = `
				// This mentions renderSSR but doesn't use it
				const message = "We should use renderSSR";
				
				test("example", () => {
					console.log(message);
				});
			`;

			const result = await handler(code, "/test/comments-strings.test.tsx");
			expect(result).toBeNull();
		});

		it("should handle malformed code gracefully", async () => {
			const { handler } = await getTransform();

			const code = `
				import { renderSSR } from "somewhere"
				import { Component } from "./Component";
				
				test("example", () => {
					renderSSR(<Component />);
				});
			`;

			const result = await handler(code, "/test/malformed.test.tsx");
			expect(result).not.toBeNull();
		});

		it("should transform any JS/TS file with renderSSR (not just test files)", async () => {
			const { handler } = await getTransform();

			const code = `
				import { renderSSR } from "somewhere";
				import { Component } from "./Component";
				renderSSR(<Component />);
			`;

			const result = await handler(code, "/src/component.tsx");
			expect(result).not.toBeNull();
		});
	});

	describe("transformation functionality", () => {
		it("should transform renderSSR calls with components", async () => {
			const { handler } = await getTransform();

			const code = `
				import { Counter } from "./fixtures/Counter";
				
				test("example", () => {
					renderSSR(<Counter initialCount={5} />);
				});
			`;

			const result = await handler(code, "/test/transform.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSR(");
			expect(result!.code).toContain('"Counter"');
			expect(result!.code).toContain('"initialCount": 5');
			expect(result!.code).toContain(
				'import { commands } from "vitest/browser"',
			);
		});

		it("should handle string literal props", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					renderSSR(<MyComponent title="Hello" />);
				});
			`;

			const result = await handler(code, "/test/string-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"title": "Hello"');
		});

		it("should handle multiple renderSSR calls", async () => {
			const { handler } = await getTransform();

			const code = `
				import { Counter } from "./fixtures/Counter";
				import { HelloWorld } from "./fixtures/HelloWorld";
				
				test("example", () => {
					renderSSR(<Counter initialCount={1} />);
					renderSSR(<HelloWorld />);
				});
			`;

			const result = await handler(code, "/test/multiple.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"Counter"');
			expect(result!.code).toContain('"initialCount": 1');
			expect(result!.code).toContain('"HelloWorld"');
		});

		it("should not add commands import if already present", async () => {
			const { handler } = await getTransform();

			const code = `
			import { commands } from "vitest/browser";
			import { Counter } from "./fixtures/Counter";
			
			test("example", () => {
				renderSSR(<Counter />);
			});
		`;

			const result = await handler(code, "/test/existing-commands.test.tsx");
			expect(result).not.toBeNull();
			const importMatches = result!.code.match(
				/import.*commands.*from.*vitest\/browser/g,
			);
			expect(importMatches).toHaveLength(1);
		});

		it("should handle absolute imports", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "@/components/MyComponent";
				
				test("example", () => {
					renderSSR(<MyComponent />);
				});
			`;

			const result = await handler(code, "/test/absolute-import.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("@/components/MyComponent.tsx");
			expect(result!.code).toContain('"MyComponent"');
		});

		it("should preserve file extensions when present", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "./fixtures/MyComponent.tsx";
				
				test("example", () => {
					renderSSR(<MyComponent />);
				});
			`;

			const result = await handler(code, "/test/with-extension.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("MyComponent.tsx");
			expect(result!.code).toContain('"MyComponent"');
		});
	});

	describe("local component support", () => {
		it("should detect local component definitions", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/local-component.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSRLocal");
			expect(result!.code).toContain('"LocalComponent"');
			expect(result!.code).toContain("const LocalComponent = component$");
		});

		it("should handle local components with props", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/local-with-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSRLocal");
			expect(result!.code).toContain('"CounterComponent"');
			expect(result!.code).toContain('"initialValue": 5');
		});

		it("should handle local components with useTask$", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/local-with-task.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSRLocal");
			expect(result!.code).toContain('"TaskComponent"');
			expect(result!.code).toContain("useTask$");
		});

		it("should handle mixed local and imported components", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/mixed-components.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSR(");
			expect(result!.code).toContain("commands.renderSSRLocal(");
			expect(result!.code).toContain('"Counter"');
			expect(result!.code).toContain('"LocalComponent"');
		});

		it("should handle multiple local components", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/multiple-local.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"FirstComponent"');
			expect(result!.code).toContain('"SecondComponent"');
			const localCalls = result!.code.match(/commands\.renderSSRLocal/g);
			expect(localCalls).toHaveLength(2);
		});

		it("should handle local components with complex expressions", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/complex-local.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSRLocal");
			expect(result!.code).toContain('"ComplexComponent"');
			expect(result!.code).toContain('"data": testData');
		});

		it("should not transform local components without renderSSR calls", async () => {
			const { handler } = await getTransform();

			const code = `
				import { component$, useSignal } from "@builder.io/qwik";
				
				const UnusedComponent = component$(() => {
					return <div>Not used</div>;
				});
				
				test("example", () => {
					console.log("No renderSSR call here");
				});
			`;

			const result = await handler(code, "/test/unused-local.test.tsx");
			expect(result).toBeNull();
		});
	});

	describe("edge cases", () => {
		it("should handle missing component imports gracefully", async () => {
			const { handler } = await getTransform();

			const code = `
				test("example", () => {
					renderSSR(<SomeComponent />);
				});
			`;

			const result = await handler(code, "/test/missing-import.test.tsx");
			expect(result).toBeNull();
		});

		it("should handle complex prop expressions", async () => {
			const { handler } = await getTransform();

			const code = `
				import { Counter } from "./fixtures/Counter";
				
				test("example", () => {
					const count = 5;
					renderSSR(<Counter initialCount={count + 1} />);
				});
			`;

			const result = await handler(code, "/test/complex-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("Counter");
		});

		it("should handle nested JSX elements", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/nested-jsx.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("Wrapper");
		});
	});

	describe("transformation correctness", () => {
		it("should properly transform with real component imports", async () => {
			const { handler } = await getTransform();

			const code = `
				import { Counter } from "./fixtures/Counter";
				
				test("should render counter", () => {
					const result = renderSSR(<Counter initialCount={5} />);
					expect(result.html).toContain("5");
				});
			`;

			const result = await handler(code, "test/counter.test.tsx");

			expect(result).not.toBeNull();
			expect(result!.code).toContain("commands.renderSSR");
			expect(result!.code).toContain("Counter");
			expect(result!.code).toContain('"initialCount": 5');
			expect(result!.code).toContain("import { commands }");
		});
	});

	describe("complex JSX expressions", () => {
		it("should handle array expressions", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const items = ["a", "b"];
					renderSSR(<MyComponent list={[1, 2, 3]} items={items} />);
				});
			`;

			const result = await handler(code, "/test/array-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"list": [1, 2, 3]');
			expect(result!.code).toContain('"items": items');
		});

		it("should handle object expressions", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const user = { name: "John" };
					renderSSR(<MyComponent config={{ theme: "dark", size: 10 }} user={user} />);
				});
			`;

			const result = await handler(code, "/test/object-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"config": { theme: "dark", size: 10 }');
			expect(result!.code).toContain('"user": user');
		});

		it("should handle variable references", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const count = 5;
					const isVisible = true;
					renderSSR(<MyComponent count={count} visible={isVisible} />);
				});
			`;

			const result = await handler(code, "/test/variable-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"count": count');
			expect(result!.code).toContain('"visible": isVisible');
		});

		it("should handle function calls", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					renderSSR(<MyComponent value={getValue()} timestamp={Date.now()} />);
				});
			`;

			const result = await handler(code, "/test/function-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"value": getValue()');
			expect(result!.code).toContain('"timestamp": Date.now()');
		});

		it("should handle complex expressions", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/complex-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"computed": base * 2 + 1');
			expect(result!.code).toContain(
				'"conditional": base > 5 ? "high" : "low"',
			);
			expect(result!.code).toContain('"member": obj.property');
			expect(result!.code).toContain('"template": `value: $' + "{base}`");
		});

		it("should handle spread syntax", async () => {
			const { handler } = await getTransform();

			const code = `
				import { MyComponent } from "./fixtures/MyComponent";
				
				test("example", () => {
					const props = { a: 1, b: 2 };
					renderSSR(<MyComponent {...props} extra="value" />);
				});
			`;

			const result = await handler(code, "/test/spread-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain("MyComponent");
		});

		it("should handle mixed prop types", async () => {
			const { handler } = await getTransform();

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

			const result = await handler(code, "/test/mixed-props.test.tsx");
			expect(result).not.toBeNull();
			expect(result!.code).toContain('"title": "Hello World"');
			expect(result!.code).toContain('"count": 42');
			expect(result!.code).toContain('"items": items');
			expect(result!.code).toContain('"config": { nested: { value: true } }');
			expect(result!.code).toContain('"handler": () => console.log("click")');
		});
	});
});
