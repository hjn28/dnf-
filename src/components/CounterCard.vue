<template>
  <el-card class="counter-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>Pinia 计数器示例</span>
        <el-tag type="info" size="small">状态管理</el-tag>
      </div>
    </template>

    <div class="counter-body">
      <el-statistic
        :value="counterStore.count"
        title="当前计数"
      />

      <div class="counter-actions">
        <el-button
          type="primary"
          :icon="Plus"
          @click="counterStore.increment"
          round
        >
          增加
        </el-button>

        <el-button
          type="danger"
          :icon="Minus"
          @click="counterStore.decrement"
          round
        >
          减少
        </el-button>

        <el-button
          type="warning"
          :icon="Refresh"
          @click="counterStore.reset"
          round
        >
          重置
        </el-button>
      </div>

      <div class="counter-actions mt-16">
        <el-button
          type="success"
          plain
          @click="counterStore.addBy(5)"
        >
          +5
        </el-button>

        <el-button
          type="success"
          plain
          @click="counterStore.addBy(10)"
        >
          +10
        </el-button>

        <el-button
          type="primary"
          plain
          :loading="loading"
          @click="handleAsyncIncrement"
        >
          异步 +1（1秒延迟）
        </el-button>
      </div>

      <el-divider />

      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="双倍值">
          <el-tag type="success">{{ counterStore.doubleCount }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="上一个值">
          <el-tag type="info">{{ counterStore.previousCount ?? '无' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="历史记录">
          <el-space wrap>
            <el-tag
              v-for="(val, idx) in counterStore.history.slice(-5)"
              :key="idx"
              size="small"
              type="warning"
            >
              {{ val }}
            </el-tag>
            <span v-if="counterStore.history.length === 0" class="text-muted">
              暂无记录
            </span>
          </el-space>
        </el-descriptions-item>
        <el-descriptions-item label="操作次数">
          {{ counterStore.history.length }}
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Minus, Refresh } from '@element-plus/icons-vue'
import { useCounterStore } from '@/stores/counter'

const counterStore = useCounterStore()
const loading = ref(false)

async function handleAsyncIncrement() {
  loading.value = true
  await counterStore.incrementAsync(1000)
  loading.value = false
}
</script>

<style scoped>
.counter-card {
  max-width: 600px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.counter-body {
  text-align: center;
}

.counter-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.text-muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
