// @ts-check
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["**/*.ts"],
    extends: tseslint.configs.recommended,
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      "@typescript-eslint/only-throw-error": "warn",
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "default", format: ["camelCase"] },
        { selector: "variable", format: ["camelCase", "UPPER_CASE"], leadingUnderscore: "allow" },
        { selector: "objectLiteralProperty", format: ["camelCase", "UPPER_CASE"], leadingUnderscore: "allow" },
        { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "memberLike", modifiers: ["private"], format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "typeLike", format: ["PascalCase"] },
        // External API fields (e.g. Elasticsearch _source) may use leading underscores
        { selector: "typeProperty", format: null, filter: { regex: "^_", match: true } },
      ],
      curly: "warn",
      eqeqeq: "warn",
      semi: "warn",
    },  
  }
);
