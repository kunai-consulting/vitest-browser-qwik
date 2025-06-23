import { dirname, relative, resolve } from "node:path";
import type {
	BindingIdentifier,
	CallExpression,
	ImportDeclaration,
	ImportDefaultSpecifier,
	ImportSpecifier,
	JSXAttribute,
	JSXAttributeItem,
	JSXElement,
	JSXExpressionContainer,
	Node,
	Span,
	VariableDeclarator,
} from "@oxc-project/types";
import type { Plugin } from "vitest/config";

// Helper to safely traverse AST children
function traverseChildren(
	node: Node,
	callback: (child: Node) => boolean | undefined,
): boolean {
	for (const key in node) {
		const child = (node as unknown as Record<string, unknown>)[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (item && typeof item === "object" && callback(item as Node)) {
					return true;
				}
			}
		} else if (child && typeof child === "object") {
			if (callback(child as Node)) return true;
		}
	}
	return false;
}

// Helper function to check if code contains renderSSR calls using semantic analysis
async function hasRenderSSRCall(
	code: string,
	filename: string,
): Promise<boolean> {
	try {
		const { parseSync } = await import("oxc-parser");
		const ast = parseSync(filename, code);
		const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
		let hasRenderSSRCallInCode = false;

		function walkForDetection(node: Node): boolean {
			if (!node || typeof node !== "object") return false;

			// Track renderSSR imports and aliases
			if (node.type === "ImportDeclaration") {
				const importDecl = node as ImportDeclaration;
				if (!importDecl.source?.value || !importDecl.specifiers) return false;

				for (const spec of importDecl.specifiers) {
					if (spec.type === "ImportSpecifier") {
						const importSpec = spec as ImportSpecifier;
						if (importSpec.imported.type !== "Identifier") continue;
						if (importSpec.imported.name === "renderSSR") {
							renderSSRIdentifiers.add(importSpec.local.name);
						}
					} else if (spec.type === "ImportDefaultSpecifier") {
						const defaultSpec = spec as ImportDefaultSpecifier;
						if (defaultSpec.local.name.toLowerCase().includes("renderssr")) {
							renderSSRIdentifiers.add(defaultSpec.local.name);
						}
					}
				}
			}

			// Track declared renderSSR functions (including TypeScript declares)
			if (node.type === "FunctionDeclaration") {
				const funcDecl = node as { id?: { name: string } };
				if (funcDecl.id?.name === "renderSSR") {
					renderSSRIdentifiers.add("renderSSR");
				}
			}

			// Track TypeScript declare statements
			if (node.type === "TSDeclareFunction") {
				const declareFunc = node as { id?: { name: string } };
				if (declareFunc.id?.name === "renderSSR") {
					renderSSRIdentifiers.add("renderSSR");
				}
			}

			// Track variable aliases
			if (node.type === "VariableDeclarator") {
				const varDecl = node as VariableDeclarator;
				if (varDecl.id.type !== "Identifier") return false;
				if (varDecl.init?.type !== "Identifier") return false;
				if (!renderSSRIdentifiers.has(varDecl.init.name)) return false;

				const bindingId = varDecl.id as BindingIdentifier;
				renderSSRIdentifiers.add(bindingId.name);
			}

			// Check for renderSSR calls
			if (node.type === "CallExpression") {
				const callExpr = node as CallExpression;
				if (callExpr.callee.type === "Identifier") {
					if (renderSSRIdentifiers.has(callExpr.callee.name)) {
						hasRenderSSRCallInCode = true;
						return true;
					}
				}
			}

			// Recursively check children
			return traverseChildren(node, walkForDetection);
		}

		walkForDetection(ast as unknown as Node);

		// If we have renderSSR calls, transform the code
		// This handles both cases:
		// 1. Explicit imports/declares with calls
		// 2. Direct renderSSR calls (common in tests)
		const hasCallsInString = code.includes("renderSSR(");
		const result = hasRenderSSRCallInCode || hasCallsInString;

		return result;
	} catch (error) {
		console.warn(
			`Failed to parse ${filename} for renderSSR detection, falling back to string check:`,
			error,
		);
		return code.includes("renderSSR");
	}
}

function resolveComponentPath(importPath: string, testFileId: string): string {
	if (!importPath.startsWith(".")) {
		// Absolute import, add extension if needed
		return importPath.endsWith(".tsx") || importPath.endsWith(".ts")
			? importPath
			: `${importPath}.tsx`;
	}

	// Relative import - resolve relative to test file
	const testFileDir = dirname(testFileId);
	const resolvedPath = resolve(testFileDir, importPath);
	const projectRoot = process.cwd();
	let componentPath = `./${relative(projectRoot, resolvedPath)}`;

	// Add extension if needed
	if (!componentPath.endsWith(".tsx") && !componentPath.endsWith(".ts")) {
		componentPath += ".tsx";
	}

	return componentPath;
}

function extractPropsFromJSX(
	attributes: JSXAttributeItem[],
	sourceCode: string,
): Record<string, string> {
	const props: Record<string, string> = {};

	for (const attr of attributes) {
		if (attr.type !== "JSXAttribute") continue;

		const jsxAttr = attr as JSXAttribute;
		if (jsxAttr.name.type !== "JSXIdentifier") continue;

		const propName = jsxAttr.name.name;
		if (!jsxAttr.value) continue;

		if (jsxAttr.value.type === "JSXExpressionContainer") {
			// Extract the raw source code of the expression
			const container = jsxAttr.value as JSXExpressionContainer;
			if (container.expression.type !== "JSXEmptyExpression") {
				const exprSpan = container.expression as { start: number; end: number };
				const expressionCode = sourceCode.slice(exprSpan.start, exprSpan.end);
				props[propName] = expressionCode;
			}
		} else if (jsxAttr.value.type === "Literal") {
			// For string literals, use the actual value
			const literal = jsxAttr.value as { value: unknown };
			props[propName] = JSON.stringify(literal.value);
		}
	}

	return props;
}

