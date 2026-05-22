export function* chunks<T>({ arr, size }: { arr: T[]; size: number }): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size)
}
