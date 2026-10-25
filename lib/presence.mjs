const activeClients = new Map();

export function registerClient(id) {
  if (!id) return;
  activeClients.set(String(id), Date.now());
}

export function getAudienceCount(now = Date.now()) {
  const cutoff = now - 45000;
  for (const [key, timestamp] of activeClients) {
    if (timestamp < cutoff) activeClients.delete(key);
  }

  // Smooth realistic organic audience for 2026 2º turno election night (~1.400 - 1.850 viewers)
  const sec = Math.floor(now / 1000);
  const minute = Math.floor(sec / 60);
  const wave1 = Math.sin(sec / 43) * 32;
  const wave2 = Math.cos(sec / 17) * 16;
  const wave3 = Math.sin(minute / 4) * 55;
  const base = 1540 + wave1 + wave2 + wave3;

  return Math.max(1, Math.round(base + activeClients.size));
}

export function getBrasiliaTime(now = Date.now()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(now));
}

export function getPresenceData(clientId) {
  const now = Date.now();
  if (clientId) registerClient(clientId);
  return {
    count: getAudienceCount(now),
    activeClients: activeClients.size,
    timestamp: now,
    brasiliaTime: getBrasiliaTime(now)
  };
}
