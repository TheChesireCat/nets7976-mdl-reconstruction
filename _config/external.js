// External references (docs/redesign-spec.md §5, §11): Wikipedia summaries cached in data/external.json
// by `npm run refresh-wiki`, keyed by the title as written in pages. The build never touches the network.
import fs from "node:fs";

export const STALE_DAYS = 182;
export const loadExternal = () => (fs.existsSync("data/external.json") ? JSON.parse(fs.readFileSync("data/external.json", "utf8")) : {});
export const wikiUrl = (e) => e.url;
