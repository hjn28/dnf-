/**
 * 列平衡计算器 ColumnBalancer 类型声明
 */

interface RoleData {
  角色: Record<string, {
    c: number[]
    奶: string[]
    其它: string[]
  }>
}

interface RateData {
  奶的倍率: Record<string, number | undefined>[]
}

interface CItem {
  name: string
  val: number
  type: string
}

interface NaiItem {
  name: string
  val: string
}

interface RowData {
  [key: string]: number | string
  _index: number
  segment: string
  cSum: number
  rate: number
  total: number
}

interface BuildResult {
  rows: RowData[]
  meta: {
    total: number
    order: string
  }
  remaining: {
    c: CItem[]
    nai: NaiItem[]
    hun: Record<string, string[]>
  }
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

export declare class ColumnBalancer {
  constructor(roleData: RoleData, rateData: RateData)
  build(): BuildResult
  validateRule(rows: RowData[], pairs: string[][]): ValidationResult
  step1_sortC(): CItem[]
  step2_sortNai(): NaiItem[]
  gatherOthers(cUsed?: number, naiUsed?: number): {
    c: CItem[]
    nai: NaiItem[]
    hun: Record<string, string[]>
  }
}
