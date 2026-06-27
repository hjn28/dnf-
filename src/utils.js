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

function generateMultiplierData(filePath = MULTIPLIER_FILE) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  const list = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2) {
      const key = parseFloat(parts[0])
      const value = parseInt(parts[1], 10)
      if (!isNaN(key) && !isNaN(value)) {
        list.push({ [key]: value })
      }
    }
  }

  return { '奶的倍率': list }
}

/** 构建倍率 Map: 2.5 → 1150 */
function buildRateMap(multData) {
  const map = new Map()
  for (const entry of multData['奶的倍率']) {
    const [key, val] = Object.entries(entry)[0]
    map.set(parseFloat(key), val)
  }
  return map
}

// ==================== 角色数据解析 ====================

function generateRoleData(filePath = ROLE_FILE) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const allLines = content.split('\n').map(l => l.trim()).filter(l => l !== '')
  const roles = {}

  let i = 0
  while (i < allLines.length) {
    const name = allLines[i++]

    // c 行：全整数的行
    const cLine = allLines[i++]
    const c = cLine.split(/\s+/).map(Number)

    // 奶行
    const 奶Line = allLines[i++]
    const 奶 = 奶Line.split(/\s+/)

    // 混行（可选）
    let 其它 = []
    if (i < allLines.length && /^[+\sx]+$/.test(allLines[i])) {
      其它 = allLines[i++].split(/\s+/).map(op => op === '+' ? '群猎' : '混子')
    }

    roles[name] = { c, 奶, 其它 }
  }

  return { '角色': roles }
}

// ==================== 写入 ====================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function writeJsonFile(filePath, data, label) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`[utils] ✅ 已生成  ${path.relative(process.cwd(), filePath)}  (${label})`)
}

// ==================== 表格数据生成 ====================

/**
 * 生成 24 行对照表
 * 每行: 1 主 c（降序）+ 1 主奶（升序）+ 2 填充
 *
 * 伤害对照表计算:
 *   damage = sum(所有 c 数值) × 奶rate / 1000
 *   行内有群猎(字符串标记) → 主c×1.12
 *   混子字符串非数值，自然不计入
 *   奶rate = 从奶的倍率.json 查表（过滤 m 后缀）
 */
