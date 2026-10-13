import { useEffect, useRef, useState } from 'react'

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

/** Accepts a file dropped anywhere on the window; returns whether a drag is over it. */
export function useFileDrop(onFile: (file: File) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false)
  const onFileRef = useRef(onFile)
  onFileRef.current = onFile

  useEffect(() => {
    if (!enabled) return
    let depth = 0 // dragenter/dragleave fire for every child element crossed

    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth += 1
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) onFileRef.current(file)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      setDragging(false)
    }
  }, [enabled])

  return dragging
}
