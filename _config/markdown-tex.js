// markdown-it rule: leave \( ... \) and \[ ... \] exactly as written, for MathJax in the browser.
// CommonMark would otherwise read "\(" as an escaped "(" and drop the backslash, and "_" / "*"
// inside the TeX as emphasis. Runs before markdown-it's own "escape" rule; the TeX is only
// HTML-escaped (MathJax reads text content, so &lt; comes back as <). No server-side rendering.
// Limits: display math must not contain a blank line (that ends the paragraph), and like any
// paragraph it must not be indented 4 spaces (that makes a code block).
const CLOSE = { "(": "\\)", "[": "\\]" };

export default function texPassthrough(md) {
  md.inline.ruler.before("escape", "tex_passthrough", (state, silent) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) !== 0x5c /* \ */) return false;
    const open = src[pos + 1];
    if (!(open in CLOSE)) return false;
    const end = src.indexOf(CLOSE[open], pos + 2);
    if (end < 0) return false; // no closer: let "escape" treat it as an ordinary \(
    if (!silent) state.push("tex_passthrough", "", 0).content = src.slice(pos, end + 2);
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.tex_passthrough = (tokens, i) => md.utils.escapeHtml(tokens[i].content);
}
