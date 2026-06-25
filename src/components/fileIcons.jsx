// Shared file/folder symbols used across the app (folder tree, center panels,
// quick links, flagged, recent files, search results). Keep all file-type icon
// logic here so every list renders the same colour-coded symbols.

function IconBase({ children, className = 'h-4 w-4 shrink-0', style }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

// Map a file's extension to a category that drives its icon + colour.
export function getFileCategory(name) {
  const dot = (name || '').lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (['xls', 'xlsx', 'xlsm', 'xlsb', 'csv'].includes(ext)) return 'sheet'
  if (['doc', 'docx', 'docm', 'rtf', 'odt'].includes(ext)) return 'doc'
  if (ext === 'pdf') return 'pdf'
  if (['dwg', 'dxf', 'dgn', 'dwf', '12d', '12da'].includes(ext)) return 'cad'
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'tif', 'tiff', 'webp'].includes(ext)) return 'image'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['txt', 'md', 'log'].includes(ext)) return 'text'
  return 'file'
}

const PAGE_OUTLINE = 'M4 2.5h5l3 3v8a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5z'
const PAGE_FOLD = 'M9 2.5v3h3'

const FILE_CATEGORY_ICONS = {
  doc:     { color: '#64D2FF', paths: [PAGE_OUTLINE, PAGE_FOLD, 'M5.5 8.5h5', 'M5.5 10.5h5', 'M5.5 12.5h3'] },
  text:    { color: '#A1A1AA', paths: [PAGE_OUTLINE, PAGE_FOLD, 'M5.5 9h5', 'M5.5 11h5', 'M5.5 13h3'] },
  sheet:   { color: '#30D158', paths: [PAGE_OUTLINE, PAGE_FOLD, 'M5 8.5h6', 'M5 11h6', 'M7.5 7.5v6', 'M9.5 7.5v6'] },
  pdf:     { color: '#FF453A', paths: [PAGE_OUTLINE, PAGE_FOLD, 'M5.5 9.5h5', 'M5.5 12h3'] },
  cad:     { color: '#FF9F0A', paths: ['M3 13l5-9 5 9z', 'M3 13h10'] },
  image:   { color: '#B8AAFF', paths: ['M2.5 3.5h11v9h-11z', 'M6 7a1 1 0 11-.01 0', 'M3 12l3.5-3.5 2.5 2.5 2.5-3 2 2.5'] },
  archive: { color: '#8E8E93', paths: [PAGE_OUTLINE, PAGE_FOLD, 'M8 3v2', 'M8 6v2', 'M8 9v2'] },
  file:    { color: '#8E8E93', paths: [PAGE_OUTLINE, PAGE_FOLD] },
}

export function FileTypeIcon({ name, category, className }) {
  const cat = category ?? getFileCategory(name || '')
  const meta = FILE_CATEGORY_ICONS[cat] ?? FILE_CATEGORY_ICONS.file
  return (
    <IconBase className={className} style={{ color: meta.color }}>
      {meta.paths.map((d, index) => <path key={index} d={d} />)}
    </IconBase>
  )
}

export function FolderGlyph({ open = false, className, color = '#8E8E93' }) {
  return (
    <IconBase className={className} style={{ color: open ? '#C7BFFF' : color }}>
      <path d="M2.5 5.25V4.5c0-.83.67-1.5 1.5-1.5h2.15c.38 0 .74.14 1.02.4l1.03.95H12c.83 0 1.5.67 1.5 1.5v.4" />
      <path d="M2.5 5.75h11l-.7 5.7c-.1.76-.74 1.3-1.5 1.3H4.7c-.76 0-1.4-.54-1.5-1.3l-.7-5.7z" />
    </IconBase>
  )
}
