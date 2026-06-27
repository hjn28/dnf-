<template>
  <div class="page-container">
    <NavBar />

    <div class="main-content">
      <div class="page-header">
        <h1 class="page-title">伤害对照表</h1>
      </div>

      <div class="content-layout">
        <!-- 左侧：颜色图例 -->
        <aside class="legend-sidebar">
          <div class="legend-title">颜色说明</div>
          <div class="legend-list">
            <div class="legend-item">
              <span class="legend-dot dot-c"></span>
              <span>c 伤害</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot dot-nai"></span>
              <span>奶倍率</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot dot-qun"></span>
              <span>群猎</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot dot-hun"></span>
              <span>混子</span>
            </div>
            <el-divider style="margin: 8px 0" />
            <div class="legend-item">
              <el-tag size="small" type="danger" effect="plain">m</el-tag>
              <span>高倍率</span>
            </div>
          </div>
        </aside>

        <!-- 中间：数据表格 -->
        <div class="table-area">
          <el-card shadow="hover">
            <template #header>
              <div class="card-header">
                <span><el-icon><DataAnalysis /></el-icon> 角色数据明细</span>
                <el-tag size="small" type="info">行数: {{ tableData.length }}</el-tag>
              </div>
            </template>

            <el-table
              :data="tableData"
              border
              stripe
              size="large"
              class="data-table"
              max-height="700"
            >
              <el-table-column
                label="序号"
                type="index"
                width="60"
                align="center"
                fixed
              />

              <el-table-column
                v-for="name in characterOrder"
                :key="name"
                :label="name"
                align="center"
                min-width="130"
              >
                <template #default="{ row }">
                  <span
                    v-if="row[`${name}_val`] !== ''"
                    class="data-val"
                    :class="[
                      `color-${row[`${name}_color`]}`,
                      row[`${name}_color`] === 'nai' && typeof row[`${name}_val`] === 'string' && (row[`${name}_val`] as string).includes('m') ? 'color-nai-m' : ''
                    ]"
                  >
                    {{ row[`${name}_val`] }}
                  </span>
                  <span v-else class="data-val val-empty">—</span>
                </template>
              </el-table-column>

              <el-table-column
                label="伤害对照表（千亿）"
                width="200"
                align="right"
                sortable
                prop="total"
                fixed="right"
              >
                <template #default="{ row }">
                  <span
                    class="cell-total"
                    :class="{ 'total-zero': row.segment !== 'c' }"
                  >
                    {{ row.segment === 'c' ? formatYi(row.total) : '—' }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DataAnalysis } from '@element-plus/icons-vue'
import 角色数据 from '@/dataJson/角色.json'

const data = (角色数据 as any).角色 as Record<string, { c: number[]; 奶: string[]; 其它: string[] }>

// ==================== 构建拼接数组 ====================

const characterOrder = ['三年', '淘气', '起源', '老王']

/**
 * 每个角色的完整数据 = c + 奶 + 其它 拼接
 * 同时记录每项的颜色来源: 'c' | 'nai' | 'qun' | 'hun'
 */
function buildCombinedArrays(name: string): { values: (number | string)[]; colors: string[] } {
  const d = data[name]
  if (!d) return { values: [], colors: [] }

  const values: (number | string)[] = []
  const colors: string[] = []

  // c 段
  for (const v of d.c) {
    values.push(v)
    colors.push('c')
  }

  // 奶段
  for (const v of d.奶) {
    values.push(v)
    colors.push('nai')
  }

  // 其它段
  for (const v of d.其它) {
    values.push(v)
    colors.push(v === '群猎' ? 'qun' : 'hun')
  }

  return { values, colors }
}

const charArrays = computed(() => {
  const map: Record<string, { values: (number | string)[]; colors: string[] }> = {}
  for (const name of characterOrder) {
    map[name] = buildCombinedArrays(name)
  }
  return map
})

// 最大行数
const maxRows = computed(() =>
  Math.max(...characterOrder.map(name => charArrays.value[name]?.values.length || 0))
)

interface TableRow {
  [key: string]: number | string
  total: number
  segment: string  // 'c' | 'nai' | 'qun' | 'hun'
}

const tableData = computed<TableRow[]>(() => {
  const rows: TableRow[] = []
  for (let i = 0; i < maxRows.value; i++) {
    const row: TableRow = { total: 0, segment: 'c' }
    let seg = 'c'
    for (const name of characterOrder) {
      const arr = charArrays.value[name]
      row[`${name}_val`] = arr?.values[i] !== undefined ? arr.values[i] : ''
      row[`${name}_color`] = arr?.colors[i] || 'empty'

      // 记录段类型（取第一个非空的）
      if (arr && arr.colors[i]) {
        if (seg === 'c') seg = arr.colors[i]
      }
    }
    row.segment = seg

    // c 段才累加伤害
    let cTotal = 0
    if (seg === 'c') {
      for (const name of characterOrder) {
        const arr = charArrays.value[name]
        const v = arr?.values[i]
        if (typeof v === 'number') cTotal += v
      }
    }
    row.total = cTotal
    rows.push(row)
  }
  return rows
})

function formatYi(n: number): string {
  if (n === 0) return '0'
  const yi = n / 100_000_000_000
  return yi.toFixed(4) + ' 千亿'
}
</script>

<style scoped>
.page-header {
  margin-bottom: 16px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--el-text-color-primary);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ===== 双栏布局 ===== */
.content-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

/* ===== 左侧图例 ===== */
.legend-sidebar {
  width: 140px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px 14px;
  position: sticky;
  top: 20px;
}

.legend-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.legend-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  flex-shrink: 0;
}

.dot-c {
  background: var(--el-color-primary);
}
.dot-nai {
  background: #d4890a;
}
.dot-qun {
  background: var(--el-color-success);
}
.dot-hun {
  background: #8b5cf6;
}

/* ===== 表格区域 ===== */
.table-area {
  flex: 1;
  min-width: 0;
}

.data-table :deep(.el-table__header th) {
  font-weight: 700;
  background: var(--el-fill-color-lighter);
  font-size: 14px;
}

/* ===== 数据值颜色 ===== */
.data-val {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
}

.color-c {
  color: var(--el-color-primary);
  font-size: 15px;
}

.color-nai {
  color: #d4890a;
}

.color-nai-m {
  color: var(--el-color-danger);
  font-weight: 700;
}

.color-qun {
  color: var(--el-color-success);
}

.color-hun {
  color: #8b5cf6;
}

.val-empty {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}

.cell-total {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--el-color-danger);
}

.total-zero {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
</style>
