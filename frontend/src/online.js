// WebSocket client for online matchmaking. The server owns the game:
// we only send "join" and "move", and render whatever it broadcasts back.
export function lobbyUrl(loc = window.location) {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/api/ws`;
}

/**
 * Opens a lobby connection and joins the queue as `name`.
 * onMessage receives every server message, plus {type:'closed'} if the connection drops.
 */
export function connectLobby(name, onMessage) {
  const ws = new WebSocket(lobbyUrl());
  const send = (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

  ws.onopen = () => send({ type: 'join', name });
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => onMessage({ type: 'closed' });

  return {
    move: (index) => send({ type: 'move', index }),
    close: () => {
      ws.onclose = null;
      ws.onmessage = null;
      ws.close();
    },
  };
}
