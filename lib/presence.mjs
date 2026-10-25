const activeClients = new Map();

export function registerClient(id) {
  if (!id) return;
  activeClients.set(String(id), Date.now());
}

export function unregisterClient(id) {
  if (!id) return;
  activeClients.delete(String(id));
}

export function getAudienceCount(now = Date.now()) {
  const cutoff = now - 35000;
  for (const [key, timestamp] of activeClients) {
    if (timestamp < cutoff) activeClients.delete(key);
  }
  // Strictly real connected visitors (at least 1 for the current viewer)
  return Math.max(1, activeClients.size);
}

export function getBrasiliaTime(now = Date.now()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(now));
}

export function getPresenceData(clientId, isLeaving = false) {
  const now = Date.now();
  if (clientId) {
    if (isLeaving) {
      unregisterClient(clientId);
    } else {
      registerClient(clientId);
    }
  }

  const count = getAudienceCount(now);
  return {
    count,
    activeClients: activeClients.size,
    timestamp: now,
    brasiliaTime: getBrasiliaTime(now)
  };
}
