<template>
  <div class="page-container">
    <NavBar />

    <div class="main-content">
      <el-card>
        <template #header>
          <div class="card-header">
            <span>{{ content.title }}</span>
            <el-tag type="primary" effect="plain">v1.0.0</el-tag>
          </div>
        </template>

        <el-descriptions :column="1" border>
          <el-descriptions-item :label="content.labels.project">
            Game Project
          </el-descriptions-item>
          <el-descriptions-item :label="content.labels.tech">
            <el-space wrap>
              <el-tag>Vue 3</el-tag>
              <el-tag type="success">TypeScript</el-tag>
              <el-tag type="warning">Vite</el-tag>
              <el-tag type="danger">Element Plus</el-tag>
              <el-tag type="info">Pinia</el-tag>
            </el-space>
          </el-descriptions-item>
          <el-descriptions-item :label="content.labels.description">
            {{ content.description }}
          </el-descriptions-item>
          <el-descriptions-item :label="content.labels.store">
            <el-button type="primary" plain @click="showStoreInfo">
              {{ content.buttons.viewState }}
            </el-button>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 状态展示 -->
        <el-divider>{{ content.stateTitle }}</el-divider>

        <el-row :gutter="16">
          <el-col :span="8">
            <el-card shadow="never" class="state-card">
              <div class="state-item">
                <div class="state-label">{{ content.labels.language }}</div>
                <div class="state-value">
                  <el-switch
                    v-model="localLanguage"
                    active-text="中文"
                    inactive-text="EN"
                    @change="appStore.toggleLanguage()"
                  />
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="never" class="state-card">
              <div class="state-item">
                <div class="state-label">{{ content.labels.theme }}</div>
                <div class="state-value">
                  <el-switch
                    :model-value="appStore.isDark"
                    active-text="暗色"
                    inactive-text="亮色"
                    @change="appStore.toggleTheme()"
                  />
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="never" class="state-card">
              <div class="state-item">
                <div class="state-label">{{ content.labels.sidebar }}</div>
                <div class="state-value">
                  {{ appStore.sidebarCollapsed ? '已折叠' : '已展开' }}
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'

const appStore = useAppStore()
const localLanguage = ref(appStore.language === 'zh')

const content = computed(() =>
  appStore.language === 'zh'
    ? {
        title: '关于项目',
        labels: {
          project: '项目名称',
          tech: '技术栈',
          description: '项目描述',
          store: '状态管理',
          language: '语言',
          theme: '主题',
          sidebar: '侧边栏',
        },
        buttons: {
          viewState: '查看状态详情',
        },
        description:
          '基于 Vue 3 + TypeScript + Vite + Element Plus + Pinia 构建的现代化前端项目模板，提供完整的类型安全、状态管理和路由方案。',
        stateTitle: '当前应用状态',
      }
    : {
        title: 'About Project',
        labels: {
          project: 'Project Name',
          tech: 'Tech Stack',
          description: 'Description',
          store: 'State Management',
          language: 'Language',
          theme: 'Theme',
          sidebar: 'Sidebar',
        },
        buttons: {
          viewState: 'View State',
        },
        description:
          'A modern frontend project template built with Vue 3 + TypeScript + Vite + Element Plus + Pinia, providing complete type safety, state management and routing.',
        stateTitle: 'Current App State',
      }
)

function showStoreInfo() {
  ElMessage.success(
    appStore.language === 'zh'
      ? `当前状态：语言=${appStore.language}，主题=${appStore.theme}，侧边栏=${appStore.sidebarCollapsed ? '折叠' : '展开'}`
      : `State: lang=${appStore.language}, theme=${appStore.theme}, sidebar=${appStore.sidebarCollapsed ? 'collapsed' : 'expanded'}`
  )
}
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.state-card {
  text-align: center;
}

.state-item {
  padding: 8px;
}

.state-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.state-value {
  font-size: 16px;
  font-weight: 600;
}
</style>
