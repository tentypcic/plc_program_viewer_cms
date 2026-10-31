/** Lexical coloring only; never infers semantics, references, declarations or an AST. */
export type Token = {
  kind: "plain" | "comment" | "string" | "keyword" | "number";
  text: string;
};
const words = new Set(
  "IF THEN ELSIF ELSE END_IF CASE OF END_CASE FOR TO BY DO END_FOR WHILE END_WHILE REPEAT UNTIL END_REPEAT REGION END_REGION VAR VAR_INPUT VAR_OUTPUT VAR_IN_OUT VAR_TEMP VAR_CONSTANT END_VAR FUNCTION END_FUNCTION FUNCTION_BLOCK END_FUNCTION_BLOCK DATA_BLOCK END_DATA_BLOCK ORGANIZATION_BLOCK END_ORGANIZATION_BLOCK TYPE END_TYPE STRUCT END_STRUCT BEGIN END AND OR XOR NOT TRUE FALSE RETURN EXIT CONTINUE BOOL BYTE WORD DWORD INT DINT UINT REAL LREAL STRING ARRAY TIME TON TOF TP".split(
    " ",
  ),
);
export function tokenize(source: string): Token[] {
  const result: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const start = i;
    let kind: Token["kind"] = "plain";
    if (source.startsWith("//", i)) {
      kind = "comment";
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
    } else if (source.startsWith("(*", i) || source.startsWith("/*", i)) {
      kind = "comment";
      const close = source.startsWith("(*", i) ? "*)" : "*/";
      const end = source.indexOf(close, i + 2);
      i = end < 0 ? source.length : end + 2;
    } else if (source[i] === "'" || source[i] === '"') {
      kind = "string";
      const q = source[i++];
      while (i < source.length) {
        if (source[i] === "$") {
          i = Math.min(i + 2, source.length);
          continue;
        }
        if (source[i++] === q) {
          if (source[i] === q) {
            i++;
            continue;
          }
          break;
        }
      }
    } else if (/[A-Za-z_]/.test(source[i])) {
      i++;
      while (i < source.length && /[\w]/.test(source[i])) i++;
      if (words.has(source.slice(start, i).toUpperCase())) kind = "keyword";
    } else if (/\d/.test(source[i])) {
      kind = "number";
      i++;
      while (i < source.length && /[\d.A-Fa-f_#]/.test(source[i])) i++;
    } else i++;
    const text = source.slice(start, i);
    const last = result.at(-1);
    if (last?.kind === kind) last.text += text;
    else result.push({ kind, text });
  }
  return result;
}
