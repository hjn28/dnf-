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
    // 冲突延迟队列：当前行 c 与 奶 同列时，c 优先，奶推迟到下一行
    const deferred = []

    for (let i = 0; i < cList.length; i++) {
      const c = cList[i]
      let nai = null

      // 1. 优先从延迟队列中取不冲突的奶
      for (let d = 0; d < deferred.length; d++) {
        if (deferred[d].name !== c.name) {
          nai = deferred.splice(d, 1)[0]
          break
        }
      }

      // 2. 还没找到，从 naiList 中顺序配对
      if (!nai) {
        let idx = i
        // 跳过已使用的奶
        while (idx < naiList.length && used.has(idx)) {
          idx++
        }

        if (idx < naiList.length) {
          if (c.name !== naiList[idx].name) {
            // 不冲突，直接配对
            nai = naiList[idx]
            used.add(idx)
          } else {
            // 冲突：c 优先，奶延迟到下一行
            deferred.push(naiList[idx])
            used.add(idx)
            // 为当前 c 继续找下一个可用的奶
            idx++
            while (idx < naiList.length && (used.has(idx) || c.name === naiList[idx].name)) {
              idx++
            }
            if (idx < naiList.length) {
              nai = naiList[idx]
              used.add(idx)
            }
          }
        }

        // 3. 当前范围没找到，从头搜索
        if (!nai) {
          let idx = 0
          while (idx < naiList.length && (used.has(idx) || c.name === naiList[idx].name)) {
            idx++
          }
          if (idx < naiList.length) {
            nai = naiList[idx]
            used.add(idx)
          }
        }
      }

      pairs.push({
        c,
        nai: nai || { name: '', val: '' },
        baseDmg: nai ? this._calcBaseDmg(c, nai) : 0,
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
    console.log('[ColumnBalancer] 剩余值统计:', { remainC, remainNai, hun })
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

  // ==================== 行伤害计算 ====================

  /**
   * 计算行总伤害
   *
   * 规则：
   *   - c（主列 color='c'）：若行内有群猎则 ×1.12
   *   - c（填充列 color='fill'）：不加成，直接累加
   *   - 奶（主列 color='nai'）：取倍率
   *   - 主奶带 m 后缀（如 "4.31m"）：总伤害 ×1.24（太阳奶效果）
   *   - 填充太阳奶（数值字符串）：总伤害 ×1.24，仅一次且 maxC<4000
   */
  _calcRow(row) {
    const hasQunlie = Object.values(row).some(v => v === '群猎')
    let cSum = 0, mainRate = 0, maxC = 0
    let sunMultiplier = 1.0

    for (const n of this.names) {
      const v = row[`${n}_val`], c = row[`${n}_color`]
      if (typeof v === 'number') {
        const add = c === 'c' && hasQunlie ? Math.round(v * 1.12) : v
        cSum += add
        if (c === 'c') maxC = add
      }
      if (c === 'nai') {
        mainRate = this._rate(v)
        // 主奶带m后缀 → 太阳奶，总伤害×1.24
        if (String(v).endsWith('m')) {
          sunMultiplier *= 1.24
        }
      }
    }

    // 填充太阳奶（数值字符串）→ 总伤害×1.24，仅一次且maxC<4000
    for (const n of this.names) {
      const v = row[`${n}_val`], c = row[`${n}_color`]
      if (c === 'fill' && typeof v === 'string' && /^[\d.]+m?$/.test(v) && maxC < 4000) {
        sunMultiplier *= 1.24
        break
      }
    }

    const baseTotal = Math.round(cSum * mainRate / 1000)
    const total = Math.round(baseTotal * sunMultiplier)

    return {
      cSum,
      totalRate: mainRate,
      total,
      sunMultiplier,
    }
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

      // 伤害计算（使用_calcRow统一逻辑，含主奶m后缀×1.24）
      Object.assign(row, this._calcRow(row))

      return row
    })

    // 校验规则
    const validation = this.validateRule(rows, pairSources)
    if (!validation.valid) {
      console.warn('[ColumnBalancer] 规则校验警告:', validation.errors)
    }

    // 剩余值暂存
    const remaining = this.gatherOthers(24, 24)

    // ==================== 填充逻辑 ====================
    // 规则：高伤(≥5000)→混子 | 低伤(<5000)→大c/群猎/太阳奶提升至阈值
    const THRESHOLD = 5000

    // 构建按角色分配的资源池
    const allC = this.step1_sortC()
    const allNaiDesc = this._allNaiDesc()
    const remainC = allC.slice(24)
    const remainNai = allNaiDesc.slice(24)

    const pools = {}
    for (const n of this.names) {
      pools[n] = {
        c:      remainC.filter(item => item.name === n).sort((a, b) => a.val - b.val), // 从小到大
        nai:    remainNai.filter(item => item.name === n),                              // 太阳奶
        qunlie: (this.roles[n]?.其它 || []).filter(v => v === '群猎' || v === '+'),
        hun:    (this.roles[n]?.其它 || []).filter(v => v === '混子' || v === 'x'),
      }
    }

    // 按原始顺序处理（c从大到小 → "从前往后"）
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      const baseDmg = row.total

      // 找出该行的空位
      const emptySlots = this.names.filter(n => !row[`${n}_val`] || row[`${n}_val`] === '')

      if (baseDmg >= THRESHOLD) {
        // ═══ 高伤（≥5000）→ 填混子 → 太阳奶 → 小c（节约大c给低伤行）═══
        for (const slot of emptySlots) {
          const pool = pools[slot]
          if (!pool) continue
          if (pool.hun.length > 0) {
            row[`${slot}_val`] = pool.hun.shift()
            row[`${slot}_color`] = 'fill'
            row[`${slot}_type`] = ''
          } else if (pool.nai.length > 0) {
            // 太阳奶优先于大c（太阳奶是百分比加成，不消耗c资源）
            row[`${slot}_val`] = pool.nai.shift().val
            row[`${slot}_color`] = 'fill'
            row[`${slot}_type`] = '太阳奶'
          } else if (pool.c.length > 0) {
            // 混子/太阳奶都不够 → 取最小c
            const c = pool.c.shift()
            row[`${slot}_val`] = c.val
            row[`${slot}_color`] = 'fill'
            row[`${slot}_type`] = c.type || ''
          }
        }
      } else {
        // ═══ 低伤（<5000）→ 使用群猎/c/太阳奶提升至阈值 ═══
        let reached = false

        // 步骤 A：单填充（群猎 → c → 太阳奶）
        for (const slot of emptySlots) {
          if (reached) break
          const pool = pools[slot]
          if (!pool) continue

          // A1: 群猎
          if (pool.qunlie.length > 0) {
            row[`${slot}_val`] = pool.qunlie[0]
            row[`${slot}_color`] = 'fill'
            row[`${slot}_type`] = '群猎'
            if (this._calcRow(row).total >= THRESHOLD) {
              pool.qunlie.shift(); reached = true; break
            }
            row[`${slot}_val`] = ''; row[`${slot}_color`] = ''; row[`${slot}_type`] = ''
          }

          // A2: c（从最小到最大找第一个≥5000的c，直接消耗）
          if (!reached && pool.c.length > 0) {
            const largest = pool.c[pool.c.length - 1]
            row[`${slot}_val`] = largest.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = largest.type || ''
            const maxDmg = this._calcRow(row).total
            row[`${slot}_val`] = ''; row[`${slot}_color`] = ''; row[`${slot}_type`] = ''

            if (maxDmg >= THRESHOLD) {
              let useIdx = -1
              for (let ci = 0; ci < pool.c.length; ci++) {
                const cItem = pool.c[ci]
                row[`${slot}_val`] = cItem.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = cItem.type || ''
                if (this._calcRow(row).total >= THRESHOLD) { useIdx = ci; break }
                row[`${slot}_val`] = ''; row[`${slot}_color`] = ''; row[`${slot}_type`] = ''
              }
              if (useIdx >= 0) {
                const chosen = pool.c.splice(useIdx, 1)[0]
                row[`${slot}_val`] = chosen.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = chosen.type || ''
                reached = true; break
              }
            }
          }

          // A3: 太阳奶
          if (!reached && pool.nai.length > 0) {
            row[`${slot}_val`] = pool.nai[0].val
            row[`${slot}_color`] = 'fill'
            row[`${slot}_type`] = ''
            if (this._calcRow(row).total >= THRESHOLD) {
              pool.nai.shift(); reached = true; break
            }
            row[`${slot}_val`] = ''; row[`${slot}_color`] = ''
          }
        }

        if (reached) {
          // 单填充达标 → 剩余空位填混子 → 太阳奶 → 最小c
          for (const slot of emptySlots) {
            if (row[`${slot}_val`] && row[`${slot}_val`] !== '') continue
            const pool = pools[slot]
            if (!pool) continue
            if (pool.hun.length > 0) {
              row[`${slot}_val`] = pool.hun.shift()
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = ''
            } else if (pool.nai.length > 0) {
              row[`${slot}_val`] = pool.nai.shift().val
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = '太阳奶'
            } else if (pool.c.length > 0) {
              const c = pool.c.shift()
              row[`${slot}_val`] = c.val
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = c.type || ''
            }
          }
          continue
        }

        // 步骤 B：单填充不达标 → 双填充（c从最小试，找第一个达5000的c）
        const _findMinC = (pool, row, slot, comboFn) => {
          for (let ci = 0; ci < pool.c.length; ci++) {
            const cItem = pool.c[ci]
            row[`${slot}_val`] = cItem.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = cItem.type || ''
            if (comboFn ? comboFn() : (this._calcRow(row).total >= 5000)) {
              return ci
            }
            row[`${slot}_val`] = ''; row[`${slot}_color`] = ''; row[`${slot}_type`] = ''
          }
          return -1
        }

        for (let i = 0; i < emptySlots.length && !reached; i++) {
          for (let j = i + 1; j < emptySlots.length && !reached; j++) {
            const sA = emptySlots[i], sB = emptySlots[j]
            const pA = pools[sA], pB = pools[sB]
            if (!pA || !pB) continue

            // B1: 群猎 + c（找最小达标c）
            if (pA.qunlie.length > 0 && pB.c.length > 0) {
              row[`${sA}_val`] = pA.qunlie[0]; row[`${sA}_color`] = 'fill'; row[`${sA}_type`] = '群猎'
              const ci = _findMinC(pB, row, sB)
              if (ci >= 0) {
                pA.qunlie.shift(); pB.c.splice(ci, 1)[0]; reached = true; break
              }
              row[`${sA}_val`] = ''; row[`${sA}_color`] = ''; row[`${sA}_type`] = ''
            }

            // B2: c + 群猎
            if (!reached && pA.c.length > 0 && pB.qunlie.length > 0) {
              row[`${sB}_val`] = pB.qunlie[0]; row[`${sB}_color`] = 'fill'; row[`${sB}_type`] = '群猎'
              const ci = _findMinC(pA, row, sA)
              if (ci >= 0) {
                pA.c.splice(ci, 1); pB.qunlie.shift(); reached = true; break
              }
              row[`${sB}_val`] = ''; row[`${sB}_color`] = ''; row[`${sB}_type`] = ''
            }

            // B3: 太阳奶 + c
            if (!reached && pA.nai.length > 0 && pB.c.length > 0) {
              row[`${sA}_val`] = pA.nai[0].val; row[`${sA}_color`] = 'fill'; row[`${sA}_type`] = ''
              const ci = _findMinC(pB, row, sB)
              if (ci >= 0) {
                pA.nai.shift(); pB.c.splice(ci, 1); reached = true; break
              }
              row[`${sA}_val`] = ''; row[`${sA}_color`] = ''
            }

            // B4: c + 太阳奶
            if (!reached && pA.c.length > 0 && pB.nai.length > 0) {
              row[`${sB}_val`] = pB.nai[0].val; row[`${sB}_color`] = 'fill'; row[`${sB}_type`] = ''
              const ci = _findMinC(pA, row, sA)
              if (ci >= 0) {
                pA.c.splice(ci, 1); pB.nai.shift(); reached = true; break
              }
              row[`${sB}_val`] = ''; row[`${sB}_color`] = ''
            }

            // B5: c + c（cA从最小，cB从最小，双向优化找第一个≥4800的组合）
            if (!reached && pA.c.length > 0 && pB.c.length > 0) {
              let bestAI = -1, bestBI = -1
              for (let ai = 0; ai < pA.c.length && bestAI < 0; ai++) {
                const cA = pA.c[ai]
                row[`${sA}_val`] = cA.val; row[`${sA}_color`] = 'fill'; row[`${sA}_type`] = cA.type || ''
                for (let bi = 0; bi < pB.c.length && bestAI < 0; bi++) {
                  const cB = pB.c[bi]
                  row[`${sB}_val`] = cB.val; row[`${sB}_color`] = 'fill'; row[`${sB}_type`] = cB.type || ''
                  if (this._calcRow(row).total >= 4800) { bestAI = ai; bestBI = bi }
                  row[`${sB}_val`] = ''; row[`${sB}_color`] = ''; row[`${sB}_type`] = ''
                }
                row[`${sA}_val`] = ''; row[`${sA}_color`] = ''; row[`${sA}_type`] = ''
              }
              if (bestAI >= 0) {
                const chosenA = pA.c.splice(bestAI, 1)[0]
                const chosenB = pB.c.splice(bestBI, 1)[0]
                row[`${sA}_val`] = chosenA.val; row[`${sA}_color`] = 'fill'; row[`${sA}_type`] = chosenA.type || ''
                row[`${sB}_val`] = chosenB.val; row[`${sB}_color`] = 'fill'; row[`${sB}_type`] = chosenB.type || ''
                reached = true; break
              }
            }
          }
          if (reached) break
        }

        if (reached) {
          // 双填充达标 → 剩余空位填混子 → 太阳奶 → 最小c
          for (const slot of emptySlots) {
            if (row[`${slot}_val`] && row[`${slot}_val`] !== '') continue
            const pool = pools[slot]
            if (!pool) continue
            if (pool.hun.length > 0) {
              row[`${slot}_val`] = pool.hun.shift()
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = ''
            } else if (pool.nai.length > 0) {
              row[`${slot}_val`] = pool.nai.shift().val
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = '太阳奶'
            } else if (pool.c.length > 0) {
              const c = pool.c.shift()
              row[`${slot}_val`] = c.val
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = c.type || ''
            }
          }
        } else {
          // 所有尝试失败 → 耗尽资源填满
          for (const slot of emptySlots) {
            if (row[`${slot}_val`] && row[`${slot}_val`] !== '') continue
            const pool = pools[slot]
            if (!pool) continue
            if (pool.qunlie.length > 0) {
              row[`${slot}_val`] = pool.qunlie.shift()
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = '群猎'
            } else if (pool.nai.length > 0) {
              row[`${slot}_val`] = pool.nai.shift().val
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = ''
            } else if (pool.c.length > 0) {
              const c = pool.c.shift() // 取最小c，节约大c
              row[`${slot}_val`] = c.val
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = c.type || ''
            } else if (pool.hun.length > 0) {
              row[`${slot}_val`] = pool.hun.shift()
              row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = ''
            }
          }
        }
      }
    }

    // 重算最终伤害
    for (const row of rows) {
      const result = this._calcRow(row)
      row.cSum = result.cSum
      row.rate = result.totalRate
      row.total = result.total
      delete row._index
    }

    // 标记伤害最低的3行（用于前端标色）
    const dmgOrder = rows.map((r, i) => ({ idx: i, dmg: r.total })).sort((a, b) => a.dmg - b.dmg)
    for (let i = 0; i < rows.length; i++) rows[i]._lowest3 = false
    for (let k = 0; k < Math.min(3, dmgOrder.length); k++) rows[dmgOrder[k].idx]._lowest3 = true

    return {
      rows,
      meta: {
        total: 24,
        order: '从前往后填充 | 阈值≥5000→混子(优先)/c | <5000→群猎/太阳奶/c(单填)→双填 | 大c配小奶',
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
