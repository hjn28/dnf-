import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 计数器状态管理（示例）
 * 展示 Pinia 的完整用法：state / getter / action
 */
export const useCounterStore = defineStore('counter', () => {
  // ==================== State ====================
  const count = ref(0)
  const history = ref<number[]>([])

  // ==================== Getters ====================
  const doubleCount = computed(() => count.value * 2)
  const previousCount = computed(() =>
    history.value.length > 0
      ? history.value[history.value.length - 1]
      : null
  )

  // ==================== Actions ====================
  function increment() {
    history.value.push(count.value)
    count.value++
  }

  function decrement() {
    history.value.push(count.value)
    count.value--
  }

  function reset() {
    history.value.push(count.value)
    count.value = 0
  }

  function addBy(amount: number) {
    history.value.push(count.value)
    count.value += amount
  }

  /** 异步 action 示例 */
  async function incrementAsync(delay: number = 1000) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    increment()
  }

  return {
    // state
    count,
    history,
    // getters
    doubleCount,
    previousCount,
    // actions
    increment,
    decrement,
    reset,
    addBy,
    incrementAsync,
  }
})
