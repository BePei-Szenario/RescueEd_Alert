import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "output/**",
    ".vinext/**",
    "mobile/build/**",
    "mobile/.dart_tool/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["app/event-attendance/page.tsx", "app/rechtliches/**/page.tsx"],
    rules: {
      // These pages are also delivered as standalone public documents.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["app/connected-dashboard.tsx"],
    rules: {
      // QR previews use runtime blob/API URLs that the image optimizer cannot process.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
