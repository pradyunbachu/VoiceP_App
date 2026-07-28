import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const STORAGE_KEY = 'voxal_selected_pantry'

type Ctx = { selectedGroupId: number | null; setSelectedGroupId: (id: number | null) => void }

const PantryContext = createContext<Ctx | null>(null)

function readInitial(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null || raw === 'null') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function PantryProvider({ children }: { children: ReactNode }) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(readInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, selectedGroupId === null ? 'null' : String(selectedGroupId))
    } catch {
      /* ignore persistence failures (e.g. storage disabled) */
    }
  }, [selectedGroupId])

  return (
    <PantryContext.Provider value={{ selectedGroupId, setSelectedGroupId }}>
      {children}
    </PantryContext.Provider>
  )
}

export function usePantrySelection(): Ctx {
  const ctx = useContext(PantryContext)
  if (!ctx) throw new Error('usePantrySelection must be used within PantryProvider')
  return ctx
}
