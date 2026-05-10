import { ref, onUnmounted } from 'vue'

export function useSocket(namespace) {
  const connected = ref(false)
  let socket = null
  let reconnectTimer = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  const BASE_RECONNECT_DELAY = 2000

  function connect(onMessage) {
    if (!window.io) return
    if (socket) return

    const url = namespace ? `/${namespace}` : '/'
    socket = window.io(url, {
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: BASE_RECONNECT_DELAY,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5
    })

    socket.on('connect', () => {
      connected.value = true
      reconnectAttempts = 0
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    })

    socket.on('disconnect', (reason) => {
      connected.value = false
      if (reason === 'io server disconnect') {
        // Server forcefully closed the connection, try reconnecting manually
        scheduleReconnect(onMessage)
      }
    })

    socket.on('connect_error', () => {
      connected.value = false
    })

    socket.on('messagePost', (data) => onMessage(data))
  }

  function scheduleReconnect(onMessage) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return
    reconnectAttempts++
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 30000)
    reconnectTimer = setTimeout(() => {
      disconnect()
      connect(onMessage)
    }, delay)
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (socket) {
      socket.disconnect()
      socket = null
    }
    connected.value = false
  }

  onUnmounted(disconnect)

  return { connected, connect, disconnect }
}