function generateTableData(roles, rateMap) {
  const names = Object.keys(roles)

  // ---- 1. 收集所有值（c 附带类型信息） ----
  const cItems = []    // { name, val, type }
  const naiItems = []  // { name, val }
  const hunItems = []  // { name, val }

  for (const n of names) {
    for (let i = 0; i < roles[n].c.length; i++) {
      const type = (roles[n].其它 && roles[n].其它[i]) || ''
      cItems.push({ name: n, val: roles[n].c[i], type })
    }
    for (const v of roles[n].奶)   naiItems.push({ name: n, val: v })
    for (const v of roles[n].其它) hunItems.push({ name: n, val: v })
  }

  cItems.sort((a, b) => b.val - a.val)
  naiItems.sort((a, b) => parseFloat(String(a.val).replace('m', '')) - parseFloat(String(b.val).replace('m', '')))

  // ---- 2. 取 24 主 c + 24 主奶 ----
  const mainC = cItems.slice(0, 24)

  const naiDesc = [...naiItems].sort((a, b) =>
    parseFloat(String(b.val).replace('m', '')) - parseFloat(String(a.val).replace('m', ''))
  )
  const mainNai = naiDesc.slice(0, 24).reverse()

  // ---- 3. 配对 ----
  const pairedNai = []
  const pool = [...mainNai]
  for (const c of mainC) {
    const idx = pool.findIndex(n => n.name !== c.name)
    pairedNai.push(idx >= 0 ? pool.splice(idx, 1)[0] : pool.shift())
  }

  // 平滑交换
  for (let pass = 0; pass < 10; pass++) {
    let swapped = false
    for (let i = 0; i < 23; i++) {
      const va = parseFloat(String(pairedNai[i].val).replace('m', ''))
      const vb = parseFloat(String(pairedNai[i + 1].val).replace('m', ''))
      if (va > vb) {
        const c1 = mainC[i].name, n1 = pairedNai[i + 1].name
        const c2 = mainC[i + 1].name, n2 = pairedNai[i].name
        if (c1 !== n1 && c2 !== n2) {
          [pairedNai[i], pairedNai[i + 1]] = [pairedNai[i + 1], pairedNai[i]]
          swapped = true
        }
      }
    }
    if (!swapped) break
  }

  // ---- 4. 按角色构建填充池（每列值只能在本列填充） ----
  const naiExtras = naiItems.length > 24
    ? naiItems.slice(0, naiItems.length - 24)
    : []
  const charPools = {}
  for (const n of names) {
    charPools[n] = {
      c:   cItems.slice(24).filter(f => f.name === n).sort((a,b) => b.val - a.val),
      nai: naiExtras.filter(f => f.name === n),
      hun: hunItems.filter(f => f.name === n),
    }
  }

  // ---- 5. 伤害计算辅助 ----

  function getRate(naiVal) {
    const key = parseFloat(String(naiVal).replace('m', ''))
    return rateMap.get(key) || 0
  }

  /** 计算单行伤害（用于填充前预评估） */
  function calcRowDamage(row) {
    const hasQunlie = Object.values(row).some(v => v === '群猎')
    let cSum = 0
    for (const n of names) {
      const v = row[`${n}_val`]
      if (typeof v === 'number') {
        cSum += row[`${n}_color`] === 'c' && hasQunlie ? Math.round(v * 1.12) : v
      }
    }
    const naiCol = Object.keys(row).find(k => k.endsWith('_color') && row[k] === 'nai')
    const naiName = naiCol ? naiCol.replace('_color', '') : ''
    const rate = getRate(row[`${naiName}_val`] || '')
    return { cSum, rate, total: Math.round(cSum * rate / 1000) }
  }

  // ---- 6. 构建 24 行（基础：主c + 主奶） ----
  const rows = []
  for (let i = 0; i < 24; i++) {
    const row = { segment: 'mixed' }
    row[`${mainC[i].name}_val`] = mainC[i].val
    row[`${mainC[i].name}_color`] = 'c'
    row[`${mainC[i].name}_type`] = mainC[i].type
    row[`${pairedNai[i].name}_val`] = pairedNai[i].val
    row[`${pairedNai[i].name}_color`] = 'nai'
    rows.push(row)
  }

  // ---- 7. 按列填充（每列值只能在本列中填充） ----
  // 策略：低伤害行 → 给 c 值 / 群猎；高伤害行 → 给混子/奶值
  // 先按基础伤害排序，从低到高逐行填充，每行空位用对应角色池的填充

  for (const row of rows) {
    row._slots = names.filter(n => row[`${n}_val`] === undefined || row[`${n}_val`] === '')
    row._dmg = calcRowDamage(row).total
  }

  // 按伤害升序处理（低→高）
  const sortedRows = [...rows].sort((a, b) => a._dmg - b._dmg)

  for (const row of sortedRows) {
    // 该行的每个空位，从对应角色池取最优填充
    for (const slot of row._slots) {
      const pool = charPools[slot]
      if (!pool) continue

      // 优先级：c(提升) > hun中群猎(触发×1.12) > hun中混子/奶值(无影响)
      let fill = null
      if (pool.c.length > 0) {
        fill = { val: pool.c[0].val, type: '', color: 'fill' }
        pool.c.shift()
      } else if (pool.hun.some(h => h.val === '群猎')) {
        const idx = pool.hun.findIndex(h => h.val === '群猎')
        pool.hun.splice(idx, 1)
        fill = { val: '群猎', type: '群猎', color: 'fill' }
      } else if (pool.hun.length > 0) {
        fill = { val: pool.hun[0].val, type: '', color: 'fill' }
        pool.hun.shift()
      } else if (pool.nai.length > 0) {
        fill = { val: pool.nai[0].val, type: '', color: 'fill' }
        pool.nai.shift()
      }

      if (fill) {
        row[`${slot}_val`] = fill.val
        row[`${slot}_color`] = fill.color
        row[`${slot}_type`] = fill.type || ''
        row._dmg = calcRowDamage(row).total
      }
    }
    delete row._slots
    delete row._dmg
  }

  // 兜底：若有空位未填，从所有角色剩余池中取，确保无空值
  const allRemaining = []
  for (const n of names) {
    const p = charPools[n]
    if (!p) continue
    for (const item of p.c)   allRemaining.push({ name: n, val: item.val, type: item.type || '' })
    for (const item of p.nai) allRemaining.push({ name: n, val: item.val, type: '' })
    for (const item of p.hun) allRemaining.push({ name: n, val: item.val, type: '' })
  }
  for (const row of rows) {
    for (const n of names) {
      if ((row[`${n}_val`] === undefined || row[`${n}_val`] === '') && allRemaining.length > 0) {
        const fill = allRemaining.shift()
        row[`${n}_val`] = fill.val
        row[`${n}_color`] = 'fill'
        row[`${n}_type`] = fill.type || ''
      } else if (row[`${n}_val`] === undefined || row[`${n}_val`] === '') {
        row[`${n}_val`] = ''
        row[`${n}_color`] = 'empty'
        row[`${n}_type`] = ''
      }
    }
  }

  // ---- 8. 最终伤害计算 ----
  for (const row of rows) {
    const { cSum, rate, total } = calcRowDamage(row)
    row.cSum = cSum
    row.rate = rate
    row.total = total
  }

  return {
    rows,
    meta: {
      total: 24,
      cCount: 24,
      naiCount: 24,
      order: '24行：1主c(降)+1主奶(升)+填充 | 伤害=c有效×奶rate÷1000',
    },
  }
}

