/**
 * 列平衡计算器 ColumnBalancer
 *
 * 【核心规则】
 *   列中的数据只能在当前列中上下移动（不跨列）
 *   每个角色（列）有自己的 c 池、奶池、标记池
 *
 * 【整体流程 — 5 个阶段】
 *   阶段 1 — 筛选 c：提取所有 c 值，从大到小排列，取前 24 个
 *   阶段 2 — 筛选奶：提取所有奶值，从大到小选 24 个，再从小到大排列
 *   阶段 3 — 配对：c[i] ↔ 奶[i]（跳过同名同列），每行 1c + 1奶
 *   阶段 4 — 填充：用剩余资源（混子/群猎/太阳奶/小c）填充各行空位
 *              高伤行（≥阈值）→ 混子优先，节省资源给低伤行
 *              低伤行（<阈值）→ 单填/双填直至达标
 *   阶段 5 — 后处理：低行与高行交换同角色主c/奶，提升低行同时保证高行不跌
 *
 * 【使用方式】
 *   import { ColumnBalancer } from '@/utils'
 *   const balancer = new ColumnBalancer(角色数据, 倍率数据)
 *   const { rows, remaining } = balancer.build()
 *
 * 【数据格式 — 每行(row)字段约定】
 *   {角色}_val   — 该角色在该行的值（number=c值, string=奶值/混子）
 *   {角色}_color — 该格类型：'c'=主c | 'nai'=主奶 | 'fill'=填充 | ''=空
 *   {角色}_type  — 填充标记：'群猎' | '混子' | '太阳奶' | ''=无
 *   total        — 行总伤害（千亿）
 *   _lowest3     — 是否全表伤害最低的3行（前端标红）
 */

export class ColumnBalancer {
  /**
   * @param {Object} roleData - 角色数据
   *   { 角色: { 角色名: { c: number[], 奶: string[], 其它: string[] } } }
   *   - c:    伤害值数组（如 [5001, 2202, …]）
   *   - 奶:   倍率字符串数组（如 ["4.1", "3.5m", …]，m=奶萝标记）
   *   - 其它: 标记数组（"群猎"/"+" 或 "混子"/"x"，与 c 一一对应）
   * @param {Object} rateData - 倍率数据
   *   { 奶的倍率: [{ "2.5": 1150 }, { "2.7": 1250 }, …] }
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

  // ==================== 阶段 0: 内部工具方法 ====================

  /**
   * 构建倍率查找表
   * 将 [{ "2.5": 1150 }, { "2.7": 1250 }, ...] 转为 Map
   *   key   — 奶数值（parseFloat）
   *   value — 对应倍率（整数，如 1150 表示 1.150 倍）
   * @returns {Map<number, number>}
   */
  _buildRateMap(list) {
    const map = new Map()
    for (const entry of list) {
      const [k, v] = Object.entries(entry)[0]
      map.set(parseFloat(k), v)
    }
    return map
  }

  /**
   * 数值化：将奶字符串转为纯数字
   * 去除 m 后缀（奶萝标记）后转浮点
   *   例：_num("3.5m") → 3.5
   * @param {string|number} v
   * @returns {number}
   */
  _num(v) {
    return parseFloat(String(v).replace('m', ''))
  }

  /**
   * 查倍率：根据奶值字符串查对应倍率
   *   例：_rate("3.5") → 从 rateMap 中取 3.5 对应的倍率
   * @param {string|number} v - 奶值（可带 m 后缀，会自动剥离）
   * @returns {number} 倍率值，查不到返回 0
   */
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

  // ==================== 阶段 2: 筛选并排序奶值 ====================

