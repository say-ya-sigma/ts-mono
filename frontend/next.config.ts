import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// `typescript` は @typescript/typescript6 エイリアス (tsc6 のみで bin/tsc を持たない) ため、
	// デフォルトの CLI モード (useTypeScriptCli: true) だと next dev が依存解決に失敗する。
	// コンパイラ API (lib/typescript.js) を使うモードに切り替える。
	experimental: {
		useTypeScriptCli: false,
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
