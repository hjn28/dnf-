<template>
  <el-menu
    :default-active="route.path"
    mode="horizontal"
    :ellipsis="false"
    class="nav-bar"
    @select="handleSelect"
  >
    <el-menu-item index="/">
      <el-icon><HomeFilled /></el-icon>
      <span>首页</span>
    </el-menu-item>
    <el-menu-item index="/about">
      <el-icon><InfoFilled /></el-icon>
      <span>关于</span>
    </el-menu-item>
    <el-menu-item index="/damage-sim">
      <el-icon><DataAnalysis /></el-icon>
      <span>伤害模拟</span>
    </el-menu-item>

    <div class="flex-grow" />

    <el-menu-item index="language" @click="appStore.toggleLanguage">
      <el-icon><ChatDotRound /></el-icon>
      <span>{{ appStore.language === 'zh' ? 'EN' : '中文' }}</span>
    </el-menu-item>

    <el-menu-item index="theme" @click="appStore.toggleTheme">
      <el-icon>
        <MoonNight v-if="appStore.isDark" />
        <Sunny v-else />
      </el-icon>
      <span>{{ appStore.isDark ? '亮色' : '暗色' }}</span>
    </el-menu-item>
  </el-menu>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { DataAnalysis } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()

function handleSelect(index: string) {
  if (index === 'language' || index === 'theme') return
  router.push(index)
}
</script>

<style scoped>
.nav-bar {
  padding: 0 24px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.flex-grow {
  flex-grow: 1;
}
</style>
