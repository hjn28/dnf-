/**
 * 列平衡计算器 ColumnBalancer
 *
 * 核心规则：
 *   列中的数据只能在当前列中上下移动（不跨列）
 *
 * 处理步骤：
 *   1. 筛选 c 值，从大到小排列，取前 24 个
 *   2. 筛选奶值，从大到小选取 24 个，从小到大排列
 *   3. 配对：c[i] ↔ 奶[i]（跳过同名同列），每行 1c + 1奶
 *   4. 其他值（剩余 c、奶、混子/群猎）暂存不展示
 *
 * 使用方式:
 *   import { ColumnBalancer } from '@/utils'
 *   const balancer = new ColumnBalancer(角色数据, 倍率数据)
 *   const { rows, remaining } = balancer.build()
 */

export class ColumnBalancer {
  /**
   * @param {Object} roleData - 角色数据 { 角色: { 三年: {c: number[], 奶: string[], 其它: string[]}, ... } }
   * @param {Object} rateData - 倍率数据 { 奶的倍率: [{2.5: 1150}, ...] }
   */
  constructor(roleData, rateData) {
    this.roles = roleData?.角色 || roleData
    if (!this.roles || typeof this.roles !== 'object') {
      throw new Error('[ColumnBalancer] 缺少有效的角色数据')
    }
    const rateList = rateData?.奶的倍率 || rateData
    if (!Array.isArray(rateList)) {
      throw new Error('[ColumnBalancer] 缺少有效的倍率数据')
    }
    this.rateMap = this._buildRateMap(rateList)
    this.names = Object.keys(this.roles)
  }

  // ==================== 内部工具 ====================

  /** 构建倍率 Map: "2.5" → 1150 */
  _buildRateMap(list) {
    const map = new Map()
    for (const entry of list) {
      const [k, v] = Object.entries(entry)[0]
      map.set(parseFloat(k), v)
    }
    return map
  }

  /** 数值化（去除 m 后缀后转浮点） */
  _num(v) {
    return parseFloat(String(v).replace('m', ''))
  }

  /** 查倍率 */
  _rate(v) {
    return this.rateMap.get(this._num(v)) || 0
  }

  // ==================== 规则校验 ====================

  /**
   * 验证行数据是否遵守"列中数据不跨列"规则
   * @param {Object[]} rows
   * @param {string[][]} pairs - [c的名, 奶的名] 每行的配对来源
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateRule(rows, pairs) {
    const errors = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const pair = pairs[i]
      for (const n of this.names) {
        // c 列：值必须来自该角色自己的 c 池
        if (row[`${n}_color`] === 'c') {
          const cPool = this.roles[n].c
          if (typeof row[`${n}_val`] === 'number' && !cPool.includes(Number(row[`${n}_val`]))) {
            errors.push(`行${i + 1} ${n}的c值 ${row[`${n}_val`]} 不属于${n}的c池`)
          }
        }
        // 奶列：值必须来自该角色自己的奶池
        if (row[`${n}_color`] === 'nai') {
          const naiPool = this.roles[n].奶.map(v => String(v))
          if (typeof row[`${n}_val`] === 'string' && !naiPool.includes(String(row[`${n}_val`]))) {
            errors.push(`行${i + 1} ${n}的奶值 ${row[`${n}_val`]} 不属于${n}的奶池`)
          }
        }
      }
    }
    return { valid: errors.length === 0, errors }
  }

  // ==================== 步骤 1: 筛选 c ====================

  /**
   * 提取所有 c 值，从大到小排列
   * 每个 c 携带所属角色名和类型标记（群猎/混子）
   * @returns {{ name: string, val: number, type: string }[]}
   */
  step1_sortC() {
    const items = []
    for (const n of this.names) {
      for (let i = 0; i < this.roles[n].c.length; i++) {
        items.push({
          name: n,
          val: this.roles[n].c[i],
          type: (this.roles[n]?.其它?.[i]) || '',
        })
      }
    }
    return items.sort((a, b) => b.val - a.val)
  }

  // ==================== 步骤 2: 筛选奶 ====================

  /**
   * 筛选奶值：从大到小选 24 个，再从小到大排列
   * 实现"大c配小奶"：最优质的奶配给最大的 c
   * @returns {{ name: string, val: string }[]}
   */
  step2_sortNai() {
    const items = []
    for (const n of this.names) {
      for (const v of this.roles[n].奶) {
        items.push({ name: n, val: String(v) })
      }
    }
    // 从大到小选（取最优质的 24 个奶）
    const desc = [...items].sort((a, b) => this._num(b.val) - this._num(a.val))
    const top24 = desc.slice(0, 24)
    // 从小到大排（最大 c 配最小奶）
    return top24.sort((a, b) => this._num(a.val) - this._num(b.val))
  }

  // ==================== 步骤 3: 配对 ====================

  /**
   * 配对：c降序[i] ↔ 奶升序[i]
   * 规则：跳过同名（同一列不能同时有 c 和奶）
   * @param {{ name:string, val:number, type:string }[]} cList
   * @param {{ name:string, val:string }[]} naiList
   * @returns {{ c, nai, baseDmg }[]}
   */
  _pair(cList, naiList) {
    const pairs = []
    const used = new Set()

    for (let i = 0; i < cList.length; i++) {
      let idx = i
      // 跳过同名列或已使用的奶
      while (idx < naiList.length && (used.has(idx) || cList[i].name === naiList[idx].name)) {
        idx++
      }
      // 超出范围则从头开始找
      if (idx >= naiList.length) {
        idx = 0
        while (used.has(idx) || cList[i].name === naiList[idx].name) {
          idx++
        }
      }
      used.add(idx)
      pairs.push({
        c: cList[i],
        nai: naiList[idx],
        baseDmg: this._calcBaseDmg(cList[i], naiList[idx]),
      })
    }
    return pairs
  }

