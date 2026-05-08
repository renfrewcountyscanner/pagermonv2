import { ref, onUnmounted } from 'vue'

export function useSocket(namespace) {
  const connected = ref(false)
  let socket = null

  function connect(onMessage) {
    if (!window.io) return
    const url = namespace ? `/${namespace}` : '/'
    socket = window.io(url)

    socket.on('connect', () => { connected.value = true })
    socket.on('disconnect', () => { connected.value = false })
    socket.on('messagePost', (data) => onMessage(data))
  }

  function disconnect() {
    if (socket) {
      socket.disconnect()
      socket = null
    }
  }

  onUnmounted(disconnect)

  return { connected, connect, disconnect }
}