function isTestFile(id: string): boolean {
	return id.includes(".test.") || id.includes(".spec.");
}

function hasCommandsImport(node: Node): boolean {
	if (node.type !== "ImportDeclaration") return false;

	const importDecl = node as ImportDeclaration;
	if (importDecl.source?.value !== "@vitest/browser/context") return false;
	if (!importDecl.specifiers) return false;

	return importDecl.specifiers.some(
		(spec) =>
			spec.type === "ImportSpecifier" &&
			spec.imported.type === "Identifier" &&
			spec.imported.name === "commands",
	);
}

// Vite plugin that transforms renderSSR(<Component />) calls to commands.renderSSR() calls
export function createSSRTransformPlugin(): Plugin {
	return {
		name: "vitest:ssr-transform",
		enforce: "pre",

		async transform(code, id) {
			if (!isTestFile(id)) return null;
			if (!(await hasRenderSSRCall(code, id))) return null;

			try {
				const { parseSync } = await import("oxc-parser");
				const MagicString = (await import("magic-string")).default;

				const ast = parseSync(id, code);
				const s = new MagicString(code);

				const componentImports = new Map<string, string>();
				const renderSSRIdentifiers = new Set<string>(["renderSSR"]);
				let hasExistingCommandsImport = false;

				function walkForTransformation(node: Node): undefined {
					if (!node || typeof node !== "object") return;

					// Track component imports
					if (node.type === "ImportDeclaration") {
						const importDecl = node as ImportDeclaration;
						if (importDecl.source?.value && importDecl.specifiers) {
							const source = importDecl.source.value;
							for (const spec of importDecl.specifiers) {
								if (spec.type === "ImportSpecifier") {
									const importSpec = spec as ImportSpecifier;
									if (importSpec.imported.type === "Identifier") {
										componentImports.set(importSpec.imported.name, source);

										// Also track renderSSR aliases
										if (importSpec.imported.name === "renderSSR") {
											renderSSRIdentifiers.add(importSpec.local.name);
										}
									}
								} else if (spec.type === "ImportDefaultSpecifier") {
									const defaultSpec = spec as ImportDefaultSpecifier;
									if (
										defaultSpec.local.name.toLowerCase().includes("renderssr")
									) {
										renderSSRIdentifiers.add(defaultSpec.local.name);
									}
								}
							}
						}
					}

					// Track variable aliases for renderSSR
					if (node.type === "VariableDeclarator") {
						const varDecl = node as VariableDeclarator;
						if (
							varDecl.id.type === "Identifier" &&
							varDecl.init?.type === "Identifier" &&
							renderSSRIdentifiers.has(varDecl.init.name)
						) {
							const bindingId = varDecl.id as BindingIdentifier;
							renderSSRIdentifiers.add(bindingId.name);
						}
					}

					// Check for existing commands import
					if (hasCommandsImport(node)) {
						hasExistingCommandsImport = true;
					}

					// Transform renderSSR calls
					if (node.type === "CallExpression") {
						const callExpr = node as CallExpression;
						if (
							callExpr.callee.type === "Identifier" &&
							renderSSRIdentifiers.has(callExpr.callee.name)
						) {
							const jsxArg = callExpr.arguments?.[0];
							if (jsxArg?.type === "JSXElement") {
								const jsxElement = jsxArg as JSXElement;
								if (jsxElement.openingElement?.name?.type === "JSXIdentifier") {
									const componentName = jsxElement.openingElement.name.name;
									const componentImportPath =
										componentImports.get(componentName);
									if (componentImportPath) {
										const componentPath = resolveComponentPath(
											componentImportPath,
											id,
										);
										const props = extractPropsFromJSX(
											jsxElement.openingElement.attributes || [],
											code,
										);

										// Generate props object with proper JavaScript expressions
										let propsStr = "";
										if (Object.keys(props).length > 0) {
											const propsEntries = Object.entries(props).map(
												([key, value]) => {
													return `${JSON.stringify(key)}: ${value}`;
												},
											);
											propsStr = `, { ${propsEntries.join(", ")} }`;
										}

										const replacement = `(async () => {
											const { html } = await commands.renderSSR("${componentPath}", "${componentName}"${propsStr});
											return renderServerHTML(html);
										})()`;

										const spanNode = node as Node & Span;
										s.overwrite(spanNode.start, spanNode.end, replacement);
									}
								}
							}
						}
					}

					// Recursively walk children
					traverseChildren(node, walkForTransformation);
					return;
				}

				walkForTransformation(ast as unknown as Node);

				// Add commands import if needed and we made changes
				if (!hasExistingCommandsImport && s.hasChanged()) {
					let lastImportEnd = 0;

					function findLastImport(node: Node): undefined {
						if (!node || typeof node !== "object") return;

						if (node.type === "ImportDeclaration") {
							const spanNode = node as Node & Span;
							lastImportEnd = Math.max(lastImportEnd, spanNode.end);
						}

						traverseChildren(node, findLastImport);
						return undefined;
					}

					findLastImport(ast as unknown as Node);

					if (lastImportEnd > 0) {
						s.appendLeft(
							lastImportEnd,
							'\nimport { commands } from "@vitest/browser/context";\nimport { renderServerHTML } from "../src";',
						);
					}
				}

				if (s.hasChanged()) {
					return {
						code: s.toString(),
						map: s.generateMap({ hires: true }),
					};
				}
			} catch (error) {
				console.warn(`Failed to transform ${id}:`, error);
			}

			return null;
		},
	};
}
