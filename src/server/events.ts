import type { Response } from "express";

type EventPayload = Record<string, unknown>;

const clients = new Set<Response>();
let sequence = 0;

export function addEventClient(response: Response): void {
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

export function publishEvent(event: string, data: EventPayload): void {
  sequence += 1;
  const message = `id: ${sequence}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(message);
}

export function publishHeartbeat(): void {
  for (const client of clients) client.write(": heartbeat\n\n");
}

export function eventClientCount(): number {
  return clients.size;
}

export function closeEventClients(): void {
  for (const client of clients) client.end();
  clients.clear();
}
