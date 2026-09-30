import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  indentString,
  indentUnit,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { type MutableRefObject, useEffect, useRef } from "react";
import { lex, type Token } from "../src/lexer";

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "#d5e3d3",
    fontFamily: '"Cascadia Code", Consolas, monospace',
    fontSize: "12px",
  },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.9", fontFamily: "inherit" },
  ".cm-content": { padding: "15px 14px 15px 0", caretColor: "#ffffff" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#ffffff",
    borderLeftWidth: "2px",
  },
  ".cm-line": { padding: "0" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "#546257",
    border: "0",
    paddingRight: "10px",
  },
  ".cm-gutter": { minWidth: "36px" },
  ".cm-activeLine": { backgroundColor: "#ffffff08" },
  ".cm-activeLineGutter": { backgroundColor: "#ffffff08", color: "#a9c78a" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "#45623f !important",
  },
  "&.cm-focused": { outline: "none" },
});

const syntaxStyle = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#b2d77a", fontWeight: "600" },
    { tag: tags.bool, color: "#c4a7e7" },
    { tag: tags.number, color: "#e0bc79" },
    { tag: tags.string, color: "#8fc9a8" },
    { tag: tags.variableName, color: "#d5e3d3" },
    { tag: tags.operator, color: "#86b6d8" },
    { tag: tags.comment, color: "#829186", fontStyle: "italic" },
    { tag: tags.punctuation, color: "#b5c1b6" },
    { tag: tags.invalid, color: "#f09287", textDecoration: "underline wavy" },
  ]),
);

type GujLangStreamState = { line: string | null; tokens: Token[]; nextToken: number };

