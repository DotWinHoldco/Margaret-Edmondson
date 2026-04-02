'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState, useEffect } from 'react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
}

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void
  active?: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-xs font-body font-semibold transition-colors ${
        active
          ? 'bg-teal/15 text-teal'
          : 'text-charcoal/40 hover:text-charcoal/70 hover:bg-charcoal/5'
      }`}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  minHeight = '100px',
}: RichTextEditorProps) {
  const [htmlMode, setHtmlMode] = useState(false)
  const [htmlSource, setHtmlSource] = useState(content)

  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none font-body text-sm text-charcoal focus:outline-none`,
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
      setHtmlSource(html)
    },
  })

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
      setHtmlSource(content)
    }
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  function toggleHtmlMode() {
    if (htmlMode) {
      // Switching from HTML → visual: apply the raw HTML to the editor
      editor!.commands.setContent(htmlSource)
      onChange(htmlSource)
    } else {
      // Switching from visual → HTML: sync the source
      setHtmlSource(editor!.getHTML())
    }
    setHtmlMode(!htmlMode)
  }

  return (
    <div className="rounded-lg border border-charcoal/12 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-teal/30 focus-within:border-teal/40 transition-all">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-charcoal/8 bg-charcoal/[0.02]">
        {!htmlMode && (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive('heading', { level: 2 })}
              title="Heading"
            >
              H2
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor.isActive('heading', { level: 3 })}
              title="Subheading"
            >
              H3
            </ToolbarButton>
            <div className="w-px h-4 bg-charcoal/10 mx-1" />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive('bold')}
              title="Bold"
            >
              B
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive('italic')}
              title="Italic"
            >
              <span className="italic">I</span>
            </ToolbarButton>
            <div className="w-px h-4 bg-charcoal/10 mx-1" />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive('bulletList')}
              title="Bullet list"
            >
              &bull; List
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive('orderedList')}
              title="Numbered list"
            >
              1. List
            </ToolbarButton>
            <div className="w-px h-4 bg-charcoal/10 mx-1" />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive('blockquote')}
              title="Quote"
            >
              &ldquo; Quote
            </ToolbarButton>
          </>
        )}
        <div className="flex-1" />
        <ToolbarButton
          onClick={toggleHtmlMode}
          active={htmlMode}
          title="Toggle HTML source"
        >
          &lt;/&gt; HTML
        </ToolbarButton>
      </div>
      {/* Editor / HTML Source */}
      {htmlMode ? (
        <textarea
          value={htmlSource}
          onChange={(e) => {
            setHtmlSource(e.target.value)
            onChange(e.target.value)
          }}
          spellCheck={false}
          className="w-full px-3 py-2.5 font-mono text-xs text-charcoal bg-charcoal/[0.02] focus:outline-none resize-y"
          style={{ minHeight }}
        />
      ) : (
        <div className="px-3 py-2.5 relative">
          <EditorContent editor={editor} />
          {editor.isEmpty && (
            <div className="absolute top-2.5 left-3 pointer-events-none text-charcoal/25 text-sm font-body">
              {placeholder}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