  /**
   * 筛选奶值：从大到小选 24 个，再从小到大排列
   *
   * "大c配小奶"策略：
   *   最优质的奶（数值最大）配给最大的 c
   *   奶本身从小到大排列，与 stage1 从大到小的 c 形成"最大c↔最小奶"的配对
   *
   * @returns {{ name: string, val: string }[]} 按奶值升序的 24 个奶
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

  // ==================== 阶段 3: c ↔ 奶 配对 ====================

  /**
   * 配对：c降序[i] ↔ 奶升序[i]
   *
   * 【核心规则】
   *   同一列（同一角色）不能同时拥有 c 和奶
   *   当前 c 与 奶 同角色时 → c 优先占用，奶延迟到下一行
   *
   * 【冲突解决 — 3 步递进】
   *   ① 延迟队列：之前因冲突被推迟的奶优先匹配
   *   ② 顺序匹配：从当前位置 i 往后找第一个未使用的奶
   *      - 不冲突 → 直接配对
   *      - 冲突 → 把奶推迟到延迟队列，继续往后找
   *   ③ 全局搜索：前两步都找不到，从头遍历找第一个未使用且不冲突的奶
   *
   * @param {{ name:string, val:number, type:string }[]} cList   - c 降序排列
   * @param {{ name:string, val:string }[]}               naiList - 奶升序排列
   * @returns {{ c: Object, nai: Object, baseDmg: number }[]}
   */
  _pair(cList, naiList) {
    const pairs = []
    const used = new Set()        // 记录 naiList 中已被占用的索引
    const deferred = []           // 冲突延迟队列：当前行 c 与奶同角色时，奶推迟

    for (let i = 0; i < cList.length; i++) {
      const c = cList[i]
      let nai = null

      // ── ① 优先从延迟队列中取不冲突的奶 ──
      for (let d = 0; d < deferred.length; d++) {
        if (deferred[d].name !== c.name) {
          nai = deferred.splice(d, 1)[0]
          break
        }
      }

      // ── ② 延迟队列无匹配 → 从 naiList 顺序取 ──
      if (!nai) {
        let idx = i
        // 跳过已使用的奶
        while (idx < naiList.length && used.has(idx)) idx++

        if (idx < naiList.length) {
          if (c.name !== naiList[idx].name) {
            // 不冲突，直接配对
            nai = naiList[idx]
            used.add(idx)
          } else {
            // 冲突：c 占行，奶推迟给后用
            deferred.push(naiList[idx])
            used.add(idx)
            // 继续往后找下一个可用奶给当前 c
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

        // ── ③ 当前位置没找到 → 从头扫描全局 ──
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
        nai: nai || { name: '', val: '' },   // 极端情况：无奶可用
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
   * 计算单行总伤害
   *
   * 【伤害公式】
   *   baseTotal = (主c伤害 + 填充c伤害) × 主奶倍率 ÷ 1000
   *   total = baseTotal × sunMultiplier
   *
   * 【加成规则（多头累积）】
   *   ① 群猎加成：行内若有"群猎"标记 → 主c ×1.12
   *   ② 奶萝加成：主奶值带 m 后缀（如 "3.5m"） → sunMultiplier ×1.24
   *   ③ 太阳奶加成：填充格中含有数值型字符串且 maxC<4000 → sunMultiplier ×1.24
   *
   * 【注意】
   *   sunMultiplier 可叠加：同时有奶萝和太阳奶 → ×1.24×1.24 = ×1.5376
   *
   * @param {Object} row - 单行数据（含 {角色}_val, {角色}_color 等字段）
   * @returns {{ cSum: number, totalRate: number, total: number, sunMultiplier: number }}
   */
  _calcRow(row) {
    const hasQunlie = Object.values(row).some(v => v === '群猎')
    let cSum = 0, mainRate = 0, maxC = 0
    let sunMultiplier = 1.0    // 太阳奶/奶萝倍率累积器

    // ── 第 1 遍：累加 c 伤害 + 取主奶倍率 ──
    for (const n of this.names) {
      const v = row[`${n}_val`], c = row[`${n}_color`]
      if (typeof v === 'number') {
        // 主c 受群猎加成（×1.12），填充c 不加成
        const add = c === 'c' && hasQunlie ? Math.round(v * 1.12) : v
        cSum += add
        if (c === 'c') maxC = add
      }
      if (c === 'nai') {
        mainRate = this._rate(v)
        // 主奶带 m 后缀（奶萝）→ 总伤害 ×1.24
        if (String(v).endsWith('m')) {
          sunMultiplier *= 1.24
        }
      }
    }

    // ── 第 2 遍：检查填充太阳奶（数值字符串）──
    // 条件：填充格含数字字符串 | maxC<4000（防大c吃两次加成）
    for (const n of this.names) {
      const v = row[`${n}_val`], c = row[`${n}_color`]
      if (c === 'fill' && typeof v === 'string' && /^[\d.]+m?$/.test(v) && maxC < 4000) {
        sunMultiplier *= 1.24
        break  // 一行最多一次填充太阳奶
      }
    }

    const baseTotal = Math.round(cSum * mainRate / 1000)
    const total = Math.round(baseTotal * sunMultiplier)

    return { cSum, totalRate: mainRate, total, sunMultiplier }
  }

  // ==================== 阶段 5: 完整构建 24 行 ====================

  /**
   * 构建完整 24 行对照数据（主入口）
   *
   * 【执行流程】
   *   A. 基础配对 — stages 1~3：取 top24 c + top24 奶，配对成行
   *   B. 填充逻辑 — stage 4：
   *      高伤行 (≥threshold) → 填混子/太阳奶/小c（节省优质资源）
   *      低伤行 (<threshold) → 单填 / 双填 直至达标
   *   C. 后处理 — stage 5：极值行之间交换同角色主c/奶，提升达标率
   *
   * @param {number} [threshold=5400] - 达标阈值
   * @returns {{
   *   rows: Object[],
   *   meta: { total: number, order: string },
   *   remaining: { c: Object[], nai: Object[], hun: Object }
   * }}
   */
  build(threshold = 5400) {

    // ═══════════════════════════════════════════════
    // A. 基础配对
    // ═══════════════════════════════════════════════

    // ① 筛选 c：全部 c 从大到小，取前 24
    const mainC = this.step1_sortC().slice(0, 24)

    // ② 筛选奶：全部奶从大到小选 24 个，再从小到大排
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
    // 规则：高伤(≥threshold)→混子 | 低伤(<threshold)→大c/群猎/太阳奶提升至阈值

    // ═══════════════════════════════════════════════
    // B. 填充逻辑
    // ═══════════════════════════════════════════════
    //
    // 高层策略：
    //   高伤行（≥threshold）→ 填混子/太阳奶/小c（省优质资源给低伤行）
    //   低伤行（<threshold）→ 用群猎/c/太阳奶 单填或双填直至达标
    //
    // 资源池分配（按角色）：
    //   pools[角色] = { c, nai(太阳奶), qunlie(群猎), hun(混子) }

    // 构建按角色分配的资源池
    const allC = this.step1_sortC()
    const allNaiDesc = this._allNaiDesc()
    const remainC = allC.slice(24)
    const remainNai = allNaiDesc.slice(24)

    const pools = {}
    for (const n of this.names) {
      pools[n] = {
        c:      remainC.filter(item => item.name === n).sort((a, b) => a.val - b.val), // 从小到大
        nai:    remainNai.filter(item => item.name === n),                              // 太阳奶池
        qunlie: (this.roles[n]?.其它 || []).filter(v => v === '群猎' || v === '+'),    // 群猎标记
        hun:    (this.roles[n]?.其它 || []).filter(v => v === '混子' || v === 'x'),    // 混子标记
      }
    }

    // 按原始顺序逐行处理（c从大到小 → "从前往后"）
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]
      const baseDmg = row.total

      // 找出该行中尚未填值的空位
      const emptySlots = this.names.filter(n => !row[`${n}_val`] || row[`${n}_val`] === '')

      if (baseDmg >= threshold) {
        // ════════════════════════════════════════
        // 高伤行（≥threshold）：填混子 → 太阳奶 → 小c
        // 目标：用最廉价的资源占满空位，把优质c留给低伤行
        // ════════════════════════════════════════
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
        // ════════════════════════════════════════
        // 低伤行（<threshold）：尝试提升至 ≥ threshold
        //
        // 策略分两阶段：
        //   步骤 A — 单填充：依次试 群猎 → c → 太阳奶
        //           任一填充后总伤达标即停，剩余空位填廉价资源
        //   步骤 B — 双填充：以上都不达标时，同时填两个空位
        //           组合：群猎+c / c+群猎 / 太阳奶+c / c+太阳奶 / c+c
        // ════════════════════════════════════════
        let reached = false

        // ── 步骤 A：单填充（群猎 → c → 太阳奶）──
        for (const slot of emptySlots) {
          if (reached) break
          const pool = pools[slot]
          if (!pool) continue

          // A1: 群猎
          if (pool.qunlie.length > 0) {
            row[`${slot}_val`] = pool.qunlie[0]
            row[`${slot}_color`] = 'fill'
            row[`${slot}_type`] = '群猎'
            if (this._calcRow(row).total >= threshold) {
              pool.qunlie.shift(); reached = true; break
            }
            row[`${slot}_val`] = ''; row[`${slot}_color`] = ''; row[`${slot}_type`] = ''
          }

          // A2: c — 用最小能满足阈值的c来填充
          // 先试该池最大c能否达标，不能则跳过；能则二分搜索最小达标c
          if (!reached && pool.c.length > 0) {
            const largest = pool.c[pool.c.length - 1]
            row[`${slot}_val`] = largest.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = largest.type || ''
            const maxDmg = this._calcRow(row).total
            row[`${slot}_val`] = ''; row[`${slot}_color`] = ''; row[`${slot}_type`] = ''

            if (maxDmg >= threshold) {
              let useIdx = -1
              for (let ci = 0; ci < pool.c.length; ci++) {
                const cItem = pool.c[ci]
                row[`${slot}_val`] = cItem.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = cItem.type || ''
                if (this._calcRow(row).total >= threshold) { useIdx = ci; break }
                row[`${slot}_val`] = ''; row[`${slot}_color`] = ''; row[`${slot}_type`] = ''
              }
              if (useIdx >= 0) {
                const chosen = pool.c.splice(useIdx, 1)[0]
                row[`${slot}_val`] = chosen.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = chosen.type || ''
                reached = true; break
              }
            }
          }

          // A3: 太阳奶 — 把奶值当作太阳奶填充（总伤×1.24）
          // 注意：此处只设 _type=''，太阳奶倍率由 _calcRow 自动识别
          if (!reached && pool.nai.length > 0) {
            row[`${slot}_val`] = pool.nai[0].val
            row[`${slot}_color`] = 'fill'
            row[`${slot}_type`] = ''
            if (this._calcRow(row).total >= threshold) {
              pool.nai.shift(); reached = true; break
            }
            row[`${slot}_val`] = ''; row[`${slot}_color`] = ''
          }
        }

        if (reached) {
          // ── 达标后剩余空位：填混子 → 太阳奶 → 最小c ──
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

          // ── 双c收紧：两填充c都填了且总伤>threshold，从池中换更小的c ──
          // 这步避免浪费大c在已达标行上
          const cSlots = this.names.filter(n =>
            row[`${n}_color`] === 'fill' && typeof row[`${n}_val`] === 'number')
          if (cSlots.length >= 2) {
            const curTot = this._calcRow(row).total
            if (curTot > 5400) {
              for (const cs of cSlots) {
                const pool = pools[cs]
                const curVal = row[`${cs}_val`]
                // 在池中找更小的c：从最小到最大试，第一个能让总伤≥5400的就是最优
                for (let ci = 0; ci < pool.c.length; ci++) {
                  const smaller = pool.c[ci]
                  if (smaller.val >= curVal) break // 池中c已不小于当前值
                  row[`${cs}_val`] = smaller.val
                  if (this._calcRow(row).total >= threshold) {
                    // 换成功：把当前c还回池，消耗更小的c
                    pool.c.splice(ci, 1)
                    pool.c.push({ name: cs, val: curVal, type: row[`${cs}_type`] || '' })
                    pool.c.sort((a, b) => a.val - b.val)
                    row[`${cs}_type`] = smaller.type || ''
                    break
                  }
                  row[`${cs}_val`] = curVal // 恢复
                }
              }
            }
          }
          continue
        }

        // ── 步骤 B：单填充不达标 → 双填充 ──
        // 枚举两个空位的组合（群猎+c / c+群猎 / 太阳奶+c / c+太阳奶 / c+c）
        // 每个组合从池中取最小能满足阈值的c来试
        const _findMinC = (pool, row, slot, comboFn) => {
          for (let ci = 0; ci < pool.c.length; ci++) {
            const cItem = pool.c[ci]
            row[`${slot}_val`] = cItem.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = cItem.type || ''
            if (comboFn ? comboFn() : (this._calcRow(row).total >= 5400)) {
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

            // B1: 群猎 + c — 群猎占A格，c占B格
            if (pA.qunlie.length > 0 && pB.c.length > 0) {
              row[`${sA}_val`] = pA.qunlie[0]; row[`${sA}_color`] = 'fill'; row[`${sA}_type`] = '群猎'
              const ci = _findMinC(pB, row, sB)
              if (ci >= 0) {
                pA.qunlie.shift(); pB.c.splice(ci, 1)[0]; reached = true; break
              }
              row[`${sA}_val`] = ''; row[`${sA}_color`] = ''; row[`${sA}_type`] = ''
            }

            // B2: c + 群猎 — c占A格，群猎占B格
            if (!reached && pA.c.length > 0 && pB.qunlie.length > 0) {
              row[`${sB}_val`] = pB.qunlie[0]; row[`${sB}_color`] = 'fill'; row[`${sB}_type`] = '群猎'
              const ci = _findMinC(pA, row, sA)
              if (ci >= 0) {
                pA.c.splice(ci, 1); pB.qunlie.shift(); reached = true; break
              }
              row[`${sB}_val`] = ''; row[`${sB}_color`] = ''; row[`${sB}_type`] = ''
            }

            // B3: 太阳奶 + c — 太阳奶（倍率×1.24）占A格，c占B格
            if (!reached && pA.nai.length > 0 && pB.c.length > 0) {
              row[`${sA}_val`] = pA.nai[0].val; row[`${sA}_color`] = 'fill'; row[`${sA}_type`] = ''
              const ci = _findMinC(pB, row, sB)
              if (ci >= 0) {
                pA.nai.shift(); pB.c.splice(ci, 1); reached = true; break
              }
              row[`${sA}_val`] = ''; row[`${sA}_color`] = ''
            }

            // B4: c + 太阳奶 — c占A格，太阳奶占B格
            if (!reached && pA.c.length > 0 && pB.nai.length > 0) {
              row[`${sB}_val`] = pB.nai[0].val; row[`${sB}_color`] = 'fill'; row[`${sB}_type`] = ''
              const ci = _findMinC(pA, row, sA)
              if (ci >= 0) {
                pA.c.splice(ci, 1); pB.nai.shift(); reached = true; break
              }
              row[`${sB}_val`] = ''; row[`${sB}_color`] = ''
            }

            // B5: c + c — 双c填充。从两个池的最小c开始试，找第一个≥4800的组合
            // 4800 比 threshold(5400) 低，允许两个稍小的c组合也能达标
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
          // ── 双填充达标 → 剩余空位填混子 → 太阳奶 → 最小c ──
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
          // ── 所有尝试均失败 → 耗尽剩余资源填满所有空位 ──
          // 优先级：群猎 → 太阳奶 → 最小c → 混子
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

    // ═══════════════════════════════════════════════
    // C. 后处理：极值交换
    //
    // 目标：选取伤害最低的 3 行，尝试与全表其他行交换同角色主c或主奶
    // 约束：每次交换后必须双方都仍 ≥ threshold，且低行伤害提升
    //
    // 交换优先级：
    //   ① 同角色主c交换（低行拿更大的c）→ 直接提升伤害
    //   ② 同角色主奶交换（低行拿更高的倍率）→ 间接提升伤害
    // ═══════════════════════════════════════════════
    const low3 = rows.map((r, i) => ({ idx: i, dmg: r.total })).sort((a, b) => a.dmg - b.dmg).slice(0, 3)
    for (const { idx: li } of low3) {
      const lRow = rows[li]
      for (const role of this.names) {
        // 只处理低行中作为主c的列
        if (lRow[`${role}_color`] !== 'c') continue
        const lcVal = lRow[`${role}_val`]

        // ── 找同角色主c的其他行，尝试交换c ──
        for (let ri = 0; ri < rows.length; ri++) {
          if (ri === li) continue
          const rRow = rows[ri]
          if (rRow[`${role}_color`] !== 'c') continue
          const rcVal = rRow[`${role}_val`]
          if (rcVal <= lcVal) continue // 只取更大的c给低行

          // 试交换
          lRow[`${role}_val`] = rcVal; rRow[`${role}_val`] = lcVal
          const lt = this._calcRow(lRow).total
          const rt = this._calcRow(rRow).total
          if (lt >= threshold && rt >= threshold && lt > lRow.total) {
            // 交换成功
            Object.assign(lRow, this._calcRow(lRow))
            Object.assign(rRow, this._calcRow(rRow))
            break // 换完就去处理下一个低行
          }
          // 回退
          lRow[`${role}_val`] = lcVal; rRow[`${role}_val`] = rcVal
        }

        // ── c交换没提升→试交换同列的奶 ──
        if (lRow[`${role}_color`] === 'c') { // 仍为c表示没被换过
          // 找出本行对应的奶列
          const naiRole = this.names.find(n => lRow[`${n}_color`] === 'nai')
          if (!naiRole) continue
          const lnVal = lRow[`${naiRole}_val`]

          for (let ri = 0; ri < rows.length; ri++) {
            if (ri === li) continue
            const rRow = rows[ri]
            if (rRow[`${naiRole}_color`] !== 'nai') continue
            const rnVal = rRow[`${naiRole}_val`]
            // 奶值按rate比较，只换rate更高的给低行
            if (this._rate(rnVal) <= this._rate(lnVal)) continue

            lRow[`${naiRole}_val`] = rnVal; rRow[`${naiRole}_val`] = lnVal
            const lt = this._calcRow(lRow).total
            const rt = this._calcRow(rRow).total
            if (lt >= threshold && rt >= threshold && lt > lRow.total) {
              Object.assign(lRow, this._calcRow(lRow))
              Object.assign(rRow, this._calcRow(rRow))
              break
            }
            lRow[`${naiRole}_val`] = lnVal; rRow[`${naiRole}_val`] = rnVal
          }
        }
        break // 处理完一个低行的主c列就换下一低行
      }
    }

    // ── 标记伤害最低的3行（前端用 _lowest3 标红） ──
    const dmgOrder = rows.map((r, i) => ({ idx: i, dmg: r.total })).sort((a, b) => a.dmg - b.dmg)
    for (let i = 0; i < rows.length; i++) rows[i]._lowest3 = false
    for (let k = 0; k < Math.min(3, dmgOrder.length); k++) rows[dmgOrder[k].idx]._lowest3 = true

    return {
      rows,
      meta: {
        total: 24,
        order: '从前往后填充 | 阈值≥5400→混子(优先)/c | <5400→群猎/太阳奶/c(单填)→双填 | 大c配小奶',
      },
      remaining,
    }
  }
}

// ==================== 独立运行入口 ====================
//
// 当通过 `node src/utils/index.js` 直接执行本文件时触发
// 用于开发调试：加载本地 JSON 数据 → 构建 24 行 → 打印摘要
// 在前端（Vue 项目）中作为模块导入时，此段不执行

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('utils/index.js')) {
  import('fs').then(fs => {
    import('path').then(path => {
      const __dirname = path.default.dirname(new URL(import.meta.url).pathname)
      const DATA_DIR = path.default.resolve(__dirname, '..', 'dataJson')
      const roleData = JSON.parse(fs.default.readFileSync(path.default.join(DATA_DIR, '角色.json'), 'utf-8'))
      const rateData = JSON.parse(fs.default.readFileSync(path.default.join(DATA_DIR, '奶的倍率.json'), 'utf-8'))
      const balancer = new ColumnBalancer(roleData, rateData)
      const result = balancer.build()

      // 输出摘要
      console.log(`[ColumnBalancer] ✅ 生成 ${result.rows.length} 行`)
      console.log(`  → ${result.meta.order}`)
      console.log(`  → 剩余 c: ${result.remaining.c.length} 个, 剩余奶: ${result.remaining.nai.length} 个`)

      // 打印前 5 行详情
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
