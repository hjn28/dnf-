/**
 * 工具函数
 * 读取 multiplier.txt / role.txt，生成两个独立的数据文件
 *
 *   角色.json     → { "角色": { 三年: {c,奶,混}, ... } }
 *   奶的倍率.json  → { "奶的倍率": [{2.5:1150}, ...] }
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

/**
 * 读取 multiplier.txt，解析为 { "奶的倍率": [{倍率值: 倍率数}, ...] }
 * 例: { "奶的倍率": [{2.5: 1150}, {2.6: 1250}, ...] }
 */
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

// ==================== 角色数据解析 ====================

/**
 * 读取 role.txt，解析为 { "角色": { 三年: {...}, 淘气: {...}, ... } }
 *
 * role.txt 每个角色块格式（空行分隔）：
 *   行1: 角色名
 *   行2: c — 伤害值列表（纯整数，空格分隔）
 *   行3: 奶 — 倍率值列表（小数，可能带 m 后缀）
 *   行4: 混 — 运算符列表（+ 或 x，可选行，缺失时全部默认为 x）
 *
 * 判断逻辑：
 *   - 混行: 只包含 + / x 字符
 *   - c行:  全为整数
 *   - 奶行: 含小数或 m 后缀
 */
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

    // 奶行：下一个
    const 奶Line = allLines[i++]
    const 奶 = 奶Line.split(/\s+/)

    // 混行（可选）：下一行如果是只含 +/x 则为混行，否则没有混行
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
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writeJsonFile(filePath, data, label) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`[utils] ✅ 已生成  ${path.relative(process.cwd(), filePath)}  (${label})`)
}

// ==================== 主入口 ====================

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 1. 生成奶的倍率
  const multData = generateMultiplierData()
  writeJsonFile(
    path.join(DATA_DIR, '奶的倍率.json'),
    multData,
    `${multData['奶的倍率'].length} 条倍率映射`
  )

  // 2. 生成角色数据
  const roleData = generateRoleData()
  writeJsonFile(
    path.join(DATA_DIR, '角色.json'),
    roleData,
    `${Object.keys(roleData['角色']).join('、')}`
  )

  // 打印详情
  const roles = roleData['角色']
  for (const [name, r] of Object.entries(roles)) {
    console.log(`     ${name}: c=${r.c.length}条, 奶=${r['奶'].length}条, 其它=${r.其它.length}条`)
  }

  console.log(`\n  → 读取方式:`)
  console.log(`       import 奶的倍率 from '@/dataJson/奶的倍率.json'  →  奶的倍率.奶的倍率`)
  console.log(`       import 角色 from '@/dataJson/角色.json'         →  角色.角色.三年.c`)
}
