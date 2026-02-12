import { atomWithStorage } from 'jotai/utils'

export const lastSelectedExampleAtom = atomWithStorage<string | null>('c-parser-last-example', null)
