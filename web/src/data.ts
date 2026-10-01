import type { DataBundle, Facility, Meta, Program } from './types'

export async function loadData(): Promise<DataBundle> {
  const base = `${import.meta.env.BASE_URL}data/`
  const get = async <T,>(name: string): Promise<T> => {
    const res = await fetch(base + name)
    if (!res.ok) throw new Error(`${name} 불러오기 실패 (${res.status})`)
    return res.json() as Promise<T>
  }
  const [programs, facilities, meta] = await Promise.all([
    get<Program[]>('programs.json'),
    get<Facility[]>('facilities.json'),
    get<Meta>('meta.json'),
  ])
  return { programs, facilities, meta }
}
