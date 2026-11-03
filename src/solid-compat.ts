import { createEffect, onSettled, untrack, type Accessor } from 'solid-js'

type OnOptions = { defer?: boolean }
type Accessors<T extends readonly unknown[]> = { [K in keyof T]: Accessor<T[K]> }

export function on<T, U = void>(
  dependencies: Accessor<T>,
  effect: (input: T, previousInput: T | undefined, previousValue: U | undefined) => U,
  options?: OnOptions
): void
export function on<T extends readonly unknown[], U = void>(
  dependencies: Accessors<T>,
  effect: (input: T, previousInput: T | undefined, previousValue: U | undefined) => U,
  options?: OnOptions
): void
export function on<T, U = void>(
  dependencies: Accessor<T> | Accessor<unknown>[],
  effect: (input: T, previousInput: T | undefined, previousValue: U | undefined) => U,
  options?: OnOptions
) {
  const multiple = Array.isArray(dependencies)
  createEffect(
    () => (multiple
      ? dependencies.map((dependency) => dependency())
      : dependencies()) as T,
    (input, previousInput) => { untrack(() => effect(input, previousInput, undefined)) },
    options?.defer ? { defer: true } : undefined
  )
}

export function onMount(effect: () => void | (() => void)): void {
  onSettled(effect)
}

/**
 * La derniere valeur non nulle d'un accesseur de `Show`. Pendant une transition, Solid garde
 * l'ancien enfant en vie jusqu'a la validation : ses effets relisent l'accesseur, qui rend deja
 * `null`. Lire un champ dessus levait une TypeError et figeait toute la reactivite.
 */
export function held<T>(accessor: Accessor<T | null | undefined | false>): Accessor<T> {
  let last: T
  return () => {
    const value = accessor()
    if (value != null && value !== false) last = value
    return last
  }
}
