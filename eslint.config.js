import tsParser from "@typescript-eslint/parser";

const noHexColorRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow raw hex color literals in UI components. Use CSS variables instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && /#[0-9a-fA-F]{3,8}\b/.test(node.value)) {
          // Allow theme tokens in theme.css or theme definitions if any, but disallow in components
          if (!context.filename.endsWith("theme.ts") && !context.filename.endsWith("theme.css")) {
            context.report({
              node,
              message: `Forbidden hex color literal "${node.value}". Use design system CSS tokens instead.`,
            });
          }
        }
      },
      TemplateElement(node) {
        if (node.value && node.value.raw && /#[0-9a-fA-F]{3,8}\b/.test(node.value.raw)) {
          if (!context.filename.endsWith("theme.ts") && !context.filename.endsWith("theme.css")) {
            context.report({
              node,
              message: `Forbidden hex color literal "${node.value.raw}". Use design system CSS tokens instead.`,
            });
          }
        }
      },
    };
  },
};

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "yones-lint": {
        rules: {
          "no-hex-colors": noHexColorRule,
        },
      },
    },
    rules: {
      "yones-lint/no-hex-colors": "error",
    },
  },
];
