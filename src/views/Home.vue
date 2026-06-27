<template>
  <div class="page-container">
    <NavBar />

    <div class="main-content">
      <!-- 欢迎区域 -->
      <el-card class="welcome-card">
        <div class="welcome-content">
          <el-icon class="welcome-icon" :size="64" color="#409eff">
            <Monitor />
          </el-icon>
          <h1 class="welcome-title">{{ welcomeTitle }}</h1>
          <p class="welcome-desc">
            Vue 3 + TypeScript + Vite + Element Plus + Pinia
          </p>
          <el-divider />
          <el-space>
            <el-tag type="primary" effect="dark">Vue 3.4</el-tag>
            <el-tag type="success" effect="dark">TypeScript 5.4</el-tag>
            <el-tag type="warning" effect="dark">Vite 5</el-tag>
            <el-tag type="danger" effect="dark">Element Plus 2.6</el-tag>
            <el-tag type="info" effect="dark">Pinia 2.1</el-tag>
          </el-space>
        </div>
      </el-card>

      <!-- 计数器示例 -->
      <div class="mt-24">
        <CounterCard />
      </div>

      <!-- 特性展示 -->
      <div class="feature-grid mt-24">
        <el-card shadow="hover" v-for="feature in features" :key="feature.title">
          <div class="feature-item">
            <el-icon :size="36" :color="feature.color">
              <component :is="feature.icon" />
            </el-icon>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.desc }}</p>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  Monitor,
  Lightning,
  CollectionTag,
  Connection,
  DataAnalysis,
  Promotion,
} from '@element-plus/icons-vue'

const appStore = useAppStore()

const welcomeTitle = computed(() =>
  appStore.language === 'zh' ? '欢迎使用 Game Project' : 'Welcome to Game Project'
)

const features = computed(() =>
  appStore.language === 'zh'
    ? [
        {
          icon: Lightning,
          title: 'Vue 3 组合式 API',
          desc: '采用 Composition API + <script setup> 语法，逻辑复用更灵活',
          color: '#409eff',
        },
        {
          icon: CollectionTag,
          title: 'TypeScript 支持',
          desc: '全栈类型安全，更好的开发体验与代码维护性',
          color: '#3178c6',
        },
        {
          icon: Connection,
          title: 'Vite 构建工具',
          desc: '极速启动，热更新毫秒级响应，构建效率拉满',
          color: '#646cff',
        },
        {
          icon: DataAnalysis,
          title: 'Pinia 状态管理',
          desc: '轻量、类型安全的状态管理方案，支持 devtools',
          color: '#ffd43b',
        },
        {
          icon: Promotion,
          title: 'Element Plus',
          desc: '基于 Vue 3 的企业级 UI 组件库，开箱即用',
          color: '#409eff',
        },
      ]
    : [
        {
          icon: Lightning,
          title: 'Vue 3 Composition API',
          desc: 'Composition API + <script setup> for better logic reuse',
          color: '#409eff',
        },
        {
          icon: CollectionTag,
          title: 'TypeScript',
          desc: 'End-to-end type safety and better developer experience',
          color: '#3178c6',
        },
        {
          icon: Connection,
          title: 'Vite',
          desc: 'Lightning-fast HMR and optimized builds',
          color: '#646cff',
        },
        {
          icon: DataAnalysis,
          title: 'Pinia',
          desc: 'Lightweight, type-safe state management with devtools',
          color: '#ffd43b',
        },
        {
          icon: Promotion,
          title: 'Element Plus',
          desc: 'Enterprise-grade Vue 3 component library',
          color: '#409eff',
        },
      ]
)
</script>

<style scoped>
.welcome-card {
  text-align: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
}

.welcome-card :deep(.el-card__body) {
  padding: 48px 24px;
}

.welcome-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.welcome-icon {
  filter: drop-shadow(0 4px 12px rgba(255, 255, 255, 0.3));
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  color: #fff;
}

.welcome-desc {
  font-size: 16px;
  opacity: 0.85;
  margin: 0;
  color: #fff;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.feature-item {
  text-align: center;
  padding: 16px 8px;
}

.feature-item h3 {
  margin: 12px 0 8px;
  font-size: 18px;
}

.feature-item p {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
</style>
