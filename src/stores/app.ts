import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 应用全局状态管理
 * - 语言切换
 * - 主题切换
 * - 侧边栏状态
 */
export const useAppStore = defineStore('app', () => {
  // ==================== State ====================
  const language = ref<'zh' | 'en'>('zh')
  const sidebarCollapsed = ref(false)
  const theme = ref<'light' | 'dark'>('light')

  // ==================== Getters ====================
  const currentLanguage = computed(() => language.value)
  const isDark = computed(() => theme.value === 'dark')

  // ==================== Actions ====================
  function toggleLanguage() {
    language.value = language.value === 'zh' ? 'en' : 'zh'
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', theme.value === 'dark')
  }

  function setTheme(newTheme: 'light' | 'dark') {
    theme.value = newTheme
    document.documentElement.classList.toggle('dark', theme.value === 'dark')
  }

  return {
    // state
    language,
    sidebarCollapsed,
    theme,
    // getters
    currentLanguage,
    isDark,
    // actions
    toggleLanguage,
    toggleSidebar,
    toggleTheme,
    setTheme,
  }
})
