import { useEffect, useMemo, useRef } from 'react'

const CLICK_THRESHOLD_PX = 3
const MIN_W = 120
const MIN_H = 60
const EMPTY_HTML = '<span style="color:#3F3F46">(empty)</span>'
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'P', 'BR', 'UL', 'OL', 'LI', 'DIV', 'SPAN', 'H3', 'IMG'])

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${yr}-${mo}-${da} ${hh}:${mm}`
}

function ToolbarBtn({ cmd, arg, title, children, editorRef }) {
  return (
    <button
      title={title}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => {
        e.preventDefault()
        editorRef.current?.focus()
        document.execCommand(cmd, false, arg ?? null)
      }}
      className="px-2 py-0.5 rounded text-xs hover:bg-[#2A2A2E] transition"
      style={{ color: '#A1A1AA' }}
    >
      {children}
    </button>
  )
}

export default function CanvasBox({ box, selected, editing, onSelect, onStartEdit, onStopEdit, onDelete, onUpdate, onConnectorDown, zoom = 1 }) {
  const dragRef = useRef(null)
  const resizeRef = useRef(null)
  const editorRef = useRef(null)
  const saveTimer = useRef(null)
  const borderColor = (editing || selected) ? '#7A5CFF' : '#34343A'
  const sanitizedHtml = useMemo(() => sanitizeHtml(box.html), [box.html])

  useEffect(() => {
    if (editing && editorRef.current) {
      if (editorRef.current.innerHTML !== (box.html || '')) {
        editorRef.current.innerHTML = box.html || ''
      }
      editorRef.current.focus()
      // Place caret at end
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editorRef.current)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    // Cleanup: flush any pending 300ms save before re-entry or unmount, so a rapid
    // double-click-away-and-back can't lose the last keystroke.
    return () => {
      if (saveTimer.current && editorRef.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
        const html = editorRef.current.innerHTML ?? ''
        onUpdate({ html, updated_at: new Date().toISOString() })
      }
    }
  }, [editing])

  function onEditorInput() {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const html = editorRef.current?.innerHTML ?? ''
      onUpdate({ html, updated_at: new Date().toISOString() })
    }, 300)
  }

  function onEditorKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      clearTimeout(saveTimer.current)
      const html = editorRef.current?.innerHTML ?? ''
      onUpdate({ html, updated_at: new Date().toISOString() })
      onStopEdit()
    }
    // Stop keyboard events from bubbling to NoteCanvas's keyboard delete handler (Task 10)
    e.stopPropagation()
  }

  function onHeaderPointerDown(e) {
    if (e.button !== 0 || editing) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBoxX: box.x,
      startBoxY: box.y,
      moved: false,
    }
  }

  function onHeaderPointerMove(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const screenDx = e.clientX - d.startClientX
    const screenDy = e.clientY - d.startClientY
    if (!d.moved && Math.hypot(screenDx, screenDy) >= CLICK_THRESHOLD_PX) d.moved = true
    if (d.moved) {
      // Box coords are in canvas space; divide screen-space delta by zoom.
      onUpdate({ x: d.startBoxX + screenDx / zoom, y: d.startBoxY + screenDy / zoom })
    }
  }

  function onHeaderPointerUp(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d.moved) onSelect()
    dragRef.current = null
  }

  function onResizePointerDown(corner, e) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = {
      pointerId: e.pointerId,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    }
  }

  function onResizePointerMove(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    // Convert screen-space pointer delta into canvas-space delta.
    const dx = (e.clientX - r.startClientX) / zoom
    const dy = (e.clientY - r.startClientY) / zoom
    const { x: sx, y: sy, width: sw, height: sh } = r.startBox
    let next = { x: sx, y: sy, width: sw, height: sh }

    if (r.corner === 'se') {
      next.width = Math.max(MIN_W, sw + dx)
      next.height = Math.max(MIN_H, sh + dy)
    } else if (r.corner === 'sw') {
      const w = Math.max(MIN_W, sw - dx)
      next.x = sx + (sw - w)
      next.width = w
      next.height = Math.max(MIN_H, sh + dy)
    } else if (r.corner === 'ne') {
      const h = Math.max(MIN_H, sh - dy)
      next.y = sy + (sh - h)
      next.width = Math.max(MIN_W, sw + dx)
      next.height = h
    } else if (r.corner === 'nw') {
      const w = Math.max(MIN_W, sw - dx)
      const h = Math.max(MIN_H, sh - dy)
      next.x = sx + (sw - w)
      next.y = sy + (sh - h)
      next.width = w
      next.height = h
    }
    onUpdate(next)
  }

  function onResizePointerUp(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    resizeRef.current = null
  }

  function renderHandle(corner, cursor, posStyle) {
    return (
      <div
        onPointerDown={e => onResizePointerDown(corner, e)}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        style={{
          position: 'absolute',
          width: 12,
          height: 12,
          ...posStyle,
          cursor,
          backgroundColor: '#7A5CFF',
          border: '1px solid #0D0D0F',
          borderRadius: 2,
          zIndex: 2,
        }}
      />
    )
  }

  return (
    <div
      onPointerDown={e => { if (editing) return; e.stopPropagation(); onSelect() }}
      onDoubleClick={e => { e.stopPropagation(); onStartEdit() }}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        backgroundColor: '#1C1C20',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: (selected || editing) ? '0 0 0 1px #7A5CFF40' : 'none',
      }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        style={{
          minHeight: 24,
          borderBottom: '1px solid #34343A',
          backgroundColor: '#0D0D0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 6px',
          cursor: editing ? 'default' : 'move',
          userSelect: 'none',
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
          gap: 4,
        }}
      >
        {editing ? (
          <div className="flex items-center gap-0.5 flex-wrap" onPointerDown={e => e.stopPropagation()}>
            <ToolbarBtn cmd="bold" title="Bold" editorRef={editorRef}><b>B</b></ToolbarBtn>
            <ToolbarBtn cmd="italic" title="Italic" editorRef={editorRef}><i>I</i></ToolbarBtn>
            <ToolbarBtn cmd="underline" title="Underline" editorRef={editorRef}><u>U</u></ToolbarBtn>
            <ToolbarBtn cmd="insertUnorderedList" title="Bullet list" editorRef={editorRef}>•</ToolbarBtn>
            <ToolbarBtn cmd="insertOrderedList" title="Numbered list" editorRef={editorRef}>1.</ToolbarBtn>
            <ToolbarBtn cmd="formatBlock" arg="h3" title="Heading" editorRef={editorRef}>H</ToolbarBtn>
            <ToolbarBtn cmd="formatBlock" arg="p" title="Paragraph" editorRef={editorRef}>¶</ToolbarBtn>
          </div>
        ) : (
          <span className="mono text-xs" style={{ color: '#52525B', fontSize: 10 }}>{formatDate(box.updated_at)}</span>
        )}
        {selected && !editing && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            onPointerDown={e => e.stopPropagation()}
            className="text-xs hover:text-white transition"
            style={{ color: '#FF453A', padding: '0 4px' }}
            title="Delete box"
          >
            ✕
          </button>
        )}
      </div>

      {editing ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onEditorInput}
          onKeyDown={onEditorKeyDown}
          onPointerDown={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
          className="outline-none"
          style={{
            flex: 1,
            padding: '8px 12px',
            color: '#D4D4D8',
            fontSize: '13px',
            lineHeight: '1.65',
            overflow: 'auto',
            caretColor: '#7A5CFF',
            userSelect: 'text',
          }}
          data-placeholder="Type here..."
        />
      ) : (
        <div
          className="canvas-box-content"
          style={{
            flex: 1,
            padding: '8px 12px',
            color: '#D4D4D8',
            fontSize: '13px',
            lineHeight: '1.65',
            overflow: 'auto',
          }}
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      )}

      <style>{`
        [contenteditable]:empty:before { content: attr(data-placeholder); color: #3F3F46; pointer-events: none; }
        [contenteditable] h3 { font-size: 14px; font-weight: 600; color: #F5F5F7; margin: 8px 0 4px; }
        [contenteditable] ul, [contenteditable] ol { margin-left: 20px; margin-bottom: 6px; }
        [contenteditable] li { margin-bottom: 2px; }
        [contenteditable] b, [contenteditable] strong { color: #F5F5F7; }
        [contenteditable] img, .canvas-box-content img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          display: block;
          margin: 4px 0;
        }
      `}</style>

      {selected && !editing && (
        <>
          {renderHandle('nw', 'nwse-resize', { top: -6, left: -6 })}
          {renderHandle('ne', 'nesw-resize', { top: -6, right: -6 })}
          {renderHandle('sw', 'nesw-resize', { bottom: -6, left: -6 })}
          {renderHandle('se', 'nwse-resize', { bottom: -6, right: -6 })}
          <div
            onPointerDown={e => {
              e.stopPropagation()
              onConnectorDown?.(e.clientX, e.clientY)
            }}
            title="Drag to connect to another box"
            style={{
              position: 'absolute',
              right: -7,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#7A5CFF',
              border: '1px solid #0D0D0F',
              cursor: 'crosshair',
              zIndex: 3,
            }}
          />
        </>
      )}
    </div>
  )
}

function sanitizeHtml(html) {
  if (!html) return EMPTY_HTML
  const template = document.createElement('template')
  template.innerHTML = html
  cleanNode(template.content)
  return template.innerHTML || EMPTY_HTML
}

function isSafeImageSrc(value) {
  const src = String(value ?? '').trim().toLowerCase()
  return (
    src.startsWith('data:image/')
    || src.startsWith('http://')
    || src.startsWith('https://')
    || src.startsWith('file://')
    || src.startsWith('blob:')
  )
}

function cleanNode(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) continue
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove()
      continue
    }

    if (!ALLOWED_TAGS.has(child.tagName)) {
      const fragment = document.createDocumentFragment()
      while (child.firstChild) fragment.appendChild(child.firstChild)
      child.replaceWith(fragment)
      cleanNode(node)
      continue
    }

    if (child.tagName === 'IMG') {
      const src = child.getAttribute('src')
      const alt = child.getAttribute('alt')
      if (!isSafeImageSrc(src)) {
        child.remove()
        continue
      }
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name)
      child.setAttribute('src', src)
      if (alt) child.setAttribute('alt', alt.slice(0, 180))
      continue
    }

    for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name)
    cleanNode(child)
  }
}