function indentationForLine(doc: EditorState["doc"], lineStart: number): number {
  const closerPattern = /^(?:bas|end)\b/iu;
  const openerPattern = /\b(?:kar|do)\s*$/iu;
  let depth = 0;
  for (let pos = lineStart - 1; pos >= 0; ) {
    const line = doc.lineAt(pos);
    const code = line.text.replace(/(?:#|\/\/).*$/, "").trim();
    if (closerPattern.test(code)) depth++;
    else if (openerPattern.test(code)) {
      if (depth === 0) return /^\s*/.exec(line.text)?.[0].length ?? 0;
      depth--;
    }
    if (line.from === 0) break;
    pos = line.from - 1;
  }
  return 0;
}

const gujLang = StreamLanguage.define<GujLangStreamState>({
  name: "GujLang",
  languageData: {},
  startState: () => ({ line: null, tokens: [], nextToken: 0 }),
  indent(_state, textAfter, context) {
    const current = context.lineAt(context.state.selection.main.head);
    const currentCode = current.text.replace(/(?:#|\/\/).*$/, "").trim();
    const closer = /^(?:bas|end|else|nahi\s+to)\b/iu.test(currentCode || textAfter.trimStart());
    const matchCloser = (line: string) => /^(?:bas|end)\b/iu.test(line);
    const matchOpener = (line: string) => /\b(?:kar|do)\s*$/iu.test(line);
    let depth = 0;

    for (let pos = current.from - 1; pos >= 0; ) {
      const line = context.lineAt(pos);
      const code = line.text.replace(/(?:#|\/\/).*$/, "").trim();
      if (matchCloser(code)) depth++;
      else if (matchOpener(code)) {
        if (depth === 0) {
          const baseIndent = context.lineIndent(line.from);
          return closer ? baseIndent : baseIndent + context.unit;
        }
        depth--;
      }
      if (line.from === 0) break;
      pos = line.from - 1;
    }

    let previous = context.lineAt(Math.max(0, current.from - 1));
    while (!previous.text.trim() && previous.from > 0) previous = context.lineAt(previous.from - 1);
    const previousCode = previous.text.replace(/(?:#|\/\/).*$/, "").trim();
    const indentation = context.lineIndent(previous.from);
    if (matchOpener(previousCode)) return indentation + context.unit;
    if (matchCloser(currentCode || textAfter.trimStart()))
      return Math.max(0, indentation - context.unit);
    return indentation;
  },
  token(stream, state) {
    if (stream.sol()) {
      state.line = stream.string;
      state.tokens = lex(stream.string).tokens.filter((token) => token.kind !== "eof");
      state.nextToken = 0;
    }
    if (stream.eatSpace()) return null;
    const rest = stream.string.slice(stream.pos);
    if (rest.startsWith("#") || rest.startsWith("//")) {
      stream.skipToEnd();
      return "comment";
    }
    while (state.tokens[state.nextToken]?.span.start < stream.pos) state.nextToken++;
    const token = state.tokens[state.nextToken];
    if (!token || token.span.start !== stream.pos || token.span.end <= 0) {
      stream.next();
      return "invalid";
    }
    state.nextToken++;
    stream.pos = token.span.end;
    if (token.kind === "keyword") return "keyword";
    if (token.kind === "identifier") return "variableName";
    if (token.kind === "number") return "number";
    if (token.kind === "string") return "string";
    if (token.kind === "operator") return "operator";
    if (token.kind === "punctuation") return "punctuation";
    return "invalid";
  },
});

export type GujLangEditorHandle = {
  focus: () => void;
  selectRange: (from: number, to: number) => void;
  replaceDocument: (value: string) => void;
  getDocument: () => string;
};

export function GujLangEditor({
  value,
  onChange,
  sourceEpoch,
  editorRef,
}: {
  value: string;
  onChange: (value: string) => void;
  sourceEpoch: number;
  editorRef: MutableRefObject<GujLangEditorHandle | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, value, sourceEpoch });
  const mountedEpoch = useRef(sourceEpoch);
  const editorDocument = useRef(value);
  callbacks.current.onChange = onChange;
  callbacks.current.value = value;
  callbacks.current.sourceEpoch = sourceEpoch;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      doc: callbacks.current.value,
      parent: host.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        closeBrackets(),
        EditorState.transactionFilter.of((transaction) => {
          if (!transaction.docChanged || !transaction.isUserEvent("input.type")) return transaction;
          const { head } = transaction.newSelection.main;
          const line = transaction.newDoc.lineAt(head);
          const typedLine = line.text.slice(0, head - line.from).trim();
          if (!/^(?:bas|end|else|nahi\s+to)$/iu.test(typedLine)) return transaction;
          const baseIndent = indentationForLine(transaction.newDoc, line.from);
          const indent = indentString(transaction.startState, baseIndent);
          const currentIndent = /^\s*/.exec(line.text)?.[0] ?? "";
          if (currentIndent === indent) return transaction;
          return [
            transaction,
            {
              changes: { from: line.from, to: line.from + currentIndent.length, insert: indent },
              sequential: true,
            },
          ];
        }),
        highlightActiveLine(),
        indentUnit.of("  "),
        keymap.of([...closeBracketsKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap]),
        gujLang,
        syntaxStyle,
        editorTheme,
        EditorView.contentAttributes.of({
          "aria-label": "GujLang source editor",
          spellcheck: "false",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            editorDocument.current = update.state.doc.toString();
            callbacks.current.onChange(editorDocument.current);
          }
        }),
      ],
    });
    editorRef.current = {
      focus: () => view.focus(),
      selectRange: (from, to) => {
        view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
        view.focus();
      },
      replaceDocument: (next) => {
        if (view.state.doc.toString() !== next) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
          editorDocument.current = next;
        }
      },
      getDocument: () => view.state.doc.toString(),
    };
    return () => {
      editorRef.current = null;
      view.destroy();
    };
  }, [editorRef]);

  useEffect(() => {
    if (editorRef.current && (mountedEpoch.current !== sourceEpoch || !editorDocument.current)) {
      editorRef.current.replaceDocument(value);
      editorDocument.current = value;
      mountedEpoch.current = sourceEpoch;
    }
  }, [editorRef, value, sourceEpoch]);

  return <div ref={host} className="gujlang-editor" />;
}