// ==================== 主入口 ====================

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 1. 奶的倍率
  const multData = generateMultiplierData()
  writeJsonFile(
    path.join(DATA_DIR, '奶的倍率.json'),
    multData,
    `${multData['奶的倍率'].length} 条倍率映射`
  )

  // 2. 角色数据
  const roleData = generateRoleData()
  writeJsonFile(
    path.join(DATA_DIR, '角色.json'),
    roleData,
    `${Object.keys(roleData['角色']).join('、')}`
  )

  // 3. 表格数据（含伤害计算）
  const roles = roleData['角色']
  const rateMap = buildRateMap(multData)
  const tableData = generateTableData(roles, rateMap)
  writeJsonFile(
    path.join(DATA_DIR, '表格数据.json'),
    tableData,
    `24 行 (含伤害计算)`
  )

  // 打印
  const roles_ = roleData['角色']
  for (const [name, r] of Object.entries(roles_)) {
    console.log(`     ${name}: c=${r.c.length}条 + 奶=${r['奶'].length}条 + 其它=${r.其它.length}条 = ${r.c.length + r.奶.length + r.其它.length} 项`)
  }
  console.log(`  → 表格: ${tableData.rows.length} 行 | 伤害公式: c有效×奶rate÷1000`)
  console.log(`  → 行有群猎: 主c×1.12 | 无群猎: 全部正常 | 混子: 跳过`)

  // 显示前3行伤害
  console.log(`\n  伤害对照表（千亿）:`)
  for (let i = 0; i < 3; i++) {
    const r = tableData.rows[i]
    console.log(`     [${i + 1}] c有效=${r.cSum} × 奶rate=${r.rate} ÷ 1000 = ${r.total}`)
  }
  console.log(`     ...`)

  console.log(`\n  → 读取方式:`)
  console.log(`       import 奶的倍率 from '@/dataJson/奶的倍率.json'  →  奶的倍率.奶的倍率`)
  console.log(`       import 角色 from '@/dataJson/角色.json'         →  角色.角色.三年.c`)
  console.log(`       import 表格数据 from '@/dataJson/表格数据.json'  →  表格数据.rows`)
}
