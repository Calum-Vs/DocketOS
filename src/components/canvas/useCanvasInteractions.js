import { useEffect, useRef, useState } from 'react'

export function useCanvasInteractions({ viewportRef, pan, setPan, panOnBackground = false }) {
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const dragRef = useRef(null)
  const panRef = useRef(pan)
  const spaceHeldRef = useRef(spaceHeld)

  useEffect(() => { panRef.current = pan }, [pan])
  useEffect(() => { spaceHeldRef.current = spaceHeld }, [spaceHeld])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.code === 'Space' && !isTypingTarget(e.target) && !spaceHeldRef.current) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    function onKeyUp(e) {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    function onWindowPointerMove(e) {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      setPan({
        x: d.startPan.x + (e.clientX - d.startX),
        y: d.startPan.y + (e.clientY - d.startY),
      })
    }

    function onWindowPointerUp(e) {
      const d = dragRef.current
      if (!d) return
      if (e.pointerId !== undefined && d.pointerId !== e.pointerId) return
      dragRef.current = null
      setIsPanning(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', onWindowPointerMove, { passive: false })
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  }, [setPan])

  function onPointerDown(e) {
    const isMiddle = e.button === 1
    const isSpaceDrag = e.button === 0 && spaceHeldRef.current
    const isBackgroundDrag = panOnBackground && e.button === 0 && isBackgroundTarget(e)
    if (!isMiddle && !isSpaceDrag && !isBackgroundDrag) return

    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPan: { ...panRef.current },
    }
    setIsPanning(true)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  function onPointerMove(e) {
    if (dragRef.current) e.preventDefault()
  }

  function onPointerUp(e) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setIsPanning(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  return {
    spaceHeld,
    isPanning,
    panHandlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}

function isBackgroundTarget(event) {
  if (event.target === event.currentTarget) return true
  if (!(event.target instanceof Element)) return false
  return event.target.hasAttribute('data-pan-bg')
}

function isTypingTarget(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
