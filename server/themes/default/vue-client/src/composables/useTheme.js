import { ref } from 'vue'

const isDark = ref(false)

export function useTheme() {
  function setDark(value) {
    isDark.value = value
    const theme = value ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-bs-theme', theme)
    if (theme === 'dark') {
      document.documentElement.style.colorScheme = 'dark'
    } else {
      document.documentElement.style.colorScheme = ''
    }
  }

  function toggleDark() {
    setDark(!isDark.value)
  }

  function initTheme() {
    const saved = localStorage.getItem('pm-theme') || 'light'
    setDark(saved === 'dark')
  }

  // Convert near-black colors to white in dark mode so they stay visible.
  function themeAwareColor(color) {
    if (!color || !isDark.value) return color
    const c = String(color).toLowerCase().replace(/\s/g, '')
    if (
      c === 'black' ||
      c === '#000' ||
      c === '#000000' ||
      c === 'rgb(0,0,0)' ||
      c === 'rgba(0,0,0,1)'
    ) {
      return '#ffffff'
    }
    return color
  }

  return {
    isDark,
    setDark,
    toggleDark,
    initTheme,
    themeAwareColor
  }
}
