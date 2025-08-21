export function connectWS(onMessage, onOpen, onClose) {
  const url = process.env.NEXT_PUBLIC_WS_URL;
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_WS_URL env var');
  }
  const ws = new WebSocket(url);
  ws.onopen = onOpen || (() => {});
  ws.onclose = onClose || (() => {});
  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      onMessage?.(data);
    } catch (e) {
      console.error('Invalid message', evt.data);
    }
  };
  return ws;
}