  /** 计算单对基伤（群猎×1.12） */
  _calcBaseDmg(c, nai) {
    const ce = c.type === '群猎' ? Math.round(c.val * 1.12) : c.val
    return Math.round(ce * this._rate(nai.val) / 1000)
  }

  // ==================== 步骤 4: 收集剩余值 ====================

  /**
   * 收集不展示的值：剩余 c、剩余奶、所有混子/群猎
   * @param {number} cUsed - 已使用的 c 数量（通常是 24）
   * @param {number} naiUsed - 已使用的奶数量（通常是 24）
   * @returns {{ c: Object[], nai: Object[], hun: Object }}
   */
  gatherOthers(cUsed = 24, naiUsed = 24) {
    const allC = this.step1_sortC()
    const allNaiDesc = this._allNaiDesc()

    // 按角色整理剩余值
    const remainC = allC.slice(cUsed)
    const remainNai = allNaiDesc.slice(naiUsed)

    // 混子/群猎
    const hun = {}
    for (const n of this.names) {
      hun[n] = (this.roles[n]?.其它 || []).map(v => {
        if (v === '+' || v === '群猎') return '群猎'
        if (v === 'x' || v === '混子') return '混子'
        return v
      })
    }

    return { c: remainC, nai: remainNai, hun }
  }

  /** 全部奶值降序 */
  _allNaiDesc() {
    const items = []
    for (const n of this.names) {
      for (const v of this.roles[n].奶) {
        items.push({ name: n, val: String(v) })
      }
    }
    return items.sort((a, b) => this._num(b.val) - this._num(a.val))
  }

  // ==================== 构建 ====================

  /**
   * 构建完整 24 行对照数据
   *
   * @returns {{
   *   rows: Object[],
   *   meta: { total: number, order: string },
   *   remaining: { c: Object[], nai: Object[], hun: Object }
   * }}
   */
  build() {
    // 1. 筛选 c，从大到小，取前 24
    const mainC = this.step1_sortC().slice(0, 24)

    // 2. 筛选奶，从大到小选 24 个，再从小到大排
    const naiAsc = this.step2_sortNai()

    // 3. 配对
    const pairs = this._pair(mainC, naiAsc)

    // 记录配对来源（用于校验）
    const pairSources = pairs.map(p => [p.c.name, p.nai.name])

    // 4. 构建行
    const rows = pairs.map((p, idx) => {
      const row = {
        _index: idx,
        segment: 'mixed',
        cSum: 0,
        rate: 0,
        total: 0,
      }

      // 初始化：所有格为空
      for (const n of this.names) {
        row[`${n}_val`] = ''
        row[`${n}_color`] = ''
        row[`${n}_type`] = ''
      }

      // 填入 c（确认：值放在该角色的列中，不跨列）
      row[`${p.c.name}_val`] = p.c.val
      row[`${p.c.name}_color`] = 'c'
      row[`${p.c.name}_type`] = p.c.type || ''

      // 填入奶（确认：值放在该角色的列中，不跨列）
      row[`${p.nai.name}_val`] = p.nai.val
      row[`${p.nai.name}_color`] = 'nai'

      // 伤害计算
      const ce = p.c.type === '群猎' ? Math.round(p.c.val * 1.12) : p.c.val
      const rate = this._rate(p.nai.val)
      row.cSum = ce
      row.rate = rate
      row.total = Math.round(ce * rate / 1000)

      return row
    })

    // 校验规则
    const validation = this.validateRule(rows, pairSources)
    if (!validation.valid) {
      console.warn('[ColumnBalancer] 规则校验警告:', validation.errors)
    }

    // 剩余值暂存
    const remaining = this.gatherOthers(24, 24)

    return {
      rows,
      meta: {
        total: 24,
        order: '大c配小奶 | c降序(步骤1) → 奶从大到小选→升序排(步骤2) | 不跨列(规则)',
      },
      remaining,
    }
  }
}

// ==================== 独立运行入口 ====================

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('utils/index.js')) {
  import('fs').then(fs => {
    import('path').then(path => {
      const __dirname = path.default.dirname(new URL(import.meta.url).pathname)
      const DATA_DIR = path.default.resolve(__dirname, '..', 'dataJson')
      const roleData = JSON.parse(fs.default.readFileSync(path.default.join(DATA_DIR, '角色.json'), 'utf-8'))
      const rateData = JSON.parse(fs.default.readFileSync(path.default.join(DATA_DIR, '奶的倍率.json'), 'utf-8'))
      const balancer = new ColumnBalancer(roleData, rateData)
      const result = balancer.build()
      console.log(`[ColumnBalancer] ✅ 生成 ${result.rows.length} 行`)
      console.log(`  → ${result.meta.order}`)
      console.log(`  → 剩余 c: ${result.remaining.c.length} 个, 剩余奶: ${result.remaining.nai.length} 个`)
      result.rows.slice(0, 5).forEach((r, i) => {
        const info = balancer.names.map(n => {
          const v = r[`${n}_val`]
          const c = r[`${n}_color`]
          return v ? `${n}:${c}=${v}` : `${n}:空`
        })
        console.log(`  [${i + 1}] ${info.join(' | ')} | damage=${r.total}`)
      })
    })
  })
}
