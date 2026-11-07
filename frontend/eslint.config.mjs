import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: ["cloudflare-env.d.ts"],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
