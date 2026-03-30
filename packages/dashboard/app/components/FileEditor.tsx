interface FileEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  filePath?: string;
}

export function FileEditor({ content, onChange, readOnly, filePath }: FileEditorProps) {
  return (
    <textarea
      className="file-editor-container file-editor-textarea"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      spellCheck={false}
      aria-label={filePath ? `Editor for ${filePath}` : "File editor"}
    />
  );
}
