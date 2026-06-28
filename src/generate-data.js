/**
 * 工具函数
 * 读取 multiplier.txt / role.txt，生成数据文件
 *
 *   奶的倍率.json  → { "奶的倍率": [{2.5:1150}, ...] }
 *   角色.json      → { "角色": { 三年: {c,奶,其它}, ... } }
 *   表格数据.json   → { rows: [...], meta: {...} }
 *
 * 运行方式: node src/utils.js
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MULTIPLIER_FILE = path.resolve(__dirname, '..', 'public', 'multiplier.txt')
const ROLE_FILE = path.resolve(__dirname, '..', 'public', 'role.txt')
const DATA_DIR = path.resolve(__dirname, 'dataJson')

// ==================== 倍率表解析 ====================

function generateMultiplierData(fp = MULTIPLIER_FILE) {
  const c = fs.readFileSync(fp, 'utf-8')
  const list = []
  for (const l of c.trim().split('\n')) {
    const t = l.trim(); if (!t) continue
    const p = t.split(/\s+/)
    if (p.length >= 2) { const k = parseFloat(p[0]), v = parseInt(p[1], 10); if (!isNaN(k) && !isNaN(v)) list.push({ [k]: v }) }
  }
  return { '奶的倍率': list }
}

function buildRateMap(md) {
  const m = new Map(); for (const e of md['奶的倍率']) { const [k, v] = Object.entries(e)[0]; m.set(parseFloat(k), v) }; return m
}

function generateRoleData(fp = ROLE_FILE) {
  const lines = fs.readFileSync(fp, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean)
  const r = {}; let i = 0
  while (i < lines.length) {
    const name = lines[i++], c = lines[i++].split(/\s+/).map(Number), nai = lines[i++].split(/\s+/)
    let other = []
    if (i < lines.length && /^[+\sx]+$/.test(lines[i])) other = lines[i++].split(/\s+/).map(o => o === '+' ? '群猎' : '混子')
    r[name] = { c, 奶: nai, 其它: other }
  }
  return { '角色': r }
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }
function writeJson(fp, data, label) { ensureDir(path.dirname(fp)); fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8'); console.log(`[utils] ✅ 已生成  ${path.relative(process.cwd(), fp)}  (${label})`) }

// ==================== DamageBalancer 类 ====================

class DamageBalancer {
  constructor(roles, rateMap) {
    this.names = Object.keys(roles); this.roles = roles; this.rateMap = rateMap; this._prepare()
  }
  _num(v) { return parseFloat(String(v).replace('m', '')) }
  _rate(v) { return this.rateMap.get(this._num(v)) || 0 }

  _prepare() {
    const cItems = [], naiItems = [], hunItems = []
    for (const n of this.names) {
      for (let i = 0; i < this.roles[n].c.length; i++) cItems.push({ name: n, val: this.roles[n].c[i], type: (this.roles[n].其它 && this.roles[n].其它[i]) || '' })
      for (const v of this.roles[n].奶) naiItems.push({ name: n, val: v })
      for (const v of this.roles[n].其它) hunItems.push({ name: n, val: v })
    }
    cItems.sort((a, b) => b.val - a.val)
    naiItems.sort((a, b) => this._num(a.val) - this._num(b.val))

    this.mainC = cItems.slice(0, 24)                             // c降序 [0]=最大
    this.mainNai = [...naiItems].sort((a, b) => this._num(b.val) - this._num(a.val)).slice(0, 24)  // 奶降序 [0]=最大
    this.naiExtras = naiItems.slice(0, naiItems.length - 24)     // 24个之外的奶, 作太阳奶×1.24

    this.pools = {}
    for (const n of this.names) {
      this.pools[n] = {
        c: cItems.slice(24).filter(f => f.name === n).sort((a, b) => b.val - a.val),
        nai: this.naiExtras.filter(f => f.name === n),
        hun: hunItems.filter(f => f.name === n),
      }
    }
  }

  calcRow(row) {
    const hasQunlie = Object.values(row).some(v => v === '群猎')
    let cSum = 0, mainRate = 0, subRate = 0, maxC = 0
    for (const n of this.names) {
      const v = row[`${n}_val`], c = row[`${n}_color`]
      if (typeof v === 'number') { const add = c === 'c' && hasQunlie ? Math.round(v * 1.12) : v; cSum += add; if (c === 'c') maxC = add }
      if (c === 'nai') mainRate = this._rate(v)
    }
    for (const n of this.names) {
      const v = row[`${n}_val`], c = row[`${n}_color`]
      if (c === 'fill' && typeof v === 'string' && /^[\d.]+m?$/.test(v) && subRate === 0 && maxC < 4000) subRate = Math.round(this._rate(v) * 1.24)
    }
    return { cSum, totalRate: mainRate + subRate, total: Math.round(cSum * (mainRate + subRate) / 1000) }
  }

  _pair() {
    // 大c配小奶：c降序[0]=最大 配 奶升序[0]=最小
    const naiAsc = [...this.mainNai].reverse()  // 降序→升序, [0]=最小
    const pairs = [], used = new Set()
    for (let i = 0; i < this.mainC.length; i++) {
      let idx = i  // c[i](大) ↔ 奶[i](小)
      while (idx < naiAsc.length && (used.has(idx) || this.mainC[i].name === naiAsc[idx].name)) idx++
      if (idx >= naiAsc.length) { idx = 0; while (used.has(idx) || this.mainC[i].name === naiAsc[idx].name) idx++ }
      used.add(idx)
      pairs.push({ c: this.mainC[i], nai: naiAsc[idx], baseDmg: 0 })
    }
    for (const p of pairs) {
      const ce = p.c.type === '群猎' ? Math.round(p.c.val * 1.12) : p.c.val
      p.baseDmg = Math.round(ce * this._rate(p.nai.val) / 1000)
    }
    return pairs
  }

  build() {
    const pairs = this._pair()
    const rows = pairs.map(p => {
      const row = { segment: 'mixed', _baseDmg: p.baseDmg }
      row[`${p.c.name}_val`] = p.c.val; row[`${p.c.name}_color`] = 'c'; row[`${p.c.name}_type`] = p.c.type
      row[`${p.nai.name}_val`] = p.nai.val; row[`${p.nai.name}_color`] = 'nai'
      return row
    })

    // 基伤统计
    const bd = rows.map(r => r._baseDmg)
    const mean = bd.reduce((s, v) => s + v, 0) / bd.length
    console.log(`  → 基伤: 均值=${Math.round(mean)} 极差=${Math.max(...bd) - Math.min(...bd)}`)

    // ---- 填充 ----
    // 低于均值：补 c 或太阳奶（提伤害）
    // 高于均值：从大到小处理，先混子（不增伤），再小c（轻度提升）
    const allSlots = []
    for (const row of rows) { const slots = this.names.filter(n => row[`${n}_val`] === undefined); for (const s of slots) allSlots.push({ row, slot: s, bd: row._baseDmg }) }

    // ① 低于均值的行：补 c 值
    const belowC = allSlots.filter(s => s.bd < mean && this.pools[s.slot]?.c?.length > 0)
    belowC.sort((a, b) => a.bd - b.bd)
    for (const { row, slot } of belowC) { const p = this.pools[slot]; if (p?.c?.length > 0) { row[`${slot}_val`] = p.c.shift().val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = '' } }

    // ② 低于均值的行：补太阳奶
    const belowNai = allSlots.filter(s => s.bd < mean && this.pools[s.slot]?.nai?.length > 0)
    belowNai.sort((a, b) => a.bd - b.bd)
    for (const { row, slot } of belowNai) { const p = this.pools[slot]; if (p?.nai?.length > 0) { row[`${slot}_val`] = p.nai.shift().val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = '' } }

    // ③ 高于均值的行：从大到小处理，优先混子，然后小c
    const above = allSlots.filter(s => s.bd >= mean)
    above.sort((a, b) => b.bd - a.bd)
    for (const { row, slot } of above) {
      const p = this.pools[slot]; if (!p) continue
      let f = null
      // 高伤害行只拿"混子"，不增伤也不触发群猎×1.12
      const hunIdx = p.hun.findIndex(h => h.val === '混子')
      if (hunIdx >= 0) { p.hun.splice(hunIdx, 1) }
      row[`${slot}_val`] = '混子'; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = ''
    }

    // ④ 剩余空位
    const remain = allSlots.filter(s => s.row[`${s.slot}_val`] === undefined)
    remain.sort((a, b) => a.bd - b.bd)
    for (const { row, slot } of remain) {
      const p = this.pools[slot]; if (!p) continue
      let f = null
      if (p.c?.length > 0)                                 f = { val: p.c.shift().val, type: '' }
      else if (p.nai?.length > 0)                           f = { val: p.nai.shift().val, type: '' }
      else if (p.hun.some(h => h.val === '群猎'))         { const idx = p.hun.findIndex(h => h.val === '群猎'); p.hun.splice(idx, 1); f = { val: '群猎', type: '群猎' } }
      else if (p.hun.length > 0)                           f = { val: p.hun.shift().val, type: '' }
      if (f) { row[`${slot}_val`] = f.val; row[`${slot}_color`] = 'fill'; row[`${slot}_type`] = f.type || '' }
    }

    // 兜底：先同列填，再跨列兜底
    const fallback = []
    for (const n of this.names) {
      const p = this.pools[n]; const rem = [...(p?.c || []), ...(p?.nai || []), ...(p?.hun || [])]
      for (const row of rows) {
        if (row[`${n}_val`] === undefined || row[`${n}_val`] === '') {
          const f = rem.shift()
          if (f) { row[`${n}_val`] = f.val; row[`${n}_color`] = 'fill'; row[`${n}_type`] = f.type || '' }
          else fallback.push({ row, col: n })
        }
      }
    }
    // 仍有空位：用 '混子' 兜底（不影响计算，非数值）
    for (const { row, col } of fallback) {
      row[`${col}_val`] = '混子'; row[`${col}_color`] = 'fill'; row[`${col}_type`] = ''
    }

    // ---- 补全后交换：最低行与更高行尝试同列交换，降低整体方差 ----
    for (let pass = 0; pass < 10; pass++) {
      for (const r of rows) r._dmg = this.calcRow(r).total
      const byDmg = [...rows].sort((a, b) => a._dmg - b._dmg)
      const low = byDmg[0]
      const allDmg = rows.map(r => r._dmg)
      const curMean = allDmg.reduce((s, v) => s + v, 0) / allDmg.length
      if (low._dmg > curMean * 0.8) break  // 最低行已达均值80%

      const curVar = allDmg.reduce((s, v) => s + (v - curMean) ** 2, 0)
      let bestSwap = null, bestVar = curVar

      for (const col of this.names) {
        const mc = low[`${col}_color`]
        if (!mc || mc === 'empty' || mc === ' ') continue
        if (!['c', 'nai'].includes(mc)) continue  // 只交换主c/主奶列，fill列数值不参与，留在低于均值行

        for (let hi = byDmg.length - 1; hi > 0; hi--) {
          const hr = byDmg[hi]
          if (hr[`${col}_color`] !== mc || hr[`${col}_val`] === low[`${col}_val`]) continue

          // 试交换
          const tV = low[`${col}_val`]; low[`${col}_val`] = hr[`${col}_val`]; hr[`${col}_val`] = tV
          const tT = low[`${col}_type`]; low[`${col}_type`] = hr[`${col}_type`]; hr[`${col}_type`] = tT
          const dL = this.calcRow(low).total, dH = this.calcRow(hr).total
          const dmgs = rows.map(r => r._dmg)
          // 直接重算两行伤害
          const newAll = rows.map(r => r === low ? dL : r === hr ? dH : r._dmg)
          const m = newAll.reduce((s, v) => s + v, 0) / newAll.length
          const v = newAll.reduce((s, v) => s + (v - m) ** 2, 0)
          // 还原
          low[`${col}_val`] = hr[`${col}_val`]; hr[`${col}_val`] = tV
          low[`${col}_type`] = hr[`${col}_type`]; hr[`${col}_type`] = tT

          if (v < bestVar && dL > low._dmg) { bestVar = v; bestSwap = { col, hr }}
        }
      }

      if (bestSwap) {
        const { col, hr } = bestSwap
        const tV = low[`${col}_val`]; low[`${col}_val`] = hr[`${col}_val`]; hr[`${col}_val`] = tV
        const tT = low[`${col}_type`]; low[`${col}_type`] = hr[`${col}_type`]; hr[`${col}_type`] = tT
        low._dmg = this.calcRow(low).total; hr._dmg = this.calcRow(hr).total
      } else break
    }
    for (const r of rows) { delete r._dmg; delete r._baseDmg }

    // 最终伤害
    for (const row of rows) { const { cSum, totalRate, total } = this.calcRow(row); row.cSum = cSum; row.rate = totalRate; row.total = total }

    return { rows, meta: { total: 24, order: '大c配小奶 | 均值以下补c/太阳奶×1.24 | 均值以上:从大到小→混子→小c' } }
  }
}

// ==================== 主入口 ====================

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const multData = generateMultiplierData()
  writeJson(path.join(DATA_DIR, '奶的倍率.json'), multData, `${multData['奶的倍率'].length} 条倍率映射`)

  const roleData = generateRoleData()
  writeJson(path.join(DATA_DIR, '角色.json'), roleData, `${Object.keys(roleData['角色']).join('、')}`)

  const roles = roleData['角色']
  const rateMap = buildRateMap(multData)
  const balancer = new DamageBalancer(roles, rateMap)
  const tableData = balancer.build()
  writeJson(path.join(DATA_DIR, '表格数据.json'), tableData, `24 行 (DamageBalancer)`)

  for (const [name, r] of Object.entries(roles)) console.log(`     ${name}: c=${r.c.length}条 + 奶=${r['奶'].length}条 + 其它=${r.其它.length}条`)
  console.log(`  → ${tableData.meta.order}`)

  const dmgRows = tableData.rows.map(r => r.total).sort((a, b) => a - b)
  console.log(`\n  伤害分布: ${dmgRows[0]} ~ ${dmgRows[23]}  极差: ${dmgRows[23] - dmgRows[0]}`)
  console.log(`  最高2行: ${dmgRows[23]}, ${dmgRows[22]}  其余极差: ${dmgRows[20] - dmgRows[0]}`)

  console.log(`\n  → 读取方式:`)
  console.log(`       import 奶的倍率 from '@/dataJson/奶的倍率.json'`)
  console.log(`       import 角色 from '@/dataJson/角色.json'`)
  console.log(`       import 表格数据 from '@/dataJson/表格数据.json'`)
}
