import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
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
import { lex } from "../src/lexer";

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

const gujLang = StreamLanguage.define({
  name: "GujLang",
  languageData: { indentOnInput: /^\s*(?:bas|end)\b/iu },
  token(stream) {
    if (stream.eatSpace()) return null;
    const rest = stream.string.slice(stream.pos);
    if (rest.startsWith("#") || rest.startsWith("//")) {
      stream.skipToEnd();
      return "comment";
    }
    const scanned = lex(stream.string);
    const token = scanned.tokens.find(
      (candidate) => candidate.kind !== "eof" && candidate.span.start === stream.pos,
    );
    if (!token || token.span.end <= 0) {
      stream.next();
      return "invalid";
    }
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
        highlightActiveLine(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
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
