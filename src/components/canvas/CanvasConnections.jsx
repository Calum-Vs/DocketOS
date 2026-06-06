function endpoints(fromBox, toBox) {
  const fx = fromBox.x + fromBox.width
  const fy = fromBox.y + fromBox.height / 2
  const tx = toBox.x
  const ty = toBox.y + toBox.height / 2
  return { fx, fy, tx, ty }
}

function bezierPath(fromBox, toBox) {
  const { fx, fy, tx, ty } = endpoints(fromBox, toBox)
  const cx = (tx - fx) / 2
  return `M ${fx} ${fy} C ${fx + cx} ${fy}, ${tx - cx} ${ty}, ${tx} ${ty}`
}

function midpoint(fromBox, toBox) {
  const { fx, fy, tx, ty } = endpoints(fromBox, toBox)
  return { mx: (fx + tx) / 2, my: (fy + ty) / 2 }
}

export default function CanvasConnections({ boxes, connections, selectionId, onSelect, onDelete, dragConnection }) {
  const boxMap = new Map(boxes.map(b => [b.id, b]))

  return (
    <svg
      style={{
        position: 'absolute',
        left: -50000,
        top: -50000,
        width: 100000,
        height: 100000,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <g transform="translate(50000, 50000)">
        {connections.map(c => {
          const from = boxMap.get(c.from)
          const to = boxMap.get(c.to)
          if (!from || !to) return null
          const d = bezierPath(from, to)
          const { mx, my } = midpoint(from, to)
          const isSelected = selectionId === c.id
          return (
            <g key={c.id}>
              <path
                d={d}
                stroke="transparent"
                strokeWidth={12}
                fill="none"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onPointerDown={e => { e.stopPropagation(); onSelect?.(c.id) }}
              />
              <path
                d={d}
                stroke={isSelected ? '#7A5CFF' : '#3F3F46'}
                strokeWidth={isSelected ? 2 : 1.5}
                fill="none"
                style={{ pointerEvents: 'none' }}
              />
              {isSelected && onDelete && (
                <g
                  transform={`translate(${mx}, ${my})`}
                  onPointerDown={e => { e.stopPropagation(); onDelete(c.id) }}
                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                >
                  <circle r={9} fill="#0D0D0F" stroke="#FF453A" strokeWidth={1} />
                  <text
                    x={0}
                    y={1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="#FF453A"
                    style={{ userSelect: 'none' }}
                  >
                    ✕
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {dragConnection && (
          <path
            d={`M ${dragConnection.fromX} ${dragConnection.fromY} L ${dragConnection.toX} ${dragConnection.toY}`}
            stroke="#7A5CFF"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill="none"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </g>
    </svg>
  )
}
