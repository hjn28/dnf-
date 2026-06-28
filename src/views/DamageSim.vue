<template>
  <div class="page-container">
    <NavBar />

    <div class="main-content">
      <!-- <div class="page-header">
        <h1 class="page-title">伤害对照表</h1>
      </div> -->

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
            <div class="legend-item">
              <span class="legend-dot dot-sun"></span>
              <span>太阳奶</span>
            </div>
            <el-divider style="margin: 8px 0" />
            <div class="legend-item">
              <el-tag size="small" type="danger" effect="plain">m</el-tag>
              <span>高倍率</span>
            </div>
          </div>
          <el-divider style="margin: 8px 0" />
          <div class="legend-order">
            <div class="order-title">每行布局</div>
            <div class="order-item" style="padding-left:8px;">
              <span class="legend-dot dot-c" style="width:10px;height:10px"></span> 主c(降)
              <span class="legend-dot dot-nai" style="width:10px;height:10px;margin-left:6px"></span> 主奶(升)
              <span class="legend-dot dot-fill" style="width:10px;height:10px;margin-left:6px"></span> 填充x2
            </div>
            <el-divider style="margin: 6px 0" />
            <div class="order-title">伤害公式</div>
            <div class="order-item" style="font-size:11px;line-height:1.5;">
              c有效 × 奶rate ÷ 1000
            </div>
            <div class="order-item" style="font-size:11px;">
              行有群猎 → 主c×1.12
            </div>
            <div class="order-item" style="font-size:11px;">
              无群猎 → 全部正常 &nbsp; 🟡混子 跳过
            </div>
            <el-divider style="margin: 6px 0" />
            <div class="order-title">颜色标记</div>
            <div class="legend-item">
              <span class="legend-dot dot-c"></span><span>主 c</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot dot-nai"></span><span>主奶</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot dot-fill"></span><span>填充值</span>
            </div>
            <div class="legend-item">
              <el-tag size="small" type="danger" effect="plain" style="height:20px;line-height:18px">m</el-tag>
              <span>高倍率</span>
            </div>
          </div>
        </aside>

        <!-- 中间：数据表格 -->
        <div class="table-area">
          <el-card shadow="hover">
            <!-- <template #header>
              <div class="card-header">
                <span><el-icon><DataAnalysis /></el-icon> 角色数据明细</span>
                <div class="header-info">
                  <el-tag size="small" type="info">24 行</el-tag>
                  <el-tag size="small" type="primary">c有效 × 奶rate ÷ 1000</el-tag>
                </div>
              </div>
            </template> -->

            <el-table
              :data="tableData"
              border
              stripe
              size="small"
              class="data-table"
            >
              <el-table-column label="#" type="index" width="40" align="center" fixed />

              <el-table-column v-for="name in characterOrder" :key="name" :label="name" align="center" width="110">
                <template #default="{ row }">
                  <span v-if="row[`${name}_val`] !== ''" class="data-cell"
                    :class="`bg-${row[`${name}_color`]}`">
                    <span class="data-val"
                      :class="[`color-${row[`${name}_color`]}`,
                        row[`${name}_color`] === 'nai' && typeof row[`${name}_val`] === 'string' && (row[`${name}_val`] as string).includes('m') ? 'color-nai-m' : '']">
                      {{ row[`${name}_val`] }}
                    </span>
                  </span>
                  <span v-else class="data-val val-empty">—</span>
                </template>
              </el-table-column>

              <el-table-column label="伤害（千亿）" width="130" align="right" sortable prop="total" fixed="right">
                <template #default="{ row }">
                  <span class="cell-total" :class="{ 'total-zero': row.total === 0, 'cell-lowest': row._lowest3 }" >
                    {{ row.total > 0 ? row.total.toLocaleString() : '—' }}
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
import { DataAnalysis } from '@element-plus/icons-vue'
import { ColumnBalancer } from '@/utils'
import 角色数据 from '@/dataJson/角色.json'
import 倍率数据 from '@/dataJson/奶的倍率.json'

interface TableRow {
  [key: string]: number | string
  total: number
  segment: string
}

// 实例化列平衡计算器
const balancer = new ColumnBalancer(角色数据, 倍率数据)
const { rows, meta, remaining } = balancer.build()

const tableData = rows as TableRow[]
const characterOrder = ['三年', '淘气', '起源', '老王']

</script>

<style scoped>
.page-header { margin-bottom: 16px; }
.page-title { font-size: 22px; font-weight: 700; margin: 0; color: var(--el-text-color-primary); }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.header-info { display: flex; gap: 6px; }

.content-layout { display: flex; gap: 20px; align-items: flex-start; }

.legend-sidebar {
  width: 140px; flex-shrink: 0; background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light); border-radius: 8px;
  padding: 16px 14px; position: sticky; top: 20px;
}
.legend-title { font-size: 13px; font-weight: 700; color: var(--el-text-color-secondary); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--el-border-color-light); }
.legend-list { display: flex; flex-direction: column; gap: 10px; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--el-text-color-secondary); }
.legend-dot { display: inline-block; width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0; }
.dot-c { background: var(--el-color-primary); }
.dot-nai { background: #d4890a; }
.dot-qun { background: var(--el-color-success); }
.dot-hun { background: #8b5cf6; }
.dot-sun { background: #16a34a; }
.dot-fill { background: #909399; }
.legend-order { margin-top: 4px; }
.order-title { font-size: 12px; font-weight: 700; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.order-item { font-size: 12px; color: var(--el-text-color-placeholder); line-height: 1.8; }
.order-arrow { font-size: 10px; }

.table-area { flex: 1; min-width: 0; }
.data-table :deep(.el-table__header th) { font-weight: 700; background: var(--el-fill-color-lighter); font-size: 12px; padding: 4px 2px !important; }

.data-cell { display: inline-block; padding: 2px 8px; border-radius: 4px; line-height: 1.4; }
.bg-c { background: rgba(64, 158, 255, 0.12); }
.bg-nai { background: rgba(212, 137, 10, 0.12); }
.bg-qun { background: rgba(103, 194, 58, 0.12); }
.bg-hun { background: rgba(139, 92, 246, 0.12); }
.bg-sun { background: rgba(22, 163, 74, 0.12); }
.bg-fill { background: rgba(144, 147, 153, 0.08); }
.data-val { font-family: 'Courier New', monospace; font-size: 12px; font-weight: 600; }
.color-fill { color: #909399; }
.data-table :deep(.el-table__body td) { padding: 4px 2px !important; }
.color-c { color: var(--el-color-danger); font-size: 15px; font-weight: 800; }
.cell-lowest { background-color: #fde8e8; padding: 2px 6px; border-radius: 4px; }
.color-nai { color: #d4890a; }
.color-nai-m { color: var(--el-color-danger); font-weight: 700; }
.color-qun { color: var(--el-color-success); }
.color-hun { color: #8b5cf6; }
.color-sun { color: #16a34a; }
.val-empty { color: var(--el-text-color-placeholder); font-weight: 400; }

.cell-total { font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; color: var(--el-text-color-secondary); }
.total-zero { color: var(--el-text-color-placeholder); font-weight: 400; }
</style>
